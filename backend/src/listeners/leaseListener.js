const { escrow } = require("../provider");

/**
 * Registers event listeners for lease lifecycle state transitions.
 * These listeners are informational — they log each transition for monitoring
 * and debugging but do not perform any on-chain actions themselves.
 * (On-chain actions for disputes are handled by disputeListener.js.)
 */
async function startLeaseListeners() {
  console.log("[Listener] Watching for lease lifecycle events...");

  escrow.on("LeaseInitialized", (leaseId, landlord, tenant, cid) => {
    console.log(`[Lease] #${leaseId} CREATED`);
    console.log(`  Landlord: ${landlord}`);
    console.log(`  Tenant:   ${tenant}`);
    console.log(`  CID:      ${cid}`);
  });

  escrow.on("FundsDeposited", (leaseId, amount) => {
    console.log(`[Lease] #${leaseId} LOCKED — tenant deposited ${amount} USDC`);
  });

  escrow.on("LeaseReleased", (leaseId, toLandlord, toTenant) => {
    console.log(`[Lease] #${leaseId} RELEASED (mutual agreement)`);
    console.log(`  Landlord receives: ${toLandlord}`);
    console.log(`  Tenant receives:   ${toTenant}`);
  });

  escrow.on("LeaseRefunded", (leaseId, toTenant) => {
    console.log(`[Lease] #${leaseId} REFUNDED (timeout)`);
    console.log(`  Tenant receives (full deposit): ${toTenant}`);
    console.log(`  Landlord stake slashed to feeAddress`);
  });

  escrow.on("DisputeRaised", (leaseId, verifier) => {
    console.log(`[Lease] #${leaseId} DISPUTED`);
    console.log(`  Assigned verifier: ${verifier}`);
  });

  escrow.on("DisputeResolved", (leaseId, toLandlord, toTenant) => {
    console.log(`[Lease] #${leaseId} DISPUTE RESOLVED`);
    console.log(`  Landlord receives: ${toLandlord}`);
    console.log(`  Tenant receives:   ${toTenant}`);
  });
}

module.exports = { startLeaseListeners };
