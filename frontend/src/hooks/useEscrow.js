import {
  useReadContract,
  useWriteContract,
} from "wagmi";
import { parseUnits } from "viem";
import {
  ESCROW_ABI,
  ESCROW_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "../config/contracts";
import { GAS_LIMIT, LEASE_POLL_MS } from "../config/api";

/**
 * Reads a single lease by ID with adaptive polling.
 * Polling stops automatically once the lease reaches a terminal state
 * (RELEASED = 3, REFUNDED = 4) to avoid burning RPC quota indefinitely.
 * The lease struct is returned as a plain object by Wagmi; `state` may be
 * at index 9 (tuple form) or on the `state` property (named form).
 */
export function useLease(leaseId) {
  return useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "leases",
    args: [leaseId],
    query: {
      refetchInterval: (data) => {
        const state =
          data?.state != null
            ? Number(data.state)
            : Array.isArray(data)
            ? Number(data[9])
            : null;
        return state !== null && state >= 3 ? false : LEASE_POLL_MS;
      },
    },
  });
}

/**
 * Approves the escrow contract to spend USDC on the caller's behalf.
 * `amount` must be a human-readable value (e.g. "200" for 200 USDC);
 * parseUnits converts it to the correct 6-decimal raw value.
 */
export function useApproveUSDC() {
  const { writeContractAsync } = useWriteContract();

  const approve = (amount, options = {}) => {
    const parsedAmount = parseUnits(String(amount), 6);
    return writeContractAsync({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [ESCROW_ADDRESS, parsedAmount],
      gas: GAS_LIMIT,
      ...options,
    });
  };

  return { approve };
}

/**
 * Deposits the full tenant deposit into escrow (step 2 of the 2-step deposit flow).
 * Requires a prior USDC approval via useApproveUSDC for at least depositAmount.
 */
export function useDepositFunds() {
  const { writeContractAsync } = useWriteContract();

  const deposit = (leaseId, options = {}) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "depositFunds",
      args: [leaseId],
      gas: GAS_LIMIT,
      ...options,
    });
  };

  return { deposit };
}

/**
 * Initialises a new lease. Landlord must first approve USDC spend for
 * the stake amount (depositAmount / STAKE_DIVISOR).
 */
export function useInitializeLease() {
  const { writeContractAsync } = useWriteContract();

  const initializeLease = (tenant, depositAmount, deadline, gracePeriod, ipfsCID, options = {}) => {
    const parsedDeposit = parseUnits(String(depositAmount), 6);
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "initializeLease",
      args: [tenant, parsedDeposit, deadline, gracePeriod, ipfsCID],
      gas: GAS_LIMIT,
      ...options,
    });
  };

  return { initializeLease };
}

/**
 * Landlord proposes a deposit split and uploads move-out evidence (one-time only).
 */
export function useProposeRelease() {
  const { writeContractAsync } = useWriteContract();

  const propose = async (leaseId, amountToLandlord, moveOutCID, options = {}) => {
    const parsedAmount = parseUnits(String(amountToLandlord), 6);
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "proposeRelease",
      args: [leaseId, parsedAmount, moveOutCID],
      gas: GAS_LIMIT,
      ...options,
    });
  };

  return { propose };
}

/**
 * Tenant accepts the landlord's proposed deposit split.
 */
export function useAcceptRelease() {
  const { writeContractAsync } = useWriteContract();

  const accept = (leaseId, options = {}) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "acceptRelease",
      args: [leaseId],
      gas: GAS_LIMIT,
      ...options,
    });
  };

  return { accept };
}

/**
 * Tenant raises a dispute, transitioning the lease to DISPUTED state.
 */
export function useRaiseDispute() {
  const { writeContractAsync } = useWriteContract();

  const raise = (leaseId, options = {}) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "raiseDispute",
      args: [leaseId],
      gas: GAS_LIMIT,
      ...options,
    });
  };

  return { raise };
}

/**
 * Verifier resolves a dispute by specifying the landlord's payout.
 */
export function useResolveDispute() {
  const { writeContractAsync } = useWriteContract();

  const resolve = (leaseId, amountToLandlord) => {
    const parsedAmount = parseUnits(String(amountToLandlord), 6);
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "resolveDispute",
      args: [leaseId, parsedAmount],
      gas: GAS_LIMIT,
    });
  };

  return { resolve };
}

/**
 * Tenant claims a full refund after deadline + grace period has elapsed.
 */
export function useTimeoutRefund() {
  const { writeContractAsync } = useWriteContract();

  const refund = (leaseId) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "timeoutRefund",
      args: [leaseId],
      gas: GAS_LIMIT,
    });
  };

  return { refund };
}

/** Reads the USDC balance of an address. */
export function useUSDCBalance(address) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address],
    gas: GAS_LIMIT,
  });
}

/** Reads the USDC allowance granted by owner to spender. */
export function useUSDCAllowance(owner, spender) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });
}
