/**
 * Centralised configuration for external endpoints and shared numeric constants.
 * Values fall back to development defaults when the corresponding VITE_ env var is absent.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export const IPFS_GATEWAY =
  import.meta.env.VITE_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

/** Hardhat local network chain ID used in development. */
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 1337);

// ── USDC ─────────────────────────────────────────────────────────────────────

/** 10^6 — multiply raw contract values by this to get human-readable USDC. */
export const USDC_DECIMALS_FACTOR = 1_000_000;

// ── Lease creation ────────────────────────────────────────────────────────────

/** Landlord stake = depositAmount / STAKE_DIVISOR (20 %). Must match EscrowManager.sol. */
export const STAKE_DIVISOR = 5;

/** Seconds in one day — used when converting grace period days to the contract's uint256. */
export const SECONDS_PER_DAY = 86_400;

// ── UI timings ────────────────────────────────────────────────────────────────

/** Delay after a transaction before triggering a data refetch (ms). */
export const REFETCH_DELAY_MS = 2_000;

/** Gas limit passed to escrow write calls. */
export const GAS_LIMIT = 3_000_000n;

/** Polling interval for AI verdict status queries (ms). */
export const AI_VERDICT_POLL_MS = 4_000;

/** Polling interval for lease state queries (ms). */
export const LEASE_POLL_MS = 5_000;
