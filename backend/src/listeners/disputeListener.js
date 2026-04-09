const { ethers } = require("ethers");
const { escrow, provider } = require("../provider");
const { fetchFromIPFS, uploadToIPFS } = require("../services/ipfsService");
const { analyzeDispute } = require("../services/llmService");

const _rawThreshold = parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD ?? "0.80");
const CONFIDENCE_THRESHOLD = isNaN(_rawThreshold)
  ? (() => { throw new Error("Invalid LLM_CONFIDENCE_THRESHOLD env var"); })()
  : _rawThreshold;

// Tracks leases currently being processed OR already done
const processedLeases = new Set();

async function startDisputeListener() {
  console.log("[Listener] Watching for DisputeRaised events via polling...");

  let lastCheckedBlock = await provider.getBlockNumber();

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastCheckedBlock) return;

      const events = await escrow.queryFilter("DisputeRaised", lastCheckedBlock + 1, currentBlock);

      for (const event of events) {
        const leaseId = event.args[0].toString();
        const verifier = event.args[1];

        // ✅ Skip if already processing OR already done
        if (processedLeases.has(leaseId)) continue;

        // ✅ IMMEDIATELY claim this leaseId to prevent re-entry on the next poll
        processedLeases.add(leaseId);

        console.log(`\n[Dispute] Lease #${leaseId} disputed. Verifier: ${verifier}`);

        // Process in background — do NOT await here so the poll loop stays fast
        processDispute(leaseId, verifier).catch((err) => {
          console.error(`[Dispute] Failed to process lease #${leaseId}:`, err.message);
          // ✅ Remove from set on failure so it can be retried on next poll
          processedLeases.delete(leaseId);
        });
      }

      lastCheckedBlock = currentBlock;
    } catch (err) {
      console.error("[Listener] Polling error:", err.message);
    }
  }, 2000);

  console.log(`[Listener] Polling engine started. Current block: ${lastCheckedBlock}`);
}

async function processDispute(leaseId, verifier) {
  try {
    const lease = await escrow.leases(leaseId);

    if (lease.state !== 2n) {
      console.warn(`[Dispute] Lease #${leaseId} is no longer DISPUTED (state=${lease.state}), skipping.`);
      return;
    }

    const depositHuman = Number(lease.depositAmount) / 1_000_000;

    console.log(`[Dispute] Lease data:`, {
      landlord: lease.landlord,
      tenant: lease.tenant,
      depositAmount: `${depositHuman} USDC`,
      moveInCID: lease.moveInCID,
      moveOutCID: lease.moveOutCID,
    });

    let moveInData = {};
    if (lease.moveInCID) {
      try {
        console.log(`[Dispute] Fetching move-in evidence from IPFS: ${lease.moveInCID}`);
        moveInData = await fetchFromIPFS(lease.moveInCID);
      } catch (err) {
        console.warn(`[Dispute] Could not fetch move-in IPFS data: ${err.message}`);
      }
    }

    let moveOutData = {};
    if (lease.moveOutCID) {
      try {
        console.log(`[Dispute] Fetching move-out/damage evidence from IPFS: ${lease.moveOutCID}`);
        moveOutData = await fetchFromIPFS(lease.moveOutCID);
      } catch (err) {
        console.warn(`[Dispute] Could not fetch move-out IPFS data: ${err.message}`);
      }
    } else {
      console.warn(`[Dispute] No move-out CID found — ruling in tenant's favour.`);
    }

    console.log(`[LLM] Running dispute analysis with photo comparison...`);
    const verdict = await analyzeDispute({
      leaseTerms: moveInData.leaseTerms || {},
      moveInPhotoCIDs: moveInData.moveInPhotoCIDs || [],
      moveOutPhotoCIDs: moveOutData.moveOutPhotoCIDs || [],
      landlordClaim: moveOutData.landlordClaim || "Landlord claims deposit deduction for damages.",
      tenantClaim: moveInData.tenantClaim || "Tenant disputes the damage claim.",
      depositAmount: depositHuman,
    });

    console.log(`[LLM] Verdict:`, verdict);

    let verdictCID = "";
    try {
      verdictCID = await uploadToIPFS(
        {
          ...verdict,
          leaseId: leaseId.toString(),
          moveInCID: lease.moveInCID,
          moveOutCID: lease.moveOutCID,
          timestamp: new Date().toISOString(),
        },
        `verdict-lease-${leaseId}.json`
      );
      console.log(`[IPFS] Verdict stored: ${verdictCID}`);
    } catch (err) {
      console.warn(`[IPFS] Failed to store verdict: ${err.message}`);
      verdictCID = "IPFS_UPLOAD_FAILED";
    }

    const amountToLandlordBN = BigInt(Math.round(verdict.amountToLandlord * 1_000_000));

    console.log(`[Contract] Submitting AI proposal to blockchain...`);
    const tx = await escrow.submitAIVerdict(leaseId, amountToLandlordBN, verdictCID);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log(`[Contract] ✓ AI Verdict submitted for Lease #${leaseId}. Tx: ${tx.hash}`);
      console.log(`[Contract]   Waiting for Tenant and Landlord to accept...`);
    } else {
      console.error(`[Contract] ✗ Transaction failed: ${tx.hash}`);
    }

  } catch (err) {
    console.error(`[Error] processDispute for lease #${leaseId}:`, err.message);
    console.error(err.stack);
    throw err; // Caller's .catch() will remove from processedLeases for retry
  }
}

module.exports = { startDisputeListener };