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
 * Returns lease data: landlord, tenant, deposit, state, etc.
 */
export function useLease(leaseId) {
  return useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "leases",
    args: [leaseId],
  });
}

/**
 * Hook to approve USDC spend
 * Step 1 of the 2-step deposit flow
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
 * Specifies how much of deposit they want to keep
 */
export function useProposeRelease() {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const propose = (leaseId, amountToLandlord, options = {}) => {
    const parsedAmount = parseUnits(String(amountToLandlord), 6);
    return writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "proposeRelease",
      args: [leaseId, parsedAmount],
      gas: 3000000n,
      ...options,
    });
  };

  return { propose, isLoading, isSuccess, hash };
}

/**
 * Hook for tenant to accept landlord's proposed split
 * Triggers fund transfers and moves lease to RELEASED state
 */
export function useAcceptRelease() {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const accept = (leaseId, options = {}) => {
    return writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "acceptRelease",
      args: [leaseId],
      gas: 3000000n,
      ...options,
    });
  };

  return { accept, isLoading, isSuccess, hash };
}

/**
 * Hook for tenant to raise a dispute
 * Randomly assigns a verifier and moves lease to DISPUTED state
 */
export function useRaiseDispute() {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const raise = (leaseId, options = {}) => {
    return writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "raiseDispute",
      args: [leaseId],
      gas: 3000000n,
      ...options,
    });
  };

  return { raise, isLoading, isSuccess, hash };
}

/**
 * Hook for verifier to submit dispute resolution
 * Only callable by the assigned verifier
 */
export function useResolveDispute() {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const resolve = (leaseId, amountToLandlord) => {
    const parsedAmount = parseUnits(String(amountToLandlord), 6);
    return writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "resolveDispute",
      args: [leaseId, parsedAmount],
    });
  };

  return { resolve, isLoading, isSuccess, hash };
}

/**
 * Hook for timeout refund
 * Anyone can call after deadline + grace period expires
 */
export function useTimeoutRefund() {
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

  const refund = (leaseId) => {
    return writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "timeoutRefund",
      args: [leaseId],
    });
  };

  return { refund, isLoading, isSuccess, hash };
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
