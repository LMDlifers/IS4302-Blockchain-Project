import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits } from "viem";
import {
  ESCROW_ABI,
  ESCROW_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "../config/contracts";

/**
 * Hook to read a single lease by ID
 * Fix 4.4: reduced interval from 1000ms to 5000ms; stops polling on terminal states
 * (RELEASED=3, REFUNDED=4) to avoid burning RPC quota indefinitely.
 */
export function useLease(leaseId) {
  return useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "leases",
    args: [leaseId],
    query: {
      refetchInterval: (data) => {
        // data is the raw tuple; index 9 is the state field
        const state = data?.state != null ? Number(data.state) : (Array.isArray(data) ? Number(data[9]) : null);
        // Stop polling once the lease reaches a terminal state (RELEASED or REFUNDED)
        return state !== null && state >= 3 ? false : 5000;
      },
    },
  });
}

/**
 * Hook to approve USDC spend
 * Fix 4.2: amount is expected as a human-readable number or string (e.g. "200" for 200 USDC).
 * parseUnits converts it to the correct 6-decimal raw value.
 * Do NOT pass a raw BigInt string here — use the human-readable deposit/stake amount.
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
      gas: 3000000n,
      ...options,
    });
  };

  return { approve };
}

/**
 * Hook to deposit funds into escrow
 * Step 2 of the 2-step deposit flow
 * Requires prior approval via useApproveUSDC
 */
export function useDepositFunds() {
  const { writeContractAsync } = useWriteContract();

  const deposit = (leaseId, options = {}) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "depositFunds",
      args: [leaseId],
      gas: 3000000n,
      ...options,
    });
  };

  return { deposit };
}

/**
 * Hook to initialize a new lease
 * Landlord stakes 20% of deposit and uploads IPFS CID
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
      gas: 3000000n,
      ...options,
    });
  };

  return { initializeLease };
}

/**
 * Hook for landlord to propose a release split
 * Specifies how much of deposit they want to keep and provides damage evidence
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
      gas: 3000000n,
      ...options,
    });
  };

  return { propose };
}

/**
 * Hook for tenant to accept landlord's proposed split
 * Fix 4.3: changed from writeContract to writeContractAsync so await works correctly
 */
export function useAcceptRelease() {
  const { writeContractAsync } = useWriteContract();

  const accept = (leaseId, options = {}) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "acceptRelease",
      args: [leaseId],
      gas: 3000000n,
      ...options,
    });
  };

  return { accept };
}

/**
 * Hook for tenant to raise a dispute
 * Fix 4.3: changed from writeContract to writeContractAsync so await works correctly
 */
export function useRaiseDispute() {
  const { writeContractAsync } = useWriteContract();

  const raise = (leaseId, options = {}) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "raiseDispute",
      args: [leaseId],
      gas: 3000000n,
      ...options,
    });
  };

  return { raise };
}

/**
 * Hook for verifier to submit dispute resolution
 * Fix 4.3: changed from writeContract to writeContractAsync so await works correctly
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
    });
  };

  return { resolve };
}

/**
 * Hook for timeout refund — callable by tenant after deadline + grace period
 * Fix 4.3: changed from writeContract to writeContractAsync so await works correctly
 */
export function useTimeoutRefund() {
  const { writeContractAsync } = useWriteContract();

  const refund = (leaseId) => {
    return writeContractAsync({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "timeoutRefund",
      args: [leaseId],
    });
  };

  return { refund };
}

/**
 * Helper hook to read USDC balance
 */
export function useUSDCBalance(address) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

/**
 * Helper hook to read USDC allowance
 */
export function useUSDCAllowance(owner, spender) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });
}
