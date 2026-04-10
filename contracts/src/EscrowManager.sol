// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EscrowManager
 * @notice Trustless rental deposit escrow governed by a five-state machine:
 *         CREATED → LOCKED → RELEASED | REFUNDED | DISPUTED → RELEASED
 * @dev Landlords stake 20 % of the deposit on creation; tenants deposit 100 %.
 *      Three settlement paths exist:
 *        A) Mutual release   – landlord proposes split, tenant accepts.
 *        B) Timeout refund   – tenant reclaims deposit after deadline + grace period;
 *                              landlord stake is slashed to feeAddress.
 *        C) Dispute          – AI or human verifier resolves the split.
 */
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

    /// @dev Landlord stake = depositAmount / LANDLORD_STAKE_DIVISOR (20 %)
    uint256 private constant LANDLORD_STAKE_DIVISOR = 5;

    IERC20 public usdc;
    address public feeAddress;
    uint256 public leaseCounter;
    mapping(uint256 => Lease) public leases;
    address[] public verifierPool;

    /// @dev True once landlord calls proposeRelease; prevents re-proposal after
    ///      tenant has seen the offer.
    mapping(uint256 => bool) public releaseProposed;

    // AI arbitration state
    mapping(uint256 => string) public aiVerdictCIDs;
    mapping(uint256 => bool) public tenantAgreedAI;
    mapping(uint256 => bool) public landlordAgreedAI;
    /// @dev Prevents overwriting a verdict once a party has accepted.
    mapping(uint256 => bool) public verdictSubmitted;
    /// @dev Set when a party rejects the AI verdict and requests human review.
    mapping(uint256 => bool) public humanEscalated;

    // ── Events ──────────────────────────────────────────────────────────────

    event LeaseInitialized(uint256 leaseId, address landlord, address tenant, string moveInCID);
    event FundsDeposited(uint256 leaseId, uint256 amount);
    /// @dev Emitted when landlord submits a proposed split and move-out evidence.
    event ReleaseProposed(uint256 leaseId, uint256 amountToLandlord, string moveOutCID);
    event DisputeRaised(uint256 leaseId, address verifier);
    event DisputeResolved(uint256 leaseId, uint256 toLandlord, uint256 toTenant);
    event LeaseReleased(uint256 leaseId, uint256 toLandlord, uint256 toTenant);
    event LeaseRefunded(uint256 leaseId, uint256 toTenant);
    /// @dev Emitted alongside ReleaseProposed for listeners that index move-out CIDs separately.
    event MoveOutCIDSet(uint256 leaseId, string moveOutCID);
    event AIVerdictSubmitted(uint256 leaseId, uint256 amountToLandlord, string verdictCID);
    event HumanEscalationRequested(uint256 leaseId, address requestedBy);
    event HumanVerifierAssigned(uint256 leaseId, address humanVerifier);

    // ── Custom errors ───────────────────────────────────────────────────────

    /// @dev Reverted by _assignVerifier when every pooled address is a party to the lease.
    error NoEligibleVerifier();

    // ── Modifiers ───────────────────────────────────────────────────────────

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

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(address _usdcAddress, address _feeAddress) Ownable(msg.sender) {
        require(_usdcAddress != address(0), "Invalid USDC address");
        require(_feeAddress != address(0), "Invalid fee address");
        usdc = IERC20(_usdcAddress);
        feeAddress = _feeAddress;
    }

    // ── Verifier pool management ────────────────────────────────────────────

    /**
     * @notice Adds an address to the verifier pool (owner only).
     * @param v Address to register as a verifier. Must not be zero or already present.
     */
    function addVerifier(address v) external onlyOwner {
        require(v != address(0), "Invalid verifier address");
        for (uint256 i = 0; i < verifierPool.length; i++) {
            require(verifierPool[i] != v, "Verifier already exists");
        }
        verifierPool.push(v);
    }

    /**
     * @notice Removes an address from the verifier pool (owner only).
     * @param v Address to deregister. Reverts if not found.
     */
    function removeVerifier(address v) external onlyOwner {
        uint256 len = verifierPool.length;
        for (uint256 i = 0; i < len; i++) {
            if (verifierPool[i] == v) {
                verifierPool[i] = verifierPool[len - 1];
                verifierPool.pop();
                return;
            }
        }
        revert("Verifier not found");
    }

    // ── Lease lifecycle ─────────────────────────────────────────────────────

    /**
     * @notice Creates a new lease and transfers the landlord's stake (20 % of deposit) to escrow.
     * @dev    nonReentrant guards against re-entrancy on the USDC transferFrom. Reverts if the
     *         computed stake rounds down to zero (deposit too small).
     * @param tenant        Address of the designated tenant.
     * @param depositAmount Full USDC deposit amount the tenant will owe (6-decimal units).
     * @param deadline      Unix timestamp by which the tenant must deposit; must be in the future.
     * @param gracePeriod   Seconds added to deadline before Scenario B refund becomes claimable.
     * @param moveInCID     IPFS CID of the move-in metadata bundle (photos + lease document).
     * @return leaseId      Incrementing ID assigned to this lease.
     */
    function initializeLease(
        address tenant,
        uint256 depositAmount,
        uint256 deadline,
        uint256 gracePeriod,
        string calldata moveInCID
    ) external nonReentrant returns (uint256 leaseId) {
        require(deadline > block.timestamp, "Deadline in past");
        require(depositAmount > 0, "Zero deposit");

        uint256 stake = depositAmount / LANDLORD_STAKE_DIVISOR;
        require(stake > 0, "Deposit too small for valid stake");

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

    /**
     * @notice Tenant deposits the full rental deposit, activating the lease (CREATED → LOCKED).
     * @param leaseId ID of the lease to fund.
     */
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

    // ── Scenario A: Mutual release ──────────────────────────────────────────

    /**
     * @notice Landlord proposes a deposit split and uploads move-out evidence (one-time only).
     * @dev    Once proposed, the split cannot be changed; tenant must accept or raise a dispute.
     * @param leaseId          ID of the lease.
     * @param amountToLandlord USDC amount the landlord claims for damages (≤ depositAmount).
     * @param moveOutCID       IPFS CID of move-out damage photos and description.
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
        require(!releaseProposed[leaseId], "Release already proposed");
        Lease storage l = leases[leaseId];
        require(amountToLandlord <= l.depositAmount, "Exceeds deposit");

        l.amountToLandlord = amountToLandlord;
        l.moveOutCID = moveOutCID;
        releaseProposed[leaseId] = true;

        emit MoveOutCIDSet(leaseId, moveOutCID);
        emit ReleaseProposed(leaseId, amountToLandlord, moveOutCID);
    }

    /**
     * @notice Tenant accepts the landlord's proposed split, releasing funds to both parties
     *         (LOCKED → RELEASED).
     * @dev    nonReentrant guards USDC transfers. Tenant receives depositAmount − amountToLandlord;
     *         landlord receives amountToLandlord + landlordStake (stake returned on mutual agreement).
     * @param leaseId ID of the lease.
     */
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

    // ── Scenario B: Timeout refund ──────────────────────────────────────────

    /**
     * @notice Tenant claims a full refund after deadline + gracePeriod expires (LOCKED → REFUNDED).
     * @dev    Landlord's stake is slashed to feeAddress as a no-show penalty. nonReentrant guards
     *         both USDC transfers.
     * @param leaseId ID of the lease.
     */
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

    // ── Scenario C: Dispute with LLM / human verifier ──────────────────────

    /**
     * @notice Tenant raises a dispute, transitioning to DISPUTED state and assigning a verifier
     *         from the pool (LOCKED → DISPUTED).
     * @dev    Verifier is selected pseudo-randomly from verifierPool, skipping addresses that are
     *         parties to this lease.
     * @param leaseId ID of the lease.
     */
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

    /**
     * @dev Selects a verifier pseudo-randomly from verifierPool, excluding landlord and tenant.
     *      Reverts with NoEligibleVerifier if all pool members are parties to the lease.
     */
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
        revert NoEligibleVerifier();
    }

    /**
     * @notice Assigned verifier resolves the dispute by specifying the landlord's payout
     *         (DISPUTED → RELEASED).
     * @dev    nonReentrant guards both USDC transfers.
     * @param leaseId          ID of the lease.
     * @param amountToLandlord USDC amount awarded to the landlord (≤ depositAmount).
     */
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

    // ── AI arbitration ──────────────────────────────────────────────────────

    /**
     * @notice Verifier (backend) proposes an AI-generated resolution. Does NOT transfer funds.
     * @dev    Cannot overwrite the verdict once either party has accepted. If neither party has
     *         accepted yet, a new verdict resets both agreement flags.
     * @param leaseId          ID of the lease.
     * @param amountToLandlord Proposed USDC award to the landlord (≤ depositAmount).
     * @param verdictCID       IPFS CID of the AI verdict report.
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
        require(
            !verdictSubmitted[leaseId] ||
            (!tenantAgreedAI[leaseId] && !landlordAgreedAI[leaseId]),
            "Verdict already accepted by a party - cannot overwrite"
        );

        Lease storage l = leases[leaseId];
        require(amountToLandlord <= l.depositAmount, "Exceeds deposit");

        // If overwriting a verdict that nobody has accepted yet, reset flags.
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
     * @notice Tenant and landlord each call this to accept the AI verdict. Funds are released
     *         automatically once both parties have agreed (DISPUTED → RELEASED).
     * @dev    nonReentrant guards the conditional USDC transfers.
     * @param leaseId ID of the lease.
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
     * @notice Either party may escalate to a human verifier if they reject the AI verdict.
     * @dev    Sets humanEscalated flag so the owner can call assignHumanVerifier.
     * @param leaseId ID of the lease.
     */
    function escalateToHuman(uint256 leaseId)
        external
        inState(leaseId, LeaseState.DISPUTED)
    {
        Lease storage l = leases[leaseId];
        require(msg.sender == l.tenant || msg.sender == l.landlord, "Not party");
        humanEscalated[leaseId] = true;
        emit HumanEscalationRequested(leaseId, msg.sender);
    }

    /**
     * @notice Owner assigns a human verifier after escalation. The human can then call
     *         resolveDispute() directly, overriding the AI verdict.
     * @dev    Replaces the existing verifier address; must not be a party to the lease.
     * @param leaseId       ID of the lease.
     * @param humanVerifier Address of the human verifier to assign.
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
