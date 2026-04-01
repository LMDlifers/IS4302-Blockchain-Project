const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const { startDisputeListener } = require('./listeners/disputeListener');
const { startLeaseListeners } = require('./listeners/leaseListener');
const { escrow } = require('./provider');
const { createPaymentChallenge, verifyPayment } = require('./services/x402Service');
const { uploadToIPFS } = require('./services/ipfsService');

const app = express();
app.use(cors());
app.use(express.json());

// Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3001;

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({ status: 'RentLock Backend is running' });
});

// ========== IPFS ROUTES ==========

/**
 * POST /api/ipfs/upload
 * Upload file to IPFS via Pinata
 * Accepts: lease PDF, photos, evidence documents
 */
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

/**
 * POST /api/ipfs/upload-metadata
 * Upload JSON metadata to IPFS (lease terms, claims, evidence references)
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

// ========== LEASE ROUTES ==========

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
            ipfsCID: lease.ipfsCID,
            state: lease.state,
            amountToLandlord: lease.amountToLandlord.toString(),
        });
    } catch (err) {
        console.error('[Error] GET /api/leases/:id', err.message);
        res.status(400).json({ error: err.message });
    }
});

// ========== DISPUTE ANALYSIS (X402 GATED) ==========

/**
 * POST /api/disputes/analyze
 * X402 micropayment flow for LLM dispute analysis.
 * First call: returns 402 with payment challenge
 * Second call: includes X-Payment-Proof, analysis is triggered automatically by listener
 */
app.post('/api/disputes/analyze', async (req, res) => {
    try {
        const proof = req.headers['x-payment-proof'];
        const nonce = req.headers['x-payment-nonce'];

        // Step 1: No proof/nonce — return payment challenge
        if (!proof || !nonce) {
            const challenge = createPaymentChallenge(req.body.leaseId);
            return res.status(402).json({
                message: "Payment Required for LLM Inference",
                ...challenge,
            });
        }

        // Step 2: Verify payment proof
        const isValid = await verifyPayment(nonce, proof);
        if (!isValid) {
            return res.status(402).json({ message: "Payment verification failed" });
        }

        // Payment verified — analysis will be triggered automatically by the dispute listener
        res.json({
            message: "Payment accepted. Dispute analysis will resolve on-chain.",
            leaseId: req.body.leaseId,
        });
    } catch (err) {
        console.error('[Error] POST /api/disputes/analyze', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== STARTUP ==========

app.listen(PORT, async () => {
    console.log(`\n✓ Server listening on port ${PORT}`);
    console.log('Initializing blockchain event listeners...\n');

    // Start event listeners
    try {
        startLeaseListeners();
        startDisputeListener();
        console.log('✓ Event listeners initialized\n');
    } catch (err) {
        console.error('Error initializing listeners:', err.message);
        process.exit(1);
    }
});