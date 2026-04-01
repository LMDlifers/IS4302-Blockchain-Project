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
        string  ipfsCID;
        LeaseState state;
        uint256 amountToLandlord;
    }

    IERC20 public usdc;
    address public feeAddress;
    uint256 public leaseCounter;
    mapping(uint256 => Lease) public leases;
    address[] public verifierPool;
    mapping(uint256 => uint256) public pendingProposal;

    event LeaseInitialized(uint256 leaseId, address landlord, address tenant, string cid);
    event FundsDeposited(uint256 leaseId, uint256 amount);
    event DisputeRaised(uint256 leaseId, address verifier);
    event DisputeResolved(uint256 leaseId, uint256 toLandlord, uint256 toTenant);
    event LeaseReleased(uint256 leaseId, uint256 toLandlord, uint256 toTenant);
    event LeaseRefunded(uint256 leaseId, uint256 toTenant);

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

    function initializeLease(
        address tenant,
        uint256 depositAmount,
        uint256 deadline,
        uint256 gracePeriod,
        string calldata ipfsCID
    ) external returns (uint256 leaseId) {
        require(deadline > block.timestamp, "Deadline in past");
        require(depositAmount > 0, "Zero deposit");
        
        uint256 stake = depositAmount / 5; // 20% stake requirement
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
            ipfsCID: ipfsCID,
            state: LeaseState.CREATED,
            amountToLandlord: 0
        });
        
        emit LeaseInitialized(leaseId, msg.sender, tenant, ipfsCID);
        return leaseId;
    }

    // ========== DEPOSIT FUNDS (Tenant) ==========

    /**
     * @dev Tenant deposits funds into escrow.
     * Moves lease from CREATED → LOCKED.
     * Requires prior ERC-20 approval.
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

    // ========== VERIFIER POOL MANAGEMENT (onlyOwner) ==========

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

    // ========== SCENARIO A: MUTUAL RELEASE (Happy Path) ==========

    /**
     * @dev Landlord proposes a split of the deposit.
     * State remains LOCKED until tenant accepts.
     */
    function proposeRelease(uint256 leaseId, uint256 amountToLandlord)
        external
        onlyLandlord(leaseId)
        inState(leaseId, LeaseState.LOCKED)
    {
        Lease storage l = leases[leaseId];
        require(amountToLandlord <= l.depositAmount, "Exceeds deposit");
        l.amountToLandlord = amountToLandlord;
        pendingProposal[leaseId] = amountToLandlord;
    }

    /**
     * @dev Tenant accepts the landlord's proposed split.
     * Funds are transferred: landlord gets deposit split + stake back,
     * tenant gets the remainder.
     * State: LOCKED → RELEASED
     */
    function acceptRelease(uint256 leaseId)
        external
        onlyTenant(leaseId)
        inState(leaseId, LeaseState.LOCKED)
        nonReentrant
    {
        Lease storage l = leases[leaseId];
        require(l.amountToLandlord > 0 || pendingProposal[leaseId] == 0, "No proposal");

        uint256 toLandlord = l.amountToLandlord + l.landlordStake;
        uint256 toTenant = l.depositAmount - l.amountToLandlord;

        l.state = LeaseState.RELEASED;

        emit LeaseReleased(leaseId, toLandlord, toTenant);

        // Checks-Effects-Interactions: state updated before transfers
        require(usdc.transfer(l.landlord, toLandlord), "Landlord transfer failed");
        require(usdc.transfer(l.tenant, toTenant), "Tenant transfer failed");
    }

    // ========== SCENARIO B: TIMEOUT / NO-SHOW REFUND ==========

    /**
     * @dev Anyone can call this after deadline + grace period expires.
     * Tenant gets full deposit back, landlord's stake is slashed to feeAddress.
     * State: LOCKED → REFUNDED
     */
    function timeoutRefund(uint256 leaseId)
        external
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

        // Checks-Effects-Interactions: state updated before transfers
        require(usdc.transfer(l.tenant, deposit), "Tenant refund failed");
        require(usdc.transfer(feeAddress, stake), "Stake slash failed");
    }

    // ========== SCENARIO C: DISPUTE WITH LLM JUDGE ==========

    /**
     * @dev Tenant raises a dispute. A verifier is randomly assigned.
     * State: LOCKED → DISPUTED
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
     * @dev Internal function to assign a verifier from the pool.
     * WARNING: Uses block.timestamp-based pseudo-randomness.
     * For production, use Chainlink VRF.
     */
    function _assignVerifier(uint256 leaseId) internal view returns (address) {
        require(verifierPool.length > 0, "No verifiers in pool");
        uint256 idx = uint256(
            keccak256(abi.encodePacked(block.timestamp, leaseId, msg.sender))
        ) % verifierPool.length;
        return verifierPool[idx];
    }

    /**
     * @dev Verifier submits the LLM verdict, splitting the deposit.
     * State: DISPUTED → RELEASED
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

        // Checks-Effects-Interactions: state updated before transfers
        require(usdc.transfer(l.landlord, toLandlord), "Landlord transfer failed");
        require(usdc.transfer(l.tenant, toTenant), "Tenant transfer failed");
    }
}