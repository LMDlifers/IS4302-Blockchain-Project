const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying RentLock contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📋 Deployer address:", deployer.address);
  console.log("   Balance:", (await ethers.provider.getBalance(deployer.address)) / BigInt(10 ** 18), "ETH");

  try {
    // 1. Deploy MockUSDC
    console.log("\n1️⃣  Deploying MockUSDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log("   ✓ MockUSDC deployed at:", usdcAddress);

    // 2. Deploy EscrowManager
    console.log("\n2️⃣  Deploying EscrowManager...");
    const EscrowManager = await ethers.getContractFactory("EscrowManager");
    const escrow = await EscrowManager.deploy(usdcAddress, deployer.address);
    await escrow.waitForDeployment();
    const escrowAddress = await escrow.getAddress();
    console.log("   ✓ EscrowManager deployed at:", escrowAddress);

    // 3. Mint test USDC to deployer
    console.log("\n3️⃣  Minting test USDC...");
    const testAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    const mintTx = await usdc.mint(deployer.address, testAmount);
    await mintTx.wait();
    console.log("   ✓ Minted 10,000 USDC to deployer");

    // 4. Add deployer as a verifier for testing
    console.log("\n4️⃣  Adding verifier...");
    const addVerifierTx = await escrow.addVerifier(deployer.address);
    await addVerifierTx.wait();
    console.log("   ✓ Added deployer as verifier");

    console.log("\n" + "=".repeat(50));
    console.log("✅ DEPLOYMENT SUCCESSFUL");
    console.log("=".repeat(50));
    console.log("\n📌 CONTRACT ADDRESSES:\n");
    console.log(`VITE_USDC_ADDRESS=${usdcAddress}`);
    console.log(`VITE_ESCROW_ADDRESS=${escrowAddress}`);
    console.log(`BACKEND_WALLET_ADDRESS=${deployer.address}\n`);
    console.log("ESCROW_MANAGER_ADDRESS=" + escrowAddress);
    console.log("USDC_ADDRESS=" + usdcAddress);
    console.log("\n💾 Update your .env files with these addresses.");
  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    process.exitCode = 1;
  }
}

main();
