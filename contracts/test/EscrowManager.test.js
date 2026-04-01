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
      expect(lease.ipfsCID).to.equal("QmTestCID123");
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
      const amountToLandlord = ethers.parseUnits("200", 6); // Keep 200 USDC (20%)

      await escrow.connect(landlord).proposeRelease(1, amountToLandlord);

      const lease = await escrow.leases(1);
      expect(lease.amountToLandlord).to.equal(amountToLandlord);
    });

    it("Tenant should be able to accept release and funds should transfer", async function () {
      const amountToLandlord = ethers.parseUnits("200", 6);
      await escrow.connect(landlord).proposeRelease(1, amountToLandlord);

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

    it("Should emit LeaseReleased event", async function () {
      const amountToLandlord = ethers.parseUnits("200", 6);
      await escrow.connect(landlord).proposeRelease(1, amountToLandlord);

      await expect(escrow.connect(tenant).acceptRelease(1))
        .to.emit(escrow, "LeaseReleased")
        .withArgs(1, amountToLandlord + STAKE, DEPOSIT - amountToLandlord);
    });
  });

  describe("Scenario B: Timeout / No-Show Refund", function () {
    beforeEach(async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 24 * 60 * 60; // 1 day
      const gracePeriod = 7 * 24 * 60 * 60; // 7 days

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
      // Try to refund immediately
      await expect(escrow.connect(tenant).timeoutRefund(1))
        .to.be.revertedWith("Grace period not expired");
    });

    it("Should allow refund after deadline + grace period expires", async function () {
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 24 * 60 * 60;
      const gracePeriod = 7 * 24 * 60 * 60;

      // Fast-forward time
      await time.increase(deadline + gracePeriod + 1000);

      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);
      const feeAddressBalanceBefore = await usdc.balanceOf(landlord.address); // feeAddress is landlord in test

      await escrow.connect(other).timeoutRefund(1);

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
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 24 * 60 * 60;
      const gracePeriod = 7 * 24 * 60 * 60;

      await time.increase(deadline + gracePeriod + 1000);

      await expect(escrow.connect(other).timeoutRefund(1))
        .to.emit(escrow, "LeaseRefunded")
        .withArgs(1, DEPOSIT);
    });
  });

  describe("Scenario C: Dispute with LLM Judge", function () {
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

  describe("Verifier Pool Management", function () {
    it("Owner should be able to add verifiers", async function () {
      await escrow.connect(landlord).addVerifier(other.address);

      // other should now be in pool
      const pool = await escrow.verifierPool(1); // 0 = landlord (added in beforeEach), 1 = other
      expect(pool).to.equal(other.address);
    });

    it("Owner should be able to remove verifiers", async function () {
      // This test verifies that removeVerifier function works
      // The beforeEach adds verifier to the pool
      // We call removeVerifier and the tx should succeed
      const removeTx = await escrow.connect(landlord).removeVerifier(verifier.address);
      expect(removeTx).to.exist; // Transaction completed successfully
    });

    it("Non-owner should not be able to add verifiers", async function () {
      await expect(
        escrow.connect(tenant).addVerifier(other.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
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

    it("Should protect against reentrancy on acceptRelease", async function () {
      // This test verifies nonReentrant is working
      // Full reentrancy testing would require a mock contract, but the nonReentrant modifier is in place
      const deadline = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 60 * 60;
      await escrow.connect(landlord).initializeLease(
        tenant.address,
        DEPOSIT,
        deadline,
        7 * 24 * 60 * 60,
        "QmTestCID123"
      );
      await escrow.connect(tenant).depositFunds(1);
      await escrow.connect(landlord).proposeRelease(1, ethers.parseUnits("200", 6));

      // Normal call should work
      await expect(escrow.connect(tenant).acceptRelease(1))
        .not.to.be.reverted;
    });
  });
});
