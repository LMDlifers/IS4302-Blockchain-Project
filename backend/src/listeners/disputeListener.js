const { escrow, provider } = require("../provider");
const { fetchFromIPFS, uploadToIPFS } = require("../services/ipfsService");
const { analyzeDispute } = require("../services/llmService");
const {
  POLL_INTERVAL_MS,
  USDC_DECIMALS_FACTOR,
  LEASE_STATE_DISPUTED,
  MAX_DISPUTE_RETRIES,
} = require("../config/constants");

/**
 * Tracks leases currently being processed (or already finished) along with
 * a retry count so permanently failing disputes don't loop indefinitely.
 * Map<leaseId, { retries: number }>
 */
const processedLeases = new Map();

/**
 * Starts polling for DisputeRaised events and fans out processing.
 * Each new dispute is handled in the background so the poll loop stays fast.
 */
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

        // Skip leases already processing or exhausted retries.
        if (processedLeases.has(leaseId)) continue;

        // Claim the leaseId immediately to prevent re-entry on the next poll.
        processedLeases.set(leaseId, { retries: 0 });

        console.log(`\n[Dispute] Lease #${leaseId} disputed.`);

        // Fire-and-forget so the poll loop is never blocked.
        processDispute(leaseId).catch((err) => {
          console.error(`[Dispute] Failed to process lease #${leaseId}:`, err.message);

          const entry = processedLeases.get(leaseId);
          if (entry && entry.retries < MAX_DISPUTE_RETRIES) {
            processedLeases.delete(leaseId); // Allow retry on next poll
          } else {
            console.error(`[Dispute] Lease #${leaseId} exceeded max retries — abandoning.`);
          }
        });
      }

      lastCheckedBlock = currentBlock;
    } catch (err) {
      console.error("[Listener] Polling error:", err.message);
    }
  }, POLL_INTERVAL_MS);

  console.log(`[Listener] Polling engine started. Current block: ${lastCheckedBlock}`);
}

/**
 * Fetches lease evidence from IPFS, calls the LLM arbitrator, uploads the
 * verdict to IPFS, and submits it on-chain via submitAIVerdict.
 *
 * @param {string} leaseId - Stringified lease ID.
 */
async function processDispute(leaseId) {
  try {
    const lease = await escrow.leases(leaseId);

    if (lease.state !== LEASE_STATE_DISPUTED) {
      console.warn(
        `[Dispute] Lease #${leaseId} is no longer DISPUTED (state=${lease.state}), skipping.`
      );
      return;
    }

    const depositHuman = Number(lease.depositAmount) / USDC_DECIMALS_FACTOR;

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

    const amountToLandlordBN = BigInt(Math.round(verdict.amountToLandlord * USDC_DECIMALS_FACTOR));

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
    throw err; // Caller's .catch() manages the retry counter.
  }
}

module.exports = { startDisputeListener };
