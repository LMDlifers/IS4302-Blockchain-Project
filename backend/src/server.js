const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { ethers } = require("ethers");
require('dotenv').config();

const { startDisputeListener } = require('./listeners/disputeListener');
const { startLeaseListeners } = require('./listeners/leaseListener');
const { escrow } = require('./provider');
const { createPaymentChallenge, verifyPayment } = require('./services/x402Service');
const { uploadToIPFS } = require('./services/ipfsService');
const { DEFAULT_PORT } = require('./config/constants');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || DEFAULT_PORT;

/**
 * In-memory escalation store: leaseId → escalation record.
 * NOTE: This is reset on server restart. For production, persist to a database.
 * @type {Object.<string, Object>}
 */
const escalations = {};

/**
 * Serialises a raw contract Lease struct to a JSON-safe object.
 * Converts BigInt fields to strings so JSON.stringify doesn't throw.
 *
 * @param {number|string} leaseId - The lease ID.
 * @param {Object} lease          - Raw struct returned by escrow.leases().
 * @returns {Object}
 */
function serializeLease(leaseId, lease) {
  return {
    leaseId,
    landlord: lease.landlord,
    tenant: lease.tenant,
    verifier: lease.verifier,
    depositAmount: lease.depositAmount.toString(),
    landlordStake: lease.landlordStake.toString(),
    deadline: lease.deadline.toString(),
    gracePeriod: lease.gracePeriod.toString(),
    moveInCID: lease.moveInCID || "",
    moveOutCID: lease.moveOutCID || "",
    state: Number(lease.state),
    amountToLandlord: lease.amountToLandlord.toString(),
  };
}

// ── Health check ────────────────────────────────────────────────────────────

/** GET /health — Basic liveness probe. */
app.get('/health', (req, res) => {
  res.json({ status: 'RentLock Backend is running' });
});

// ── IPFS routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/ipfs/upload
 * Accepts a multipart file upload and pins it to IPFS via Pinata.
 * Response: { cid: string }
 */
app.post('/api/ipfs/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    console.log(`[IPFS] Uploading file: ${req.file.originalname}`);
    const cid = await uploadToIPFS(req.file.buffer, req.file.originalname);
    console.log(`[IPFS] ✓ File uploaded. CID: ${cid}`);
    res.json({ cid });
  } catch (err) {
    console.error('[Error] POST /api/ipfs/upload', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ipfs/upload-metadata
 * Accepts a JSON body and pins it to IPFS as lease-metadata.json.
 * Response: { cid: string }
 */
app.post('/api/ipfs/upload-metadata', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    console.log(`[IPFS] Uploading metadata`);
    const cid = await uploadToIPFS(req.body, 'lease-metadata.json');
    console.log(`[IPFS] ✓ Metadata uploaded. CID: ${cid}`);
    res.json({ cid });
  } catch (err) {
    console.error('[Error] POST /api/ipfs/upload-metadata', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Lease routes ────────────────────────────────────────────────────────────

/**
 * GET /api/leases/count
 * Returns the total number of leases created on-chain.
 * Response: { count: string }
 */
app.get('/api/leases/count', async (req, res) => {
  try {
    const count = await escrow.leaseCounter();
    res.json({ count: count.toString() });
  } catch (err) {
    console.error('[Error] GET /api/leases/count', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/leases[?user=0x...]
 * Returns all leases, optionally filtered to those where the given address is
 * landlord or tenant. Results are sorted newest-first.
 * Response: { totalCount, count, leases: Lease[] }
 */
app.get('/api/leases', async (req, res) => {
  try {
    const user = req.query.user?.toLowerCase();
    const total = Number(await escrow.leaseCounter());
    const leases = [];
    for (let currentId = 1; currentId <= total; currentId++) {
      const lease = await escrow.leases(currentId);
      leases.push(serializeLease(currentId, lease));
    }
    const filteredLeases = user
      ? leases.filter(l => l.landlord.toLowerCase() === user || l.tenant.toLowerCase() === user)
      : leases;
    filteredLeases.sort((a, b) => b.leaseId - a.leaseId);
    res.json({ totalCount: leases.length, count: filteredLeases.length, leases: filteredLeases });
  } catch (err) {
    console.error('[Error] GET /api/leases', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/leases/:id
 * Returns a single lease by ID.
 * Response: Lease object
 */
app.get('/api/leases/:id', async (req, res) => {
  try {
    const lease = await escrow.leases(req.params.id);
    res.json(serializeLease(req.params.id, lease));
  } catch (err) {
    console.error('[Error] GET /api/leases/:id', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Dispute analysis (X402-gated) ───────────────────────────────────────────

/**
 * POST /api/disputes/analyze
 * X402-gated endpoint that triggers LLM dispute analysis.
 * Without payment headers → 402 with challenge.
 * With valid X-Payment-Proof + X-Payment-Nonce → 200 acknowledgement.
 * The actual analysis runs asynchronously via the dispute listener.
 */
app.post('/api/disputes/analyze', async (req, res) => {
  try {
    const proof = req.headers['x-payment-proof'];
    const nonce = req.headers['x-payment-nonce'];
    if (!proof || !nonce) {
      const challenge = createPaymentChallenge(req.body.leaseId);
      return res.status(402).json({ message: "Payment Required for LLM Inference", ...challenge });
    }
    const isValid = await verifyPayment(nonce, proof);
    if (!isValid) return res.status(401).json({ message: "Payment verification failed" });
    res.json({ message: "Payment accepted. Dispute analysis will resolve on-chain.", leaseId: req.body.leaseId });
  } catch (err) {
    console.error('[Error] POST /api/disputes/analyze', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── HITL escalation routes ──────────────────────────────────────────────────

/**
 * POST /api/disputes/:leaseId/escalate
 * Records a human-in-the-loop escalation request from a party.
 * Body: { contestedBy: string, role: "landlord"|"tenant", statement?: string, timestamp?: string }
 * Response: escalation record
 */
app.post('/api/disputes/:leaseId/escalate', (req, res) => {
  const { leaseId } = req.params;
  const { contestedBy, role, statement, timestamp } = req.body;
  if (!contestedBy || !role) {
    return res.status(400).json({ error: 'contestedBy and role are required' });
  }
  escalations[leaseId] = {
    leaseId, contestedBy, role,
    statement: statement || null,
    timestamp: timestamp || new Date().toISOString(),
    status: 'pending',
    escalated: true,
  };
  console.log(`[HITL] ⚖️  Dispute escalated for lease #${leaseId} by ${role} (${contestedBy})`);
  res.json(escalations[leaseId]);
});

/**
 * GET /api/disputes/:leaseId/escalation-status
 * Returns the escalation record for a lease, or { escalated: false } if none exists.
 */
app.get('/api/disputes/:leaseId/escalation-status', (req, res) => {
  const { leaseId } = req.params;
  const data = escalations[leaseId];
  if (!data) return res.json({ escalated: false });
  res.json(data);
});

// NOTE: /api/disputes/all MUST be registered before /api/disputes/:leaseId to avoid conflict.
/**
 * GET /api/disputes/all
 * Returns all escalation records (admin view).
 * Response: { disputes: escalation[] }
 */
app.get('/api/disputes/all', (req, res) => {
  res.json({ disputes: Object.values(escalations) });
});

/**
 * POST /api/disputes/:leaseId/resolve
 * Updates the in-memory escalation record to reflect a resolved state.
 * Body: { resolvedBy: string, txHash: string, amountToLandlord: string|number }
 */
app.post('/api/disputes/:leaseId/resolve', (req, res) => {
  const { leaseId } = req.params;
  const { resolvedBy, txHash, amountToLandlord } = req.body;
  if (!escalations[leaseId]) {
    return res.status(404).json({ error: `No escalation found for lease #${leaseId}` });
  }
  escalations[leaseId] = {
    ...escalations[leaseId],
    status: 'resolved', resolvedBy, txHash, amountToLandlord,
    resolvedAt: new Date().toISOString(),
  };
  console.log(`[HITL] ✓ Dispute for lease #${leaseId} resolved by ${resolvedBy}`);
  res.json(escalations[leaseId]);
});

/**
 * POST /api/disputes/:leaseId/resolve-onchain
 * Backend wallet calls resolveDispute() on-chain using the human verifier's
 * decided split amount.
 * Body: { amountToLandlord: string|number } — human-readable USDC (e.g. "300")
 * Response: { success: true, txHash: string }
 */
app.post('/api/disputes/:leaseId/resolve-onchain', async (req, res) => {
  const { leaseId } = req.params;
  const { amountToLandlord } = req.body;
  try {
    // parseUnits converts human-readable USDC to 6-decimal raw units.
    const parsedAmount = ethers.parseUnits(String(amountToLandlord), 6);
    const tx = await escrow.resolveDispute(leaseId, parsedAmount);
    await tx.wait();

    if (escalations[leaseId]) {
      escalations[leaseId].status = 'resolved';
      escalations[leaseId].txHash = tx.hash;
      escalations[leaseId].resolvedAt = new Date().toISOString();
    }

    console.log(`[HITL] ✓ resolveDispute called for lease #${leaseId}. Tx: ${tx.hash}`);
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error(`[HITL] resolveDispute failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Startup ─────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n✓ Server listening on port ${PORT}`);
  console.log('Initializing blockchain event listeners...\n');
  try {
    await startLeaseListeners();
    await startDisputeListener();
    console.log('✓ Event listeners initialized\n');
  } catch (err) {
    console.error('Error initializing listeners:', err.message);
    process.exit(1);
  }
});
