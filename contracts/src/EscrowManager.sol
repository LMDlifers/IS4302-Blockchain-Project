// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EscrowManager is ReentrancyGuard, Ownable {
    enum LeaseState { CREATED, LOCKED, DISPUTED, RELEASED, REFUNDED }

    struct Lease {
        address landlord;
        address tenant;
        address verifier;
        uint256 depositAmount;
        uint256 landlordStake;
        uint256 deadline;
        uint256 gracePeriod;
        string  moveInCID;    // IPFS CID for move-in metadata (photos + lease doc)
        string  moveOutCID;   // IPFS CID for move-out claim (damage photos + description)
        LeaseState state;
        uint256 amountToLandlord;
    }

    IERC20 public usdc;
    address public feeAddress;
    uint256 public leaseCounter;
    mapping(uint256 => Lease) public leases;
    address[] public verifierPool;

    // Fix 1.6: track whether a proposal has been made to prevent re-proposals
    mapping(uint256 => bool) public releaseProposed;

    // Fix 1.1 & 1.2: AI arbitration tracking
    mapping(uint256 => string) public aiVerdictCIDs;
    mapping(uint256 => bool) public tenantAgreedAI;
    mapping(uint256 => bool) public landlordAgreedAI;
    mapping(uint256 => bool) public verdictSubmitted;  // Fix 1.1: prevent mid-flow overwrite
    mapping(uint256 => bool) public humanEscalated;    // Fix 1.2: track escalation state

    // Events
    event LeaseInitialized(uint256 leaseId, address landlord, address tenant, string moveInCID);
    event FundsDeposited(uint256 leaseId, uint256 amount);
    event ReleaseProposed(uint256 leaseId, uint256 amountToLandlord, string moveOutCID); // Fix 1.6: new event
    event DisputeRaised(uint256 leaseId, address verifier);
    event DisputeResolved(uint256 leaseId, uint256 toLandlord, uint256 toTenant);
    event LeaseReleased(uint256 leaseId, uint256 toLandlord, uint256 toTenant);
    event LeaseRefunded(uint256 leaseId, uint256 toTenant);
    event MoveOutCIDSet(uint256 leaseId, string moveOutCID);
    event AIVerdictSubmitted(uint256 leaseId, uint256 amountToLandlord, string verdictCID);
    event HumanEscalationRequested(uint256 leaseId, address requestedBy);
    event HumanVerifierAssigned(uint256 leaseId, address humanVerifier);

    modifier onlyLandlord(uint256 id) {
        require(msg.sender == leases[id].landlord, "Not landlord");
        _;
    }

    modifier onlyTenant(uint256 id) {
        require(msg.sender == leases[id].tenant, "Not tenant");
        _;
    }

    modifier onlyVerifier(uint256 id) {
        require(msg.sender == leases[id].verifier, "Not verifier");
        _;
    }

    modifier inState(uint256 id, LeaseState s) {
        require(leases[id].state == s, "Wrong state");
        _;
    }

    constructor(address _usdcAddress, address _feeAddress) Ownable(msg.sender) {
        require(_usdcAddress != address(0), "Invalid USDC address");
        require(_feeAddress != address(0), "Invalid fee address");
        usdc = IERC20(_usdcAddress);
        feeAddress = _feeAddress;
    }

    // Fix 1.3: added nonReentrant; Fix 1.8: zero-stake guard
    function initializeLease(
        address tenant,
        uint256 depositAmount,
        uint256 deadline,
        uint256 gracePeriod,
        string calldata moveInCID
    ) external nonReentrant returns (uint256 leaseId) {
        require(deadline > block.timestamp, "Deadline in past");
        require(depositAmount > 0, "Zero deposit");

        uint256 stake = depositAmount / 5;
        require(stake > 0, "Deposit too small for valid stake"); // Fix 1.8

        require(usdc.transferFrom(msg.sender, address(this), stake), "Stake transfer failed");

        leaseId = ++leaseCounter;
        leases[leaseId] = Lease({
            landlord: msg.sender,
            tenant: tenant,
            verifier: address(0),
            depositAmount: depositAmount,
            landlordStake: stake,
            deadline: deadline,
            gracePeriod: gracePeriod,
            moveInCID: moveInCID,
            moveOutCID: "",
            state: LeaseState.CREATED,
            amountToLandlord: 0
        });

        emit LeaseInitialized(leaseId, msg.sender, tenant, moveInCID);
        return leaseId;
    }

    function depositFunds(uint256 leaseId)
        external
        onlyTenant(leaseId)
        inState(leaseId, LeaseState.CREATED)
        nonReentrant
    {
        Lease storage l = leases[leaseId];
        require(block.timestamp < l.deadline, "Lease expired");
        require(
            usdc.transferFrom(msg.sender, address(this), l.depositAmount),
            "Deposit transfer failed"
        );
        l.state = LeaseState.LOCKED;
        emit FundsDeposited(leaseId, l.depositAmount);
    }

    function addVerifier(address v) external onlyOwner {
        require(v != address(0), "Invalid verifier address");
        verifierPool.push(v);
    }

    function removeVerifier(address v) external onlyOwner {
        for (uint256 i = 0; i < verifierPool.length; i++) {
            if (verifierPool[i] == v) {
                verifierPool[i] = verifierPool[verifierPool.length - 1];
                verifierPool.pop();
                break;
            }
        }
    }

    // ========== SCENARIO A: MUTUAL RELEASE ==========

    /**
     * @dev Landlord proposes a split AND uploads move-out evidence CID.
     * Fix 1.6: proposal is now one-time only (prevents landlord from changing terms
     *          after tenant has seen the offer).
     */
    function proposeRelease(
        uint256 leaseId,
        uint256 amountToLandlord,
        string calldata moveOutCID
    )
        external
        onlyLandlord(leaseId)
        inState(leaseId, LeaseState.LOCKED)
    {
        // Fix 1.6: prevent re-proposal after tenant has seen the offer
        require(!releaseProposed[leaseId], "Release already proposed");
        Lease storage l = leases[leaseId];
        require(amountToLandlord <= l.depositAmount, "Exceeds deposit");

        l.amountToLandlord = amountToLandlord;
        l.moveOutCID = moveOutCID;
        releaseProposed[leaseId] = true;

        emit MoveOutCIDSet(leaseId, moveOutCID);
        emit ReleaseProposed(leaseId, amountToLandlord, moveOutCID); // Fix 1.6: new event
    }

    // Fix 1.4: added nonReentrant (was commented out)
    function acceptRelease(uint256 leaseId)
        external
        onlyTenant(leaseId)
        inState(leaseId, LeaseState.LOCKED)
        nonReentrant
    {
        Lease storage l = leases[leaseId];

        require(bytes(l.moveOutCID).length > 0, "Landlord has not proposed a release yet");

        uint256 toLandlord = l.amountToLandlord + l.landlordStake;
        uint256 toTenant = l.depositAmount - l.amountToLandlord;

        l.state = LeaseState.RELEASED;

        emit LeaseReleased(leaseId, toLandlord, toTenant);

        require(usdc.transfer(l.landlord, toLandlord), "Landlord transfer failed");
        require(usdc.transfer(l.tenant, toTenant), "Tenant transfer failed");
    }

    // ========== SCENARIO B: TIMEOUT REFUND ==========

    // Fix 1.5: added onlyTenant so only the tenant can trigger their own refund
    function timeoutRefund(uint256 leaseId)
        external
        onlyTenant(leaseId)
        inState(leaseId, LeaseState.LOCKED)
        nonReentrant
    {
        Lease storage l = leases[leaseId];
        require(
            block.timestamp > l.deadline + l.gracePeriod,
            "Grace period not expired"
        );

        uint256 deposit = l.depositAmount;
        uint256 stake = l.landlordStake;

        l.state = LeaseState.REFUNDED;

        emit LeaseRefunded(leaseId, deposit);

        require(usdc.transfer(l.tenant, deposit), "Tenant refund failed");
        require(usdc.transfer(feeAddress, stake), "Stake slash failed");
    }

    // ========== SCENARIO C: DISPUTE WITH LLM JUDGE ==========

    function raiseDispute(uint256 leaseId)
        external
        onlyTenant(leaseId)
        inState(leaseId, LeaseState.LOCKED)
    {
        Lease storage l = leases[leaseId];
        l.state = LeaseState.DISPUTED;
        l.verifier = _assignVerifier(leaseId);
        emit DisputeRaised(leaseId, l.verifier);
    }

    // Fix 1.7: prevent verifier from being the landlord or tenant of the same lease
    function _assignVerifier(uint256 leaseId) internal view returns (address) {
        require(verifierPool.length > 0, "No verifiers in pool");
        Lease storage l = leases[leaseId];

        uint256 poolLen = verifierPool.length;
        uint256 startIdx = uint256(
            keccak256(abi.encodePacked(block.timestamp, leaseId, msg.sender))
        ) % poolLen;

        for (uint256 i = 0; i < poolLen; i++) {
            address candidate = verifierPool[(startIdx + i) % poolLen];
            if (candidate != l.landlord && candidate != l.tenant) {
                return candidate;
            }
        }
        revert("No eligible verifier (all verifiers are parties)");
    }

    function resolveDispute(uint256 leaseId, uint256 amountToLandlord)
        external
        onlyVerifier(leaseId)
        inState(leaseId, LeaseState.DISPUTED)
        nonReentrant
    {
        Lease storage l = leases[leaseId];
        require(amountToLandlord <= l.depositAmount, "Exceeds deposit");

        uint256 toLandlord = amountToLandlord + l.landlordStake;
        uint256 toTenant = l.depositAmount - amountToLandlord;

        l.state = LeaseState.RELEASED;

        emit DisputeResolved(leaseId, toLandlord, toTenant);

        require(usdc.transfer(l.landlord, toLandlord), "Landlord transfer failed");
        require(usdc.transfer(l.tenant, toTenant), "Tenant transfer failed");
    }

    // ========== AI ARBITRATION ==========

    /**
     * @dev Verifier (backend) proposes a resolution. Does NOT transfer funds yet.
     * Fix 1.1: cannot overwrite verdict once a party has accepted it.
     *          If no one has accepted yet, a new verdict resets both agreement flags.
     */
    function submitAIVerdict(
        uint256 leaseId,
        uint256 amountToLandlord,
        string calldata verdictCID
    )
        external
        onlyVerifier(leaseId)
        inState(leaseId, LeaseState.DISPUTED)
    {
        // Fix 1.1: block overwrite if at least one party already agreed
        require(
            !verdictSubmitted[leaseId] ||
            (!tenantAgreedAI[leaseId] && !landlordAgreedAI[leaseId]),
            "Verdict already accepted by a party - cannot overwrite"
        );

        Lease storage l = leases[leaseId];
        require(amountToLandlord <= l.depositAmount, "Exceeds deposit");

        // If overwriting a verdict that nobody has accepted yet, reset flags
        if (verdictSubmitted[leaseId]) {
            tenantAgreedAI[leaseId] = false;
            landlordAgreedAI[leaseId] = false;
        }

        l.amountToLandlord = amountToLandlord;
        aiVerdictCIDs[leaseId] = verdictCID;
        verdictSubmitted[leaseId] = true;

        emit AIVerdictSubmitted(leaseId, amountToLandlord, verdictCID);
    }

    /**
     * @dev Tenant and Landlord both call this to agree to the AI's split.
     *      When both have agreed, funds are automatically transferred.
     */
    function acceptAIVerdict(uint256 leaseId)
        external
        inState(leaseId, LeaseState.DISPUTED)
        nonReentrant
    {
        Lease storage l = leases[leaseId];
        require(msg.sender == l.tenant || msg.sender == l.landlord, "Not party");
        require(bytes(aiVerdictCIDs[leaseId]).length > 0, "No AI verdict yet");

        if (msg.sender == l.tenant) tenantAgreedAI[leaseId] = true;
        if (msg.sender == l.landlord) landlordAgreedAI[leaseId] = true;

        if (tenantAgreedAI[leaseId] && landlordAgreedAI[leaseId]) {
            uint256 toLandlord = l.amountToLandlord + l.landlordStake;
            uint256 toTenant = l.depositAmount - l.amountToLandlord;

            l.state = LeaseState.RELEASED;
            emit DisputeResolved(leaseId, toLandlord, toTenant);

            require(usdc.transfer(l.landlord, toLandlord), "Landlord transfer failed");
            require(usdc.transfer(l.tenant, toTenant), "Tenant transfer failed");
        }
    }

    /**
     * @dev Either party may escalate to a human verifier if they reject the AI verdict.
     * Fix 1.2: sets humanEscalated flag so owner can assign a human verifier.
     */
    function escalateToHuman(uint256 leaseId)
        external
        inState(leaseId, LeaseState.DISPUTED)
    {
        Lease storage l = leases[leaseId];
        require(msg.sender == l.tenant || msg.sender == l.landlord, "Not party");
        humanEscalated[leaseId] = true; // Fix 1.2
        emit HumanEscalationRequested(leaseId, msg.sender);
    }

    /**
     * @dev Owner assigns a human verifier after escalation.
     *      The human can then call resolveDispute() directly.
     * Fix 1.2: unblocks the dispute by replacing the AI verifier address.
     */
    function assignHumanVerifier(uint256 leaseId, address humanVerifier)
        external
        onlyOwner
        inState(leaseId, LeaseState.DISPUTED)
    {
        require(humanEscalated[leaseId], "Dispute not escalated to human");
        require(humanVerifier != address(0), "Invalid verifier address");
        Lease storage l = leases[leaseId];
        require(humanVerifier != l.landlord && humanVerifier != l.tenant, "Verifier conflict");
        l.verifier = humanVerifier;
        emit HumanVerifierAssigned(leaseId, humanVerifier);
    }
}
