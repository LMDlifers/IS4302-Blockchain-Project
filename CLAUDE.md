# RentLock: Blockchain Rental Escrow System

## Project Context
A trustless rental deposit system. Landlords stake 20% to list; Tenants deposit 100% USDC. Funds are held in a vault governed by a state machine.

## Tech Stack
- **Smart Contracts:** Solidity 0.8.20, Hardhat, OpenZeppelin (ReentrancyGuard).
- **Backend:** Node.js, Express, Ethers.js (v6), IPFS (Pinata).
- **Frontend:** React, Vite, Wagmi/Viem, Tailwind/CSS-in-JS.
- **AI/Dispute:** LLM Judge via X402 (HTTP 402) micropayments.

## Directory Structure
- `/contracts`: Core logic (`EscrowManager.sol`).
- `/backend/src/listeners`: Ethers.js event listeners (The app's heart).
- `/backend/src/services`: IPFS, LLM, and X402 business logic.
- `/frontend/src`: UI components based on Figma design tokens.

## Core State Machine (LeaseState)
1. **CREATED:** Landlord initialized, stake paid.
2. **LOCKED:** Tenant deposited, lease active.
3. **RELEASED:** Mutual agreement or Dispute verdict reached.
4. **REFUNDED:** Deadline + Grace Period expired (Tenant no-show).
5. **DISPUTED:** Scenario C; LLM/Human verifier assigned.

## Key Logic Patterns
- **Scenario A (Mutual):** Landlord `proposeRelease` -> Tenant `acceptRelease`.
- **Scenario B (Timeout):** Anyone calls `timeoutRefund` after `deadline + gracePeriod`.
- **Scenario C (Dispute):** `raiseDispute` -> `onDisputeRaised` listener -> LLM analysis -> `resolveDispute`.
- **Stake Slashing:** Landlord stake is slashed to `feeAddress` in Scenario B.

## Coding Standards & Design Tokens
- **Style:** Dark mode fintech. Use `#00FF87` (Accent), `#0A0A0F` (BG), `#16161F` (Card).
- **Security:** Always use `nonReentrant` on transfer functions. 
- **Data:** Use IPFS CIDs for lease documents and move-in/out photos.
- **Communication:** Backend reacts to events; Frontend uses Wagmi hooks for state.

## Agent Instructions (Token Optimization)
- **Conciseness:** Do not rewrite whole files. Use diffs or targeted updates.
- **Context:** Always check `EscrowManager.sol` struct definitions before suggesting backend or frontend changes.
- **Verification:** Ensure all proposed contract calls match the ABI in `backend/config/contracts.js`.
- **Mocking:** For testing, use `MockUSDC.sol` and `MockVRF.sol`.