const { escrow } = require("../provider");

/**
 * Start listening for lease lifecycle events
 * These listeners log state transitions for monitoring and debugging
 */
async function startLeaseListeners() {
  console.log("[Listener] Watching for lease lifecycle events...");

  escrow.on("LeaseInitialized", (leaseId, landlord, tenant, cid) => {
    console.log(`[Lease] #${leaseId} initialized`);
    console.log(`  Landlord: ${landlord}`);
    console.log(`  Tenant:   ${tenant}`);
    console.log(`  CID:      ${cid}`);
    console.log(`  State:    CREATED`);
  });

  escrow.on("FundsDeposited", (leaseId, amount) => {
    console.log(`[Lease] #${leaseId} LOCKED — tenant deposited ${amount} USDC`);
  });

  escrow.on("LeaseReleased", (leaseId, toLandlord, toTenant) => {
    console.log(`[Lease] #${leaseId} RELEASED`);
    console.log(`  Landlord receives: ${toLandlord} USDC`);
    console.log(`  Tenant receives:   ${toTenant} USDC`);
  });

  escrow.on("LeaseRefunded", (leaseId, toTenant) => {
    console.log(`[Lease] #${leaseId} REFUNDED`);
    console.log(`  Tenant receives (full deposit): ${toTenant} USDC`);
    console.log(`  Landlord stake slashed to feeAddress`);
  });

  escrow.on("DisputeRaised", (leaseId, verifier) => {
    console.log(`[Lease] #${leaseId} DISPUTED`);
    console.log(`  Assigned verifier: ${verifier}`);
    console.log(`  LLM analysis will proceed...`);
  });

  escrow.on("DisputeResolved", (leaseId, toLandlord, toTenant) => {
    console.log(`[Lease] #${leaseId} DISPUTE RESOLVED`);
    console.log(`  Landlord receives: ${toLandlord} USDC`);
    console.log(`  Tenant receives:   ${toTenant} USDC`);
  });
}

module.exports = { startLeaseListeners };
