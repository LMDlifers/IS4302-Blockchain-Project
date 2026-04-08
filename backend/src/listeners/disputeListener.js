const { ethers } = require("ethers");
const { escrow, provider } = require("../provider");
const { fetchFromIPFS, uploadToIPFS } = require("../services/ipfsService");
const { analyzeDispute } = require("../services/llmService");

const CONFIDENCE_THRESHOLD = parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD || "0.80");

// ✅ Add this set to remember processed leases
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
        const leaseId = event.args[0].toString(); // Convert to string for the Set
        const verifier = event.args[1];

        // ✅ Check if we already processed this exact lease dispute
        if (processedLeases.has(leaseId)) {
          continue; // Skip it!
        }
        
        // Add to our memory so we never process it again
        processedLeases.add(leaseId);

        console.log(`\n[Dispute] Lease #${leaseId} disputed. Verifier: ${verifier}`);
        
        // Process the dispute found
        await processDispute(leaseId, verifier);
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
    // 1. Fetch lease data from contract
    const lease = await escrow.leases(leaseId);

    // Convert raw on-chain deposit (6 decimals) to human-readable USDC
    const depositHuman = Number(lease.depositAmount) / 1_000_000;

    console.log(`[Dispute] Lease data:`, {
      landlord: lease.landlord,
      tenant: lease.tenant,
      depositAmount: `${depositHuman} USDC`,
      moveInCID: lease.moveInCID,
      moveOutCID: lease.moveOutCID,
    });

    // 2. Fetch move-in metadata from IPFS
    let moveInData = {};
    if (lease.moveInCID) {
      try {
        console.log(`[Dispute] Fetching move-in evidence from IPFS: ${lease.moveInCID}`);
        moveInData = await fetchFromIPFS(lease.moveInCID);
      } catch (err) {
        console.warn(`[Dispute] Could not fetch move-in IPFS data: ${err.message}`);
      }
    }

    // 3. Fetch move-out / damage claim metadata from IPFS
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

    // 4. Run Gemini LLM visual analysis
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

    // 5. Store verdict on IPFS for audit trail
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
      // If IPFS fails, we must still have a string for the smart contract
      verdictCID = "IPFS_UPLOAD_FAILED"; 
    }

    // 6. Submit verdict on-chain as a PROPOSAL
    // Convert human USDC back to raw token units
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
    console.error(`[Error] Dispute handler for lease #${leaseId}:`, err.message);
    console.error(err.stack);
  }
}

module.exports = { startDisputeListener };