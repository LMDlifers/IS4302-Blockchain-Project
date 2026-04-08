const { ethers } = require("ethers");
const { ESCROW_ADDRESS, ESCROW_ABI } = require("../config/contracts");

require("dotenv").config();

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const wsUrl = rpcUrl.replace("http://", "ws://").replace("https://", "wss://");

console.log(`🔌 Connecting to Blockchain via WebSocket: ${wsUrl}`);

const provider = new ethers.WebSocketProvider(wsUrl);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);

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