# 🔒 RentLock — AI-Powered Blockchain Rental Escrow

A trustless, on-chain rental deposit system that uses **Google Gemini AI** to automatically resolve disputes by analyzing evidence stored on **IPFS**.

> **Course Project:** IS4302 Blockchain Technology & Applications  
> **Stack:** Solidity · Hardhat · React (Vite) · Node.js · Wagmi · Viem · Google Gemini · IPFS/Pinata  
> **Local Chain:** Hardhat (Chain ID `1337`)

---

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Frontend      │    │   Backend        │    │  Smart Contracts  │
│   (React/Vite)  │◄──►│   (Node.js)     │◄──►│  (Solidity/HH)   │
│   :5173         │    │   :3001          │    │  :8545            │
└─────────────────┘    └────────┬────────┘    └──────────────────┘
                                │
                    ┌───────────┴──────────┐
                    │    External Services  │
                    │  • Google Gemini AI   │
                    │  • IPFS / Pinata      │
                    └──────────────────────┘
```

---

## 📋 Prerequisites

Before you start, make sure you have:

- **Node.js** v18+ (`node --version`)
- **npm** v9+ (`npm --version`)
- **MetaMask** browser extension installed
- **Git** (to clone this repo)
- API Keys (see [Environment Setup](#-environment-setup)):
  - Google Gemini API Key
  - Pinata IPFS JWT (optional — a demo fallback is built in)

---

## 🚀 Full Setup Guide (First Time)

### Step 1: Clone & Install Dependencies

```bash
git clone <repo-url>
cd IS4302-Blockchain-Project

# Install all dependencies
cd contracts && npm install
cd ../backend  && npm install
cd ../frontend && npm install
```

### Step 2: Environment Setup

#### Backend (`backend/.env`)
Create `backend/.env` with the following:
```env
PORT=3001
CHAIN_ID=1337
RPC_URL=http://127.0.0.1:8545
BACKEND_WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Paste these after deploying contracts (Step 4):
ESCROW_MANAGER_ADDRESS=
USDC_ADDRESS=

# External APIs:
GEMINI_API_KEY=<your_google_ai_studio_key>
PINATA_JWT=<your_pinata_jwt_token>
```

#### Frontend (`frontend/.env`)
Create `frontend/.env` with the following:
```env
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=1337

# Paste these after deploying contracts (Step 4):
VITE_ESCROW_ADDRESS=
VITE_USDC_ADDRESS=
```

### Step 3: Configure MetaMask

1. **Add Hardhat Network** to MetaMask:
   - Network Name: `Hardhat`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `1337`
   - Currency Symbol: `ETH`

2. **Create Two Accounts** in MetaMask:
   - Rename Account 1 → **"Landlord"**
   - Create Account 2 → Rename to **"Tenant"**
   - Note down the **Ethereum (`0x...`) address** of the Tenant account

### Step 4: Start the Local Blockchain

Open a terminal in the `contracts/` folder:
```bash
cd contracts
npx hardhat node
```
> ✅ Leave this terminal running. You should see "Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/"

### Step 5: Deploy Contracts

Open a **new terminal** in `contracts/`:
```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

Copy the output addresses and paste them into **both** `.env` files:
```
VITE_USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_ESCROW_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
ESCROW_MANAGER_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```
> ⚠️ The addresses above are **deterministic** — they will always be the same if you redeploy on a fresh Hardhat node.

### Step 6: Fund Your MetaMask Wallet

MetaMask starts with 0 balance on local networks. Run this in a terminal inside `contracts/`:

```powershell
node -e "const { ethers } = require('ethers'); const abi = ['function mint(address to, uint256 amount) public']; const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545'); const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider); const usdc = new ethers.Contract('0x5FbDB2315678afecb367f032d93F642f64180aa3', abi, wallet); async function fill() { const target = 'PASTE_YOUR_LANDLORD_0x_ADDRESS_HERE'; let nonce = await provider.getTransactionCount(wallet.address); await wallet.sendTransaction({ to: target, value: ethers.parseEther('10.0'), nonce: nonce++ }); await usdc.mint(target, ethers.parseUnits('10000', 6), { nonce: nonce++ }); console.log('Done! Wallet funded.'); } fill();"
```
> Replace `PASTE_YOUR_LANDLORD_0x_ADDRESS_HERE` with the Landlord's MetaMask address.

After running, check MetaMask — your Landlord account should show **~10 ETH**.

### Step 7: Start Backend & Frontend

```bash
# Terminal 3 — Backend
cd backend && npm run dev

# Terminal 4 — Frontend
cd frontend && npm run dev
```

Open your browser at **`http://localhost:5173`** and connect MetaMask.

> ⚠️ **If MetaMask shows old failed transactions** after restarting Hardhat:  
> MetaMask → Settings → Advanced → **"Clear activity tab data"** → Refresh the page.

---

## 🎬 Demo Flow

### Scenario A: Mutual Release (Happy Path)

| Step | Role | Action |
|------|------|--------|
| 1 | **Landlord** | Click "Create New" → Fill form → Upload lease doc → Deploy Escrow |
| 2 | MetaMask | Confirm **2 popups**: (1) Approve USDC stake → (2) Create Lease |
| 3 | **Tenant** | Switch MetaMask to Tenant account → Click "Approve & Deposit" |
| 4 | **Landlord** | Switch back to Landlord → Click "Propose Release" |
| 5 | **Tenant** | Click "Accept Release" → Funds distributed! |

### Scenario B: AI Dispute Resolution ⭐

Follow steps 1–3 of Scenario A to get to `LOCKED` state, then:

1. **Tenant**: Click **"Raise Dispute"**
2. Watch the **Backend terminal** — you'll see:
   ```
   ✓ DisputeRaised event detected for lease #1
   ✓ Fetching IPFS evidence...
   ✓ Sending to Gemini AI for analysis...
   ✓ Verdict received. Submitting resolveDispute transaction...
   ```
3. The lease automatically moves to `RELEASED` with funds distributed per AI verdict.

---

## 💡 Creating an Escrow — What to Fill In

| Field | What to enter |
|-------|--------------|
| **Tenant address** | The Tenant MetaMask Ethereum (`0x...`) address |
| **Deposit amount** | e.g. `1000` (USDC) |
| **Deadline** | Any future date |
| **Grace period** | e.g. `7` (days) |
| **Evidence upload** | Any PDF or image (or skip — demo fallback is built in) |

> The Landlord automatically stakes **20% of the deposit** (e.g. 200 USDC for a 1000 USDC deposit) as a performance guarantee.

---

## 🛠️ Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **Gas limit error** in MetaMask | MetaMask cached a broken gas estimate | Settings → Advanced → **Clear activity tab data** → Refresh |
| **"Nonce too low"** | Hardhat was restarted without resetting MetaMask | Same fix as above |
| **`ERC20InsufficientAllowance`** | The approve step didn't complete first | The app now handles this automatically — just try again after resetting |
| **`EADDRINUSE :3001`** | Ghost node process stuck on port | Run `taskkill /F /IM node.exe` in PowerShell |
| **Blank review page** | Page loaded before file upload confirmed | Click "Next: Review" — a demo CID is auto-assigned if no file uploaded |
| **Tenant shows $0.00** | Tenant wallet not funded | Run the Fill Wallet script above for the Tenant address too |
| **`Failed to fetch` (IPFS)** | Pinata JWT not configured | The app falls back to a demo CID automatically |

---

## 🔐 Security Notes (Local Demo Only)

> [!WARNING]
> The private keys and API keys shown in this README are for **local development only**.
> The Hardhat deployer key (`0xac097...`) is publicly known and must **never** be used on mainnet.

---

## 🏛️ Smart Contract Functions

| Function | Role | Triggered By |
|----------|------|-------------|
| `initializeLease()` | Creates escrow, pulls 20% stake from Landlord | Landlord |
| `depositFunds()` | Tenant locks deposit, moves to LOCKED state | Tenant |
| `proposeRelease()` | Landlord proposes a payout split | Landlord |
| `acceptRelease()` | Tenant accepts split, funds distributed | Tenant |
| `raiseDispute()` | Moves to DISPUTED, triggers AI backend | Tenant |
| `resolveDispute()` | AI verdict submitted on-chain | Backend (Verifier) |
| `timeoutRefund()` | Refunds tenant if deadline + grace period passes | Anyone |

---

**Built with ❤️ for trustless rentals**


