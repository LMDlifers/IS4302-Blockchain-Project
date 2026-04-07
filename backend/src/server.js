const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const { startDisputeListener, pendingHumanReviews, savePendingReviews } = require('./listeners/disputeListener');
const { startLeaseListeners } = require('./listeners/leaseListener');
const { escrow } = require('./provider');
const { createPaymentChallenge, verifyPayment } = require('./services/x402Service');
const { uploadToIPFS } = require('./services/ipfsService');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3001;

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

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
  res.json({ status: 'RentLock Backend is running' });
});

// ========== IPFS ROUTES ==========

app.post('/api/ipfs/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log(`[IPFS] Uploading file: ${req.file.originalname}`);
    const cid = await uploadToIPFS(req.file.buffer, req.file.originalname);

    console.log(`[IPFS] ✓ File uploaded. CID: ${cid}`);
    res.json({ cid });
  } catch (err) {
    console.error('[Error] POST /api/ipfs/upload', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

// ========== LEASE ROUTES ==========

app.get('/api/leases/count', async (req, res) => {
  try {
    const count = await escrow.leaseCounter();
    res.json({ count: count.toString() });
  } catch (err) {
    console.error('[Error] GET /api/leases/count', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leases', async (req, res) => {
  try {
    const user = req.query.user?.toLowerCase();
    
    const leases = [];
    const count = Number(await escrow.leaseCounter());
    for (let id = 1; id <= count; id++) {
      const lease = await escrow.leases(id);
      leases.push(serializeLease(id, lease));
    }

    const filteredLeases = user
      ? leases.filter(
          (lease) =>
            lease.landlord.toLowerCase() === user ||
            lease.tenant.toLowerCase() === user
        )
      : leases;

    // Sort newest first
    filteredLeases.sort((a, b) => b.leaseId - a.leaseId);

    res.json({
      totalCount: leases.length,
      count: filteredLeases.length,
      leases: filteredLeases,
    });
  } catch (err) {
    console.error('[Error] GET /api/leases', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/leases/:id
 * Fetch a lease by ID from the blockchain
 */
app.get('/api/leases/:id', async (req, res) => {
  try {
    const lease = await escrow.leases(req.params.id);
    res.json({
      leaseId: req.params.id,
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
    });
  } catch (err) {
    console.error('[Error] GET /api/leases/:id', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ========== DISPUTE ANALYSIS (X402 GATED) ==========

app.post('/api/disputes/analyze', async (req, res) => {
  try {
    const proof = req.headers['x-payment-proof'];
    const nonce = req.headers['x-payment-nonce'];

    if (!proof || !nonce) {
      const challenge = createPaymentChallenge(req.body.leaseId);
      return res.status(402).json({
        message: "Payment Required for LLM Inference",
        ...challenge,
      });
    }

    const isValid = await verifyPayment(nonce, proof);
    if (!isValid) {
      return res.status(402).json({ message: "Payment verification failed" });
    }

    res.json({
      message: "Payment accepted. Dispute analysis will resolve on-chain.",
      leaseId: req.body.leaseId,
    });
  } catch (err) {
    console.error('[Error] POST /api/disputes/analyze', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== HUMAN-IN-THE-LOOP DISPUTE REVIEW ==========

app.get('/api/disputes/pending', (req, res) => {
  const list = [...pendingHumanReviews.values()].filter(r => r.status === 'pending');
  res.json({ count: list.length, disputes: list });
});

app.post('/api/disputes/:leaseId/human-resolve', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { leaseId } = req.params;
  const { amountToLandlord } = req.body;

  if (amountToLandlord === undefined) {
    return res.status(400).json({ error: 'amountToLandlord required' });
  }

  const review = pendingHumanReviews.get(leaseId);
  if (!review) return res.status(404).json({ error: 'No pending review for this lease' });
  if (review.status !== 'pending') return res.status(409).json({ error: 'Already resolved' });

  try {
    const amountBN = BigInt(Math.round(Number(amountToLandlord)));
    const tx = await escrow.resolveDispute(BigInt(leaseId), amountBN);
    const receipt = await tx.wait();
    review.status = 'resolved';
    review.resolvedAt = new Date().toISOString();
    review.finalAmountToLandlord = amountToLandlord.toString();
    review.txHash = receipt.hash;
    savePendingReviews();
    console.log(`[HITL] ✓ Lease #${leaseId} manually resolved. Tx: ${receipt.hash}`);
    res.json({ success: true, txHash: receipt.hash });
  } catch (err) {
    console.error(`[Error] POST /api/disputes/${leaseId}/human-resolve`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== STARTUP ==========

app.listen(PORT, async () => {
  console.log(`\n✓ Server listening on port ${PORT}`);
  console.log('Initializing blockchain event listeners...\n');

  try {
    startLeaseListeners();
    startDisputeListener();
    console.log('✓ Event listeners initialized\n');
  } catch (err) {
    console.error('Error initializing listeners:', err.message);
    process.exit(1);
  }
});