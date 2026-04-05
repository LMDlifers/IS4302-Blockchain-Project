const { escrow } = require("../provider");
const { fetchFromIPFS, uploadToIPFS } = require("../services/ipfsService");
const { analyzeDispute } = require("../services/llmService");

const CONFIDENCE_THRESHOLD = parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD || "0.80");

async function startDisputeListener() {
  console.log("[Listener] Watching for DisputeRaised events...");

  escrow.on("DisputeRaised", async (leaseId, verifier, event) => {
    console.log(`\n[Dispute] Lease #${leaseId} disputed. Verifier: ${verifier}`);

    try {
      // 1. Fetch lease data from contract (now has moveInCID + moveOutCID)
      const lease = await escrow.leases(leaseId);

      console.log(`[Dispute] Lease data:`, {
        landlord: lease.landlord,
        tenant: lease.tenant,
        depositAmount: lease.depositAmount.toString(),
        moveInCID: lease.moveInCID,
        moveOutCID: lease.moveOutCID,
      });

      // 2. Fetch move-in metadata from IPFS (uploaded at lease creation)
      let moveInData = {};
      if (lease.moveInCID) {
        try {
          console.log(`[Dispute] Fetching move-in evidence from IPFS: ${lease.moveInCID}`);
          moveInData = await fetchFromIPFS(lease.moveInCID);
        } catch (err) {
          console.warn(`[Dispute] Could not fetch move-in IPFS data: ${err.message}`);
        }
      }

      // 3. Fetch move-out / damage claim metadata from IPFS (uploaded by landlord at proposeRelease)
      let moveOutData = {};
      if (lease.moveOutCID) {
        try {
          console.log(`[Dispute] Fetching move-out/damage evidence from IPFS: ${lease.moveOutCID}`);
          moveOutData = await fetchFromIPFS(lease.moveOutCID);
        } catch (err) {
          console.warn(`[Dispute] Could not fetch move-out IPFS data: ${err.message}`);
        }
      } else {
        console.warn(`[Dispute] No move-out CID found — landlord did not upload damage photos. Ruling in tenant's favour.`);
      }

      // 4. Run LLM visual analysis
      console.log(`[LLM] Running dispute analysis with photo comparison...`);
      const verdict = await analyzeDispute({
        leaseTerms: moveInData.leaseTerms || {},
        moveInPhotoCIDs: moveInData.moveInPhotoCIDs || [],    // array of image CIDs from move-in
        moveOutPhotoCIDs: moveOutData.moveOutPhotoCIDs || [], // array of damage photo CIDs
        landlordClaim: moveOutData.landlordClaim || "Landlord claims deposit deduction for damages.",
        tenantClaim: moveInData.tenantClaim || "Tenant disputes the damage claim.",
        depositAmount: lease.depositAmount.toString(),
      });

      console.log(`[LLM] Verdict:`, verdict);

      // 5. Store verdict on IPFS for audit trail
      try {
        const verdictCID = await uploadToIPFS(
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
      }

      // 6. Check confidence threshold
      if (verdict.confidence < CONFIDENCE_THRESHOLD) {
        console.warn(
          `[Escalate] Lease #${leaseId} — confidence ${verdict.confidence} below threshold (${CONFIDENCE_THRESHOLD}). Manual review needed.`
        );
        return;
      }

      // 7. Submit verdict on-chain
      const amountToLandlordBN = BigInt(Math.round(verdict.amountToLandlord));
      const tx = await escrow.resolveDispute(leaseId, amountToLandlordBN);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`[Contract] ✓ Dispute #${leaseId} resolved. Tx: ${tx.hash}`);
        console.log(`[Contract]   Landlord gets: ${verdict.amountToLandlord} USDC + stake`);
        console.log(`[Contract]   Tenant gets: ${lease.depositAmount - amountToLandlordBN} USDC`);
      } else {
        console.error(`[Contract] ✗ Transaction failed: ${tx.hash}`);
      }
    } catch (err) {
      console.error(`[Error] Dispute handler for lease #${leaseId}:`, err.message);
      console.error(err.stack);
    }
  });
}

module.exports = { startDisputeListener };