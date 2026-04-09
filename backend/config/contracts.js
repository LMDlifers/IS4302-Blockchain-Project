/**
 * Contract configuration
 * ABI must stay in sync with EscrowManager.sol
 */

const ESCROW_ADDRESS = process.env.ESCROW_MANAGER_ADDRESS;

const ESCROW_ABI = [
  // Events — must match Solidity exactly
  "event LeaseInitialized(uint256 leaseId, address landlord, address tenant, string moveInCID)",
  "event FundsDeposited(uint256 leaseId, uint256 amount)",
  "event ReleaseProposed(uint256 leaseId, uint256 amountToLandlord, string moveOutCID)",
  "event DisputeRaised(uint256 leaseId, address verifier)",
  "event DisputeResolved(uint256 leaseId, uint256 toLandlord, uint256 toTenant)",
  "event LeaseReleased(uint256 leaseId, uint256 toLandlord, uint256 toTenant)",
  "event LeaseRefunded(uint256 leaseId, uint256 toTenant)",
  "event MoveOutCIDSet(uint256 leaseId, string moveOutCID)",

  // State read functions
  "function leases(uint256) view returns (address landlord, address tenant, address verifier, uint256 depositAmount, uint256 landlordStake, uint256 deadline, uint256 gracePeriod, string moveInCID, string moveOutCID, uint8 state, uint256 amountToLandlord)",
  "function feeAddress() view returns (address)",
  "function verifierPool(uint256) view returns (address)",
  "function leaseCounter() view returns (uint256)",
  "function releaseProposed(uint256) view returns (bool)",
  "function verdictSubmitted(uint256) view returns (bool)",
  "function humanEscalated(uint256) view returns (bool)",

  // Core write functions
  "function resolveDispute(uint256 leaseId, uint256 amountToLandlord)",
  "function raiseDispute(uint256 leaseId)",
  "function acceptRelease(uint256 leaseId)",
  "function proposeRelease(uint256 leaseId, uint256 amountToLandlord, string moveOutCID)",
  "function timeoutRefund(uint256 leaseId)",
  "function depositFunds(uint256 leaseId)",
  "function initializeLease(address tenant, uint256 depositAmount, uint256 deadline, uint256 gracePeriod, string moveInCID) returns (uint256 leaseId)",

  // AI flow — keep these ONLY if you already added them to EscrowManager.sol
  "event AIVerdictSubmitted(uint256 leaseId, uint256 amountToLandlord, string verdictCID)",
  "event HumanEscalationRequested(uint256 leaseId, address requestedBy)",
  "function aiVerdictCIDs(uint256) view returns (string)",
  "function tenantAgreedAI(uint256) view returns (bool)",
  "function landlordAgreedAI(uint256) view returns (bool)",
  "function submitAIVerdict(uint256 leaseId, uint256 amountToLandlord, string verdictCID)",
  "function acceptAIVerdict(uint256 leaseId)",
  "function escalateToHuman(uint256 leaseId)",
  "function assignHumanVerifier(uint256 leaseId, address humanVerifier)",
  "event HumanVerifierAssigned(uint256 leaseId, address humanVerifier)",
];

module.exports = {
  ESCROW_ADDRESS,
  ESCROW_ABI,
};