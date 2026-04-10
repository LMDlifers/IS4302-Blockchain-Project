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

- **Node.js** v18+ and **npm** v9+
- **MetaMask** browser extension
- **Google Gemini API Key** — [Get one at Google AI Studio](https://aistudio.google.com/app/apikey)
- **Pinata JWT** (optional) — [app.pinata.cloud](https://app.pinata.cloud/developers/api-keys); a demo fallback CID is used if absent

---

## 🚀 Setup Guide

### Step 1 — Clone and install dependencies

```bash
git clone <repo-url>
cd IS4302-Blockchain-Project

npm install --prefix contracts
npm install --prefix backend
npm install --prefix frontend
```

---

### Step 2 — Create environment files

#### `backend/.env`

```env
PORT=3001
CHAIN_ID=1337
RPC_URL=http://127.0.0.1:8545

# Hardhat Account #0 private key (test only — never use on mainnet)
BACKEND_WALLET_PRIVATE_KEY=<hardhat_account_0_private_key>
BACKEND_WALLET_ADDRESS=<hardhat_account_0_address>

# Paste contract addresses after Step 5:
ESCROW_MANAGER_ADDRESS=
USDC_ADDRESS=

# External APIs:
GEMINI_API_KEY=<your_google_ai_studio_key>
PINATA_JWT=<your_pinata_jwt_token>
```

#### `frontend/.env`

```env
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=1337

# Paste contract addresses after Step 5:
VITE_ESCROW_ADDRESS=
VITE_USDC_ADDRESS=

# Optional overrides (defaults shown):
# VITE_API_BASE_URL=http://localhost:3001
# VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
# VITE_INFURA_KEY=<your_infura_key>   # Only needed for Sepolia testnet
```

> ⚠️ Never commit `.env` files. Both are listed in `.gitignore`.

---

### Step 3 — Configure MetaMask

**Add the Hardhat network:**

| Field | Value |
|-------|-------|
| Network Name | `Hardhat` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `1337` |
| Currency Symbol | `ETH` |

**Import test accounts** (MetaMask → top-right → Add account → Import account):

| Role | Private Key | Address |
|------|-------------|---------|
| Landlord (Account #0) | *First key from `npx hardhat node` output* | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Tenant (Account #1) | *Second key from `npx hardhat node` output* | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

> ⚠️ These are publicly known Hardhat test keys — **never use on mainnet.**

---

### Step 4 — Start the local blockchain

Open a dedicated terminal and leave it running:

```bash
cd contracts
npx hardhat node
```

You should see:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545
```

---

### Step 5 — Deploy contracts

In a new terminal:

```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

The output will print the deployed addresses, e.g.:
```
MockUSDC deployed to:   0x5FbDB2315678afecb367f032d93F642f64180aa3
EscrowManager deployed: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

Copy both addresses into **both** `.env` files:

```env
# backend/.env
USDC_ADDRESS=<address from output>
ESCROW_MANAGER_ADDRESS=<address from output>

# frontend/.env
VITE_USDC_ADDRESS=<address from output>
VITE_ESCROW_ADDRESS=<address from output>
```

> ✅ The deploy script auto-mints **10,000 USDC** to the Landlord account. No manual funding needed.

> ✅ Addresses are **deterministic** on a fresh Hardhat node — they will be the same every time you redeploy from scratch.

**Add MockUSDC to MetaMask** (so balances show in the wallet):
- MetaMask → Tokens → Import tokens
- Token contract: `<USDC_ADDRESS from above>` · Symbol: `USDC` · Decimals: `6`

---

### Step 6 — Start backend and frontend

Open two more terminals:

```bash
# Terminal 3 — Backend
cd backend
npm run dev
```

```bash
# Terminal 4 — Frontend
cd frontend
npm run dev
```

Open **`http://localhost:5173`** in your browser and connect MetaMask.

> ⚠️ **If MetaMask shows old failed transactions** after restarting Hardhat:  
> MetaMask → Settings → Advanced → **Clear activity tab data** → Refresh.

---

## 🎬 Demo Scenarios

### Scenario A — Mutual Release (happy path)

| Step | Who | Action |
|------|-----|--------|
| 1 | Landlord | Dashboard → **Create New** → fill form → upload move-in photos → Deploy Escrow |
| 2 | MetaMask | Confirm **2 popups**: approve USDC stake, then create lease |
| 3 | Tenant | Switch MetaMask to Tenant → click **Approve & Deposit** |
| 4 | Landlord | Switch back → click **Propose Release** (set amount + upload damage photos) |
| 5 | Tenant | Click **Accept & Release** → funds distributed |

### Scenario B — AI Dispute Resolution

Follow Scenario A steps 1–3, then:

| Step | Who | Action |
|------|-----|--------|
| 4 | Tenant | Click **Raise Dispute** |
| 5 | Backend | Automatically fetches IPFS evidence → sends to Gemini → submits verdict on-chain |
| 6 | Both | Review AI proposal in the UI → both click **Accept Proposal** → funds released |

### Scenario C — Human Escalation (HITL)

Follow Scenario B steps 1–5, then either party clicks **Contest AI Verdict → Request Human Review**. An admin using the **⚖️ Admin Panel** tab can then submit a final on-chain resolution.

---

## 💡 Creating an Escrow — Field Reference

| Field | Example |
|-------|---------|
| Tenant address | Tenant MetaMask address (`0x709...`) |
| Deposit amount | `1000` (USDC) |
| Deadline | Any future date (dd/mm/yyyy) |
| Grace period | `7` (days after deadline before timeout refund is claimable) |
| Move-in photos | Any images — or skip to use a demo fallback CID |

> The Landlord automatically stakes **20% of the deposit** (e.g. 200 USDC on a 1000 USDC deposit).

---

## 🏛️ Smart Contract Functions

| Function | Caller | Description |
|----------|--------|-------------|
| `initializeLease()` | Landlord | Creates escrow, pulls 20% stake |
| `depositFunds()` | Tenant | Locks deposit → state becomes LOCKED |
| `proposeRelease()` | Landlord | Proposes payout split + uploads move-out evidence |
| `acceptRelease()` | Tenant | Accepts split, distributes funds |
| `raiseDispute()` | Tenant | Transitions to DISPUTED, triggers AI backend |
| `submitAIVerdict()` | Backend (Verifier) | Posts AI verdict on-chain |
| `acceptAIVerdict()` | Both parties | Each accepts; funds release when both agree |
| `escalateToHuman()` | Either party | Requests human arbitrator |
| `assignHumanVerifier()` | Owner | Assigns human verifier after escalation |
| `resolveDispute()` | Verifier | Final on-chain resolution |
| `timeoutRefund()` | Tenant | Full refund after deadline + grace period; slashes landlord stake |

---

## 🛠️ Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `cd: no such file or directory: ../backend` | Running install commands from wrong directory | Use `npm install --prefix <dir>` from the project root instead |
| Gas limit error in MetaMask | Stale gas estimate cached | Settings → Advanced → **Clear activity tab data** → Refresh |
| `Nonce too low` | Hardhat restarted without resetting MetaMask | Same fix as above |
| `ERC20InsufficientAllowance` | Approve step didn't complete | Try again after clearing activity data |
| `EADDRINUSE :3001` | Ghost Node process on port 3001 | `lsof -ti:3001 \| xargs kill` (macOS) or `taskkill /F /IM node.exe` (Windows) |
| `Failed to fetch` (IPFS) | Pinata JWT not set | App falls back to demo CID automatically |
| `ERC20InsufficientBalance` | Wrong MetaMask account active | Switch to the **Landlord** account when creating a lease |
| `Failed to load escrows (500)` | Stale contract address after Hardhat restart | Redeploy contracts (Step 5) and update both `.env` files |
| Wrong network banner | MetaMask on wrong network | Switch to **Hardhat (Chain ID 1337)** |

---

## 🔐 Security Notes

> [!WARNING]
> All private keys and addresses in this README are **Hardhat test accounts only**.
> They are publicly known and must **never** be used on any real network.

---

**Built for IS4302 — trustless rentals on-chain**
