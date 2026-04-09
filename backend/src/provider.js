// 1. Load environment variables FIRST before doing anything else
require("dotenv").config();

const { ethers } = require("ethers");
const { ESCROW_ADDRESS, ESCROW_ABI } = require("../config/contracts");

// 2. Validate the private key exists
const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
if (!privateKey) {
  console.error("❌ ERROR: BACKEND_WALLET_PRIVATE_KEY is missing from your .env file!");
  console.error("Please add it before starting the backend.");
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const wsUrl = rpcUrl.replace("http://", "ws://").replace("https://", "wss://");

console.log(`🔌 Connecting to Blockchain via WebSocket: ${wsUrl}`);

// 3. Setup Provider and Wallet
const provider = new ethers.WebSocketProvider(wsUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);

// 4. Handle WebSocket connections dropping
provider.websocket.on("close", (code) => {
  console.error(`❌ WebSocket closed (code: ${code}). Reconnecting in 3s...`);
  setTimeout(() => {
    console.log("🔄 Restarting backend to reconnect...");
    process.exit(1); // nodemon will auto-restart
  }, 3000);
});

provider.websocket.on("error", (err) => {
  console.error(`❌ WebSocket error: ${err.message}`);
});

module.exports = { provider, wallet, escrow };