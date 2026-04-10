const { provider } = require("../provider");
const { INFERENCE_FEE_USDC, NONCE_EXPIRATION_MS } = require("../config/constants");

/**
 * X402 Micropayment Protocol — HTTP 402 Payment Required standard for gating API access.
 *
 * Flow:
 *   1. Client POSTs /api/disputes/analyze (no payment headers).
 *   2. Server returns 402 with a payment challenge (nonce, amount, address).
 *   3. Client pays on-chain via USDC transfer.
 *   4. Client POSTs again with X-Payment-Proof (tx hash) and X-Payment-Nonce headers.
 *   5. Server verifies tx → proceeds with analysis.
 */

/**
 * Pending payment challenges: nonce → { leaseId, paid, createdAt }.
 * Entries expire after NONCE_EXPIRATION_MS and are purged on verification
 * or by the periodic cleanup interval.
 */
const pendingPayments = new Map();

// Purge expired nonces every 30 minutes to prevent unbounded Map growth.
setInterval(() => {
  const now = Date.now();
  for (const [nonce, payment] of pendingPayments) {
    if (now - payment.createdAt > NONCE_EXPIRATION_MS) {
      pendingPayments.delete(nonce);
    }
  }
}, 30 * 60 * 1000);

/**
 * Creates a payment challenge for a dispute analysis request.
 *
 * @param {number|string} leaseId - Lease ID being disputed.
 * @returns {{ nonce: string, paymentAddress: string, amountUSDC: string,
 *             decimals: number, usdcContractAddress: string, chainId: string }}
 */
function createPaymentChallenge(leaseId) {
  const nonce = `${leaseId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  pendingPayments.set(nonce, {
    leaseId,
    paid: false,
    createdAt: Date.now(),
  });

  return {
    nonce,
    paymentAddress: process.env.BACKEND_WALLET_ADDRESS,
    amountUSDC: INFERENCE_FEE_USDC,
    decimals: 6,
    usdcContractAddress: process.env.USDC_ADDRESS,
    chainId: process.env.CHAIN_ID || "11155111", // Sepolia testnet
  };
}

/**
 * Verifies that a USDC payment transaction has been confirmed on-chain.
 *
 * @param {string} nonce  - Payment challenge nonce from createPaymentChallenge.
 * @param {string} txHash - Transaction hash submitted by the client as proof.
 * @returns {Promise<boolean>} True if the transaction is confirmed and the nonce is valid.
 *
 * @todo (security) Currently only checks tx receipt status. Production implementation must
 *       decode the Transfer event logs to verify the exact USDC amount and recipient address.
 */
async function verifyPayment(nonce, txHash) {
  try {
    const payment = pendingPayments.get(nonce);

    if (!payment) {
      console.warn(`[X402] Invalid nonce: ${nonce}`);
      return false;
    }

    if (payment.paid) {
      console.warn(`[X402] Payment already used: ${nonce}`);
      return false;
    }

    if (Date.now() - payment.createdAt > NONCE_EXPIRATION_MS) {
      console.warn(`[X402] Nonce expired: ${nonce}`);
      pendingPayments.delete(nonce);
      return false;
    }

    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      console.warn(`[X402] Transaction not found: ${txHash}`);
      return false;
    }

    if (receipt.status !== 1) {
      console.warn(`[X402] Transaction failed: ${txHash}`);
      return false;
    }

    console.log(`[X402] Payment verified for lease ${payment.leaseId}. Tx: ${txHash}`);
    payment.paid = true;
    return true;
  } catch (err) {
    console.error("[X402] Verification error:", err.message);
    return false;
  }
}

module.exports = {
  createPaymentChallenge,
  verifyPayment,
  INFERENCE_FEE_USDC,
};
