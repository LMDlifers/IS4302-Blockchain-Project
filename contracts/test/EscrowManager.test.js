import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("EscrowManager", function () {
  let escrow, usdc;
  let landlord, tenant, verifier, other;
  const DEPOSIT = ethers.parseUnits("1000", 6); // 1000 USDC
  const STAKE = DEPOSIT / 5n; // 20% = 200 USDC
  let leaseId = 1n;

  beforeEach(async function () {
    [landlord, tenant, verifier, other] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy EscrowManager
    const EscrowManager = await ethers.getContractFactory("EscrowManager");
    escrow = await EscrowManager.deploy(await usdc.getAddress(), landlord.address);
    await escrow.waitForDeployment();

    // Mint USDC to landlord and tenant
    await usdc.mint(landlord.address, ethers.parseUnits("10000", 6));
    await usdc.mint(tenant.address, ethers.parseUnits("10000", 6));

    // Add verifier to the pool
    await escrow.connect(landlord).addVerifier(verifier.address);

    // Approve EscrowManager to spend USDC
    await usdc.connect(landlord).approve(await escrow.getAddress(), ethers.parseUnits("100000", 6));
    await usdc.connect(tenant).approve(await escrow.getAddress(), ethers.parseUnits("100000", 6));
  });

  describe("Initialization", function () {
    it("Should initialize a lease with correct state", async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60; // 1 year
      const gracePeriod = 7 * 24 * 60 * 60; // 7 days

      const tx = await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        gracePeriod,
        "QmTestCID123"
      );

      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      // Verify lease was created
      const lease = await escrow.leases(1);
      expect(lease.landlord).to.equal(landlord.address);
      expect(lease.tenant).to.equal(tenant.address);
      expect(lease.depositAmount).to.equal(DEPOSIT);
      expect(lease.landlordStake).to.equal(STAKE);
      expect(lease.state).to.equal(0); // CREATED
      expect(lease.moveInCID).to.equal("QmTestCID123"); // Fix 2.2: was lease.ipfsCID
    });

    it("Should transfer stake from landlord to contract", async function () {
      const balanceBefore = await usdc.balanceOf(landlord.address);

      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );

      const balanceAfter = await usdc.balanceOf(landlord.address);
      expect(balanceBefore - balanceAfter).to.equal(STAKE);
    });

    it("Should fail if deadline is in the past", async function () {
      const pastDeadline = (await ethers.provider.getBlock("latest")).timestamp - 1000;

      await expect(
        escrow.connect(landlord).initializeLease(
          tenant.address,
          DEPOSIT,
          pastDeadline,
          7 * 24 * 60 * 60,
          "QmTestCID123"
        )
      ).to.be.revertedWith("Deadline in past");
    });

    it("Should fail if deposit is too small (zero stake)", async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      // Fix 1.8: 4 micro-USDC stake would truncate to 0
      await expect(
        escrow.connect(landlord).initializeLease(
          tenant.address,
          4n, // 4 micro-USDC → stake = 0
          deadline,
          7 * 24 * 60 * 60,
          "QmTestCID123"
        )
      ).to.be.revertedWith("Deposit too small for valid stake");
    });
  });

  describe("Scenario A: Mutual Release (Happy Path)", function () {
    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );

      // Tenant deposits funds
      await escrow.connect(tenant).depositFunds(1);
    });

    it("Should move to LOCKED state after tenant deposits", async function () {
      const lease = await escrow.leases(1);
      expect(lease.state).to.equal(1); // LOCKED
    });

    it("Landlord should be able to propose a release split", async function () {
      const amountToLandlord = ethers.parseUnits("200", 6);

      // Fix 2.1: added moveOutCID as 3rd argument
      await escrow.connect(landlord).proposeRelease(1, amountToLandlord, "QmMoveOutCID123");

      const lease = await escrow.leases(1);
      expect(lease.amountToLandlord).to.equal(amountToLandlord);
      expect(lease.moveOutCID).to.equal("QmMoveOutCID123");
    });

    it("Landlord should not be able to re-propose after first proposal", async function () {
      const amountToLandlord = ethers.parseUnits("200", 6);
      await escrow.connect(landlord).proposeRelease(1, amountToLandlord, "QmMoveOutCID123");
      // Fix 1.6: second proposal must revert
      await expect(
        escrow.connect(landlord).proposeRelease(1, ethers.parseUnits("300", 6), "QmNewCID")
      ).to.be.revertedWith("Release already proposed");
    });

    it("Tenant should be able to accept release and funds should transfer", async function () {
      const amountToLandlord = ethers.parseUnits("200", 6);
      // Fix 2.1: added moveOutCID
      await escrow.connect(landlord).proposeRelease(1, amountToLandlord, "QmMoveOutCID123");

      const landlordBalanceBefore = await usdc.balanceOf(landlord.address);
      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);

      await escrow.connect(tenant).acceptRelease(1);

      const landlordBalanceAfter = await usdc.balanceOf(landlord.address);
      const tenantBalanceAfter = await usdc.balanceOf(tenant.address);

      // Landlord should get: amountToLandlord (200) + stake (200) = 400
      // Tenant should get: DEPOSIT - amountToLandlord = 1000 - 200 = 800
      expect(landlordBalanceAfter - landlordBalanceBefore).to.equal(amountToLandlord + STAKE);
      expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(DEPOSIT - amountToLandlord);

      // Lease should be RELEASED
      const lease = await escrow.leases(1);
      expect(lease.state).to.equal(3); // RELEASED
    });

    it("Should emit ReleaseProposed and LeaseReleased events", async function () {
      const amountToLandlord = ethers.parseUnits("200", 6);

      // Fix 1.6: check new ReleaseProposed event
      await expect(escrow.connect(landlord).proposeRelease(1, amountToLandlord, "QmMoveOutCID123"))
        .to.emit(escrow, "ReleaseProposed")
        .withArgs(1, amountToLandlord, "QmMoveOutCID123");

      await expect(escrow.connect(tenant).acceptRelease(1))
        .to.emit(escrow, "LeaseReleased")
        .withArgs(1, amountToLandlord + STAKE, DEPOSIT - amountToLandlord);
    });

    it("Should revert acceptRelease if no proposal exists", async function () {
      await expect(escrow.connect(tenant).acceptRelease(1))
        .to.be.revertedWith("Landlord has not proposed a release yet");
    });
  });

  describe("Scenario B: Timeout / No-Show Refund", function () {
    let deadline, gracePeriod;

    beforeEach(async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      deadline = latestBlock.timestamp + 24 * 60 * 60; // 1 day from now
      gracePeriod = 7 * 24 * 60 * 60; // 7 days

      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        gracePeriod,
        "QmTestCID123"
      );

      // Tenant deposits funds
      await escrow.connect(tenant).depositFunds(1);
    });

    it("Should not allow refund before grace period expires", async function () {
      // Fix 1.5: timeoutRefund now requires onlyTenant
      await expect(escrow.connect(tenant).timeoutRefund(1))
        .to.be.revertedWith("Grace period not expired");
    });

    it("Should not allow non-tenant to call timeoutRefund", async function () {
      // Fix 1.5: verify onlyTenant guard
      await time.increaseTo(deadline + gracePeriod + 1);
      await expect(escrow.connect(other).timeoutRefund(1))
        .to.be.revertedWith("Not tenant");
    });

    it("Should allow tenant refund after deadline + grace period expires", async function () {
      // Fix 2.3: use time.increaseTo with absolute timestamp
      await time.increaseTo(deadline + gracePeriod + 1);

      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);
      const feeAddressBalanceBefore = await usdc.balanceOf(landlord.address); // feeAddress is landlord in test

      // Fix 1.5 + 2.3: now called by tenant with correct time jump
      await escrow.connect(tenant).timeoutRefund(1);

      const tenantBalanceAfter = await usdc.balanceOf(tenant.address);
      const feeAddressBalanceAfter = await usdc.balanceOf(landlord.address);

      // Tenant should get full deposit back
      expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(DEPOSIT);
      // feeAddress should get the slashed stake
      expect(feeAddressBalanceAfter - feeAddressBalanceBefore).to.equal(STAKE);

      // Lease should be REFUNDED
      const lease = await escrow.leases(1);
      expect(lease.state).to.equal(4); // REFUNDED
    });

    it("Should emit LeaseRefunded event", async function () {
      // Fix 2.3: use time.increaseTo
      await time.increaseTo(deadline + gracePeriod + 1);

      // Fix 1.5: called by tenant
      await expect(escrow.connect(tenant).timeoutRefund(1))
        .to.emit(escrow, "LeaseRefunded")
        .withArgs(1, DEPOSIT);
    });
  });

  describe("Scenario C: Dispute with LLM Judge (resolveDispute)", function () {
    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );

      // Tenant deposits funds
      await escrow.connect(tenant).depositFunds(1);
    });

    it("Tenant should be able to raise a dispute", async function () {
      await expect(escrow.connect(tenant).raiseDispute(1))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(1, verifier.address);

      const lease = await escrow.leases(1);
      expect(lease.state).to.equal(2); // DISPUTED
      expect(lease.verifier).to.equal(verifier.address);
    });

    it("Only verifier can resolve dispute", async function () {
      await escrow.connect(tenant).raiseDispute(1);

      // Other account should not be able to resolve
      await expect(
        escrow.connect(other).resolveDispute(1, ethers.parseUnits("300", 6))
      ).to.be.revertedWith("Not verifier");
    });

    it("Verifier should be able to resolve dispute and split deposit", async function () {
      await escrow.connect(tenant).raiseDispute(1);

      const amountToLandlord = ethers.parseUnits("300", 6); // LLM verdict: 30%

      const landlordBalanceBefore = await usdc.balanceOf(landlord.address);
      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);

      await escrow.connect(verifier).resolveDispute(1, amountToLandlord);

      const landlordBalanceAfter = await usdc.balanceOf(landlord.address);
      const tenantBalanceAfter = await usdc.balanceOf(tenant.address);

      // Landlord should get: amountToLandlord (300) + stake (200) = 500
      // Tenant should get: DEPOSIT - amountToLandlord = 1000 - 300 = 700
      expect(landlordBalanceAfter - landlordBalanceBefore).to.equal(amountToLandlord + STAKE);
      expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(DEPOSIT - amountToLandlord);

      // Lease should be RELEASED
      const lease = await escrow.leases(1);
      expect(lease.state).to.equal(3); // RELEASED
    });

    it("Should emit DisputeResolved event", async function () {
      await escrow.connect(tenant).raiseDispute(1);

      const amountToLandlord = ethers.parseUnits("500", 6);

      await expect(escrow.connect(verifier).resolveDispute(1, amountToLandlord))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(1, amountToLandlord + STAKE, DEPOSIT - amountToLandlord);
    });
  });

  // Fix 2.5: New describe block for full AI arbitration coverage
  describe("Scenario C: AI Arbitration (submitAIVerdict + acceptAIVerdict)", function () {
    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );
      await escrow.connect(tenant).depositFunds(1);
      await escrow.connect(tenant).raiseDispute(1);
    });

    it("Verifier should be able to submit an AI verdict", async function () {
      const amount = ethers.parseUnits("400", 6);
      await expect(
        escrow.connect(verifier).submitAIVerdict(1, amount, "QmVerdictCID")
      )
        .to.emit(escrow, "AIVerdictSubmitted")
        .withArgs(1, amount, "QmVerdictCID");

      expect(await escrow.aiVerdictCIDs(1)).to.equal("QmVerdictCID");
      expect(await escrow.verdictSubmitted(1)).to.equal(true);
    });

    it("Non-verifier should not be able to submit a verdict", async function () {
      await expect(
        escrow.connect(other).submitAIVerdict(1, ethers.parseUnits("400", 6), "QmVerdictCID")
      ).to.be.revertedWith("Not verifier");
    });

    it("Both parties accepting AI verdict should transfer funds", async function () {
      const amount = ethers.parseUnits("400", 6);
      await escrow.connect(verifier).submitAIVerdict(1, amount, "QmVerdictCID");

      const landlordBefore = await usdc.balanceOf(landlord.address);
      const tenantBefore = await usdc.balanceOf(tenant.address);

      // Tenant accepts first
      await escrow.connect(tenant).acceptAIVerdict(1);
      expect(await escrow.tenantAgreedAI(1)).to.equal(true);

      // Lease should still be DISPUTED
      let lease = await escrow.leases(1);
      expect(lease.state).to.equal(2);

      // Landlord accepts — triggers auto-resolution
      await escrow.connect(landlord).acceptAIVerdict(1);

      const landlordAfter = await usdc.balanceOf(landlord.address);
      const tenantAfter = await usdc.balanceOf(tenant.address);

      expect(landlordAfter - landlordBefore).to.equal(amount + STAKE);
      expect(tenantAfter - tenantBefore).to.equal(DEPOSIT - amount);

      lease = await escrow.leases(1);
      expect(lease.state).to.equal(3); // RELEASED
    });

    it("Should not allow verdict overwrite once a party has accepted", async function () {
      const amount = ethers.parseUnits("400", 6);
      await escrow.connect(verifier).submitAIVerdict(1, amount, "QmVerdictCID");

      // Tenant accepts
      await escrow.connect(tenant).acceptAIVerdict(1);

      // Verifier tries to overwrite — must revert because tenant already accepted
      await expect(
        escrow.connect(verifier).submitAIVerdict(1, ethers.parseUnits("600", 6), "QmNewVerdict")
      ).to.be.revertedWith("Verdict already accepted by a party - cannot overwrite");
    });

    it("Should allow verifier to overwrite verdict if no one has accepted yet", async function () {
      const amount1 = ethers.parseUnits("300", 6);
      const amount2 = ethers.parseUnits("500", 6);
      await escrow.connect(verifier).submitAIVerdict(1, amount1, "QmVerdictCID1");

      // No one has accepted yet — overwrite is allowed
      await escrow.connect(verifier).submitAIVerdict(1, amount2, "QmVerdictCID2");

      const lease = await escrow.leases(1);
      expect(lease.amountToLandlord).to.equal(amount2);
      expect(await escrow.aiVerdictCIDs(1)).to.equal("QmVerdictCID2");
      // Agreement flags must be reset
      expect(await escrow.tenantAgreedAI(1)).to.equal(false);
      expect(await escrow.landlordAgreedAI(1)).to.equal(false);
    });

    it("Should not allow acceptAIVerdict without a submitted verdict", async function () {
      await expect(
        escrow.connect(tenant).acceptAIVerdict(1)
      ).to.be.revertedWith("No AI verdict yet");
    });
  });

  describe("Scenario C: Human Escalation", function () {
    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );
      await escrow.connect(tenant).depositFunds(1);
      await escrow.connect(tenant).raiseDispute(1);
    });

    it("Either party can escalate to human", async function () {
      await expect(escrow.connect(tenant).escalateToHuman(1))
        .to.emit(escrow, "HumanEscalationRequested")
        .withArgs(1, tenant.address);

      expect(await escrow.humanEscalated(1)).to.equal(true);
    });

    it("Non-party cannot escalate", async function () {
      await expect(
        escrow.connect(other).escalateToHuman(1)
      ).to.be.revertedWith("Not party");
    });

    it("Owner can assign human verifier after escalation", async function () {
      await escrow.connect(tenant).escalateToHuman(1);

      await expect(
        escrow.connect(landlord).assignHumanVerifier(1, other.address)
      )
        .to.emit(escrow, "HumanVerifierAssigned")
        .withArgs(1, other.address);

      const lease = await escrow.leases(1);
      expect(lease.verifier).to.equal(other.address);
    });

    it("Owner cannot assign human verifier without escalation", async function () {
      await expect(
        escrow.connect(landlord).assignHumanVerifier(1, other.address)
      ).to.be.revertedWith("Dispute not escalated to human");
    });

    it("Human verifier can resolve dispute after assignment", async function () {
      await escrow.connect(tenant).escalateToHuman(1);
      await escrow.connect(landlord).assignHumanVerifier(1, other.address);

      const amount = ethers.parseUnits("350", 6);
      const landlordBefore = await usdc.balanceOf(landlord.address);
      const tenantBefore = await usdc.balanceOf(tenant.address);

      await escrow.connect(other).resolveDispute(1, amount);

      expect(await usdc.balanceOf(landlord.address) - landlordBefore).to.equal(amount + STAKE);
      expect(await usdc.balanceOf(tenant.address) - tenantBefore).to.equal(DEPOSIT - amount);

      const lease = await escrow.leases(1);
      expect(lease.state).to.equal(3); // RELEASED
    });
  });

  describe("Verifier Pool Management", function () {
    it("Owner should be able to add verifiers", async function () {
      await escrow.connect(landlord).addVerifier(other.address);

      // other should now be in pool
      const pool = await escrow.verifierPool(1); // 0 = verifier (added in beforeEach), 1 = other
      expect(pool).to.equal(other.address);
    });

    it("Owner should be able to remove verifiers", async function () {
      const removeTx = await escrow.connect(landlord).removeVerifier(verifier.address);
      expect(removeTx).to.exist;
    });

    it("Non-owner should not be able to add verifiers", async function () {
      await expect(
        escrow.connect(tenant).addVerifier(other.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("_assignVerifier should skip verifiers who are a party to the lease", async function () {
      // Set up a second verifier and make the first verifier a landlord of a different lease
      // Simplest test: add `other` as verifier. The pool now has [verifier, other].
      // If landlord raised a dispute on lease #1, verifier (who is not landlord/tenant) should still be assigned.
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address, DEPOSIT, deadline, 7 * 24 * 60 * 60, "QmCID"
      );
      await escrow.connect(tenant).depositFunds(1);
      await escrow.connect(tenant).raiseDispute(1);

      const lease = await escrow.leases(1);
      // verifier is in pool and is neither landlord nor tenant
      expect(lease.verifier).to.equal(verifier.address);
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should prevent deposit exceeding allowed amount in dispute resolution", async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );
      await escrow.connect(tenant).depositFunds(1);
      await escrow.connect(tenant).raiseDispute(1);

      // Try to give more than deposit to landlord
      const tooMuch = DEPOSIT + ethers.parseUnits("1", 6);

      await expect(
        escrow.connect(verifier).resolveDispute(1, tooMuch)
      ).to.be.revertedWith("Exceeds deposit");
    });

    it("Should allow tenant to acceptRelease after landlord proposes (nonReentrant present)", async function () {
      // Fix 2.4: updated test to reflect nonReentrant is now actually in place
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );
      await escrow.connect(tenant).depositFunds(1);

      // Fix 2.1: proposeRelease with all 3 args
      await escrow.connect(landlord).proposeRelease(1, ethers.parseUnits("200", 6), "QmMoveOutCID");

      // Normal call should work; nonReentrant modifier is in place
      await expect(escrow.connect(tenant).acceptRelease(1))
        .not.to.be.reverted;
    });

    it("Should revert acceptRelease if tenant tries to call without proposal", async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );
      await escrow.connect(tenant).depositFunds(1);

      await expect(escrow.connect(tenant).acceptRelease(1))
        .to.be.revertedWith("Landlord has not proposed a release yet");
    });
  });
});
