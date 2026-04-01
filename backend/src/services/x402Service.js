const { provider } = require("../provider");

/**
 * X402 Micropayment Protocol
 * HTTP 402 Payment Required standard for gating API access
 * Flow:
 * 1. Client POST /api/disputes/analyze (no payment headers)
 * 2. Server returns 402 with payment challenge (nonce, amount, address)
 * 3. Client pays on-chain via USDC transfer
 * 4. Client POSTs again with X-Payment-Proof header (tx hash)
 * 5. Server verifies tx → proceeds with analysis
 */

const INFERENCE_FEE_USDC = "5000000"; // 5 USDC (6 decimals)

// Track pending payments: nonce -> { leaseId, paid: false }
const pendingPayments = new Map();

/**
 * Create a payment challenge for a dispute
 * @param {number} leaseId - Lease ID being disputed
 * @returns {Object} Payment challenge with nonce
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
    chainId: process.env.CHAIN_ID || "11155111", // Sepolia
  };
}

/**
 * Verify payment proof (transaction hash)
 * @param {string} nonce - Payment challenge nonce
 * @param {string} txHash - Transaction hash as proof
 * @returns {Promise<boolean>} True if payment verified
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

    // Check if nonce expired (15 minutes)
    if (Date.now() - payment.createdAt > 15 * 60 * 1000) {
      console.warn(`[X402] Nonce expired: ${nonce}`);
      pendingPayments.delete(nonce);
      return false;
    }

    // Verify transaction on blockchain
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      console.warn(`[X402] Transaction not found: ${txHash}`);
      return false;
    }

    if (receipt.status !== 1) {
      console.warn(`[X402] Transaction failed: ${txHash}`);
      return false;
    }

    // Basic verification: check tx succeeded
    // Production: decode Transfer event logs to verify amount and recipient
    // For now, trust that the tx hash is valid proof of payment
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
