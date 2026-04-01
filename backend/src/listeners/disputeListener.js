const { escrow } = require("../provider");
const { fetchFromIPFS, uploadToIPFS } = require("../services/ipfsService");
const { analyzeDispute } = require("../services/llmService");

const CONFIDENCE_THRESHOLD = parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD || "0.80");

/**
 * Start listening for DisputeRaised events
 * This is the core event-driven loop that:
 * 1. Catches DisputeRaised events
 * 2. Fetches evidence from IPFS
 * 3. Calls LLM for analysis
 * 4. Submits verdict to contract
 */
async function startDisputeListener() {
  console.log("[Listener] Watching for DisputeRaised events...");

  escrow.on("DisputeRaised", async (leaseId, verifier, event) => {
    console.log(
      `\n[Dispute] Lease #${leaseId} disputed. Verifier: ${verifier}`
    );

    try {
      // 1. Fetch lease data from contract
      console.log(`[Dispute] Fetching lease data from contract...`);
      const lease = await escrow.leases(leaseId);

      console.log(`[Dispute] Lease state:`, {
        landlord: lease.landlord,
        tenant: lease.tenant,
        depositAmount: lease.depositAmount.toString(),
        landlordStake: lease.landlordStake.toString(),
        ipfsCID: lease.ipfsCID,
      });

      // 2. Fetch evidence from IPFS
      console.log(`[Dispute] Fetching evidence from IPFS: ${lease.ipfsCID}`);
      let evidence;
      try {
        evidence = await fetchFromIPFS(lease.ipfsCID);
      } catch (err) {
        console.error(
          `[Dispute] Failed to fetch IPFS evidence. Using defaults.`
        );
        evidence = {
          leaseTerms: {},
          moveInPhotos: [],
          moveOutPhotos: [],
          landlordClaim: "Damage claim",
          tenantClaim: "Normal wear and tear",
        };
      }

      // 3. Run LLM analysis
      console.log(`[LLM] Running dispute analysis...`);
      const verdict = await analyzeDispute({
        leaseTerms: evidence.leaseTerms || {},
        moveInPhotoCIDs: evidence.moveInPhotos || [],
        moveOutPhotoCIDs: evidence.moveOutPhotos || [],
        landlordClaim: evidence.landlordClaim || "Full deposit claim",
        tenantClaim: evidence.tenantClaim || "Dispute claim",
        depositAmount: lease.depositAmount.toString(),
      });

      console.log(`[LLM] Verdict received:`, verdict);

      // 4. Store verdict reasoning on IPFS for audit trail
      try {
        const verdictCID = await uploadToIPFS(
          verdict,
          `verdict-lease-${leaseId}.json`
        );
        console.log(`[IPFS] Verdict stored: ${verdictCID}`);
      } catch (err) {
        console.warn(`[IPFS] Failed to store verdict: ${err.message}`);
      }

      // 5. Check confidence threshold
      if (verdict.confidence < CONFIDENCE_THRESHOLD) {
        console.warn(
          `[Escalate] Lease #${leaseId} — confidence ${verdict.confidence} below threshold (${CONFIDENCE_THRESHOLD}). Manual review needed.`
        );
        console.log(
          "[Escalate] TODO: Emit to human review queue / send webhook"
        );
        return; // Don't submit to contract, wait for human
      }

      // 6. Submit verdict to contract
      console.log(
        `[Contract] Submitting dispute resolution on-chain...`
      );
      const amountToLandlordBN = BigInt(verdict.amountToLandlord);
      const tx = await escrow.resolveDispute(leaseId, amountToLandlordBN);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(
          `[Contract] ✓ Dispute #${leaseId} resolved on-chain. Tx: ${tx.hash}`
        );
        console.log(`[Contract]   Landlord gets: ${verdict.amountToLandlord} USDC + stake`);
        console.log(
          `[Contract]   Tenant gets: ${lease.depositAmount - amountToLandlordBN} USDC`
        );
      } else {
        console.error(`[Contract] ✗ Transaction failed: ${tx.hash}`);
      }
    } catch (err) {
      console.error(
        `[Error] Dispute handler for lease #${leaseId}:`,
        err.message
      );
      console.error(err.stack);
      // Continue listening; don't crash
    }
  });
}

module.exports = { startDisputeListener };
