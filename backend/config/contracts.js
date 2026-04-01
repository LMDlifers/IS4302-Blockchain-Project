/**
 * Contract configuration
 * ABI must stay in sync with EscrowManager.sol
 * Check here before any contract call suggestion!
 */

const ESCROW_ADDRESS = process.env.ESCROW_MANAGER_ADDRESS;

const ESCROW_ABI = [
  // Events
  "event LeaseInitialized(uint256 indexed leaseId, address landlord, address tenant, string cid)",
  "event FundsDeposited(uint256 indexed leaseId, uint256 amount)",
  "event DisputeRaised(uint256 indexed leaseId, address verifier)",
  "event DisputeResolved(uint256 indexed leaseId, uint256 toLandlord, uint256 toTenant)",
  "event LeaseReleased(uint256 indexed leaseId, uint256 toLandlord, uint256 toTenant)",
  "event LeaseRefunded(uint256 indexed leaseId, uint256 toTenant)",

  // State read functions
  "function leases(uint256) view returns (address landlord, address tenant, address verifier, uint256 depositAmount, uint256 landlordStake, uint256 deadline, uint256 gracePeriod, string ipfsCID, uint8 state, uint256 amountToLandlord)",
  "function feeAddress() view returns (address)",
  "function verifierPool(uint256) view returns (address)",

  // Write functions
  "function resolveDispute(uint256 leaseId, uint256 amountToLandlord)",
  "function raiseDispute(uint256 leaseId)",
  "function acceptRelease(uint256 leaseId)",
  "function proposeRelease(uint256 leaseId, uint256 amountToLandlord)",
  "function timeoutRefund(uint256 leaseId)",
  "function depositFunds(uint256 leaseId)",
  "function initializeLease(address tenant, uint256 depositAmount, uint256 deadline, uint256 gracePeriod, string ipfsCID) returns (uint256 leaseId)",
];

module.exports = {
  ESCROW_ADDRESS,
  ESCROW_ABI,
};
