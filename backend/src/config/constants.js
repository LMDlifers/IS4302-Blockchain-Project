/**
 * Centralised numeric and string constants shared across backend services.
 * All time values are in milliseconds; all USDC values use 6-decimal units.
 */

module.exports = {
  // ── Server ──────────────────────────────────────────────────────────────
  DEFAULT_PORT: 3001,

  // ── WebSocket / provider ─────────────────────────────────────────────────
  /** Delay before attempting to reconnect after a WebSocket close event. */
  RECONNECT_DELAY_MS: 3000,

  // ── Dispute listener ─────────────────────────────────────────────────────
  /** Interval between lease-state polling attempts during dispute processing. */
  POLL_INTERVAL_MS: 2000,
  /** Maximum number of processing retries before a dispute is abandoned. */
  MAX_DISPUTE_RETRIES: 3,
  /** LeaseState enum value for DISPUTED (matches EscrowManager.sol). */
  LEASE_STATE_DISPUTED: 2n,

  // ── USDC ─────────────────────────────────────────────────────────────────
  USDC_DECIMALS: 6,
  /** Multiply raw contract values by this to convert to human-readable USDC. */
  USDC_DECIMALS_FACTOR: 1_000_000,

  // ── IPFS ─────────────────────────────────────────────────────────────────
  /** Timeout for IPFS fetch requests (Pinata gateway). */
  IPFS_FETCH_TIMEOUT_MS: 10_000,

  // ── LLM / Gemini ────────────────────────────────────────────────────────
  /** Timeout for outbound HTTP requests to the Gemini API. */
  LLM_FETCH_TIMEOUT_MS: 15_000,
  /** Gemini model identifier used for dispute analysis. */
  GEMINI_MODEL: "gemini-2.5-flash-lite",

  // ── X402 payment ─────────────────────────────────────────────────────────
  /** Per-inference fee in raw USDC units (5 USDC × 10^6). */
  INFERENCE_FEE_USDC: "5000000",
  /** How long a payment nonce remains valid before expiring. */
  NONCE_EXPIRATION_MS: 15 * 60 * 1000, // 15 minutes
};
