/**
 * Contract configuration
 * ABI must stay in sync with EscrowManager.sol
 */

export const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS;
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;

export const ESCROW_ABI = [
  // Events
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "address", name: "landlord", type: "address" }, { indexed: false, internalType: "address", name: "tenant", type: "address" }, { indexed: false, internalType: "string", name: "moveInCID", type: "string" }], name: "LeaseInitialized", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "uint256", name: "amount", type: "uint256" }], name: "FundsDeposited", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "address", name: "verifier", type: "address" }], name: "DisputeRaised", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "uint256", name: "toLandlord", type: "uint256" }, { indexed: false, internalType: "uint256", name: "toTenant", type: "uint256" }], name: "DisputeResolved", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "uint256", name: "toLandlord", type: "uint256" }, { indexed: false, internalType: "uint256", name: "toTenant", type: "uint256" }], name: "LeaseReleased", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "uint256", name: "toTenant", type: "uint256" }], name: "LeaseRefunded", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "leaseId", type: "uint256" }, { indexed: false, internalType: "string", name: "moveOutCID", type: "string" }], name: "MoveOutCIDSet", type: "event" },

  // State getters
  { inputs: [{ internalType: "uint256", name: "", type: "uint256" }], name: "leases", outputs: [{ internalType: "address", name: "landlord", type: "address" }, { internalType: "address", name: "tenant", type: "address" }, { internalType: "address", name: "verifier", type: "address" }, { internalType: "uint256", name: "depositAmount", type: "uint256" }, { internalType: "uint256", name: "landlordStake", type: "uint256" }, { internalType: "uint256", name: "deadline", type: "uint256" }, { internalType: "uint256", name: "gracePeriod", type: "uint256" }, { internalType: "string", name: "moveInCID", type: "string" }, { internalType: "string", name: "moveOutCID", type: "string" }, { internalType: "uint8", name: "state", type: "uint8" }, { internalType: "uint256", name: "amountToLandlord", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "leaseCounter", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },

  // Write functions
  { inputs: [{ internalType: "address", name: "tenant", type: "address" }, { internalType: "uint256", name: "depositAmount", type: "uint256" }, { internalType: "uint256", name: "deadline", type: "uint256" }, { internalType: "uint256", name: "gracePeriod", type: "uint256" }, { internalType: "string", name: "moveInCID", type: "string" }], name: "initializeLease", outputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }], name: "depositFunds", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }, { internalType: "uint256", name: "amountToLandlord", type: "uint256" }, { internalType: "string", name: "moveOutCID", type: "string" }], name: "proposeRelease", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }], name: "acceptRelease", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }], name: "raiseDispute", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }, { internalType: "uint256", name: "amountToLandlord", type: "uint256" }], name: "resolveDispute", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "leaseId", type: "uint256" }], name: "timeoutRefund", outputs: [], stateMutability: "nonpayable", type: "function" },
];

export const USDC_ABI = [
  { inputs: [{ internalType: "address", name: "spender", type: "address" }, { internalType: "uint256", name: "amount", type: "uint256" }], name: "approve", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }, { internalType: "address", name: "spender", type: "address" }], name: "allowance", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
];