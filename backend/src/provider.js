const { ethers } = require("ethers");
const { ESCROW_ADDRESS, ESCROW_ABI } = require("../config/contracts");

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Initialize contract instance with signer (for write operations)
const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);

module.exports = { provider, wallet, escrow };
