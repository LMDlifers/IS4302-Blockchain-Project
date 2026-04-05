import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  useInitializeLease,
  useApproveUSDC,
  useDepositFunds,
  useProposeRelease,
  useAcceptRelease,
  useRaiseDispute,
  useResolveDispute,
  useLease,
  useUSDCBalance,
} from "./hooks/useEscrow";

const COLORS = {
  bg: "#0A0A0F",
  surface: "#12121A",
  card: "#16161F",
  cardHover: "#1C1C28",
  border: "#1E1E2E",
  borderHover: "#2A2A3E",
  accent: "#00FF87",
  accentDim: "#00CC6A",
  accentGlow: "rgba(0,255,135,0.15)",
  accentGlow2: "rgba(0,255,135,0.06)",
  blue: "#3B82F6",
  orange: "#F59E0B",
  red: "#EF4444",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#475569",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Space Grotesk', sans-serif;
    background: ${COLORS.bg};
    color: ${COLORS.textPrimary};
    min-height: 100vh;
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: ${COLORS.surface}; }
  ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 2px; }

  .mono { font-family: 'JetBrains Mono', monospace; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 0 0 ${COLORS.accentGlow}; }
    50% { box-shadow: 0 0 20px 4px ${COLORS.accentGlow}; }
  }
  @keyframes spinner {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .fade-up { animation: fadeUp 0.5s ease forwards; }
  .fade-up-1 { animation: fadeUp 0.5s 0.1s ease both; }
  .fade-up-2 { animation: fadeUp 0.5s 0.2s ease both; }
  .fade-up-3 { animation: fadeUp 0.5s 0.3s ease both; }
  .fade-up-4 { animation: fadeUp 0.5s 0.4s ease both; }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid ${COLORS.border};
    border-top-color: ${COLORS.accent};
    border-radius: 50%;
    animation: spinner 0.6s linear infinite;
    display: inline-block;
  }

  .btn-primary {
    background: ${COLORS.accent};
    color: #000;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-primary:hover:not(:disabled) {
    background: #00FF87cc;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px ${COLORS.accentGlow};
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    color: ${COLORS.textPrimary};
    border: 1px solid ${COLORS.border};
    padding: 12px 24px;
    border-radius: 8px;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-ghost:hover {
    border-color: ${COLORS.borderHover};
    background: ${COLORS.surface};
  }

  .btn-sm {
    padding: 8px 16px;
    font-size: 13px;
    border-radius: 6px;
  }

  .card {
    background: ${COLORS.card};
    border: 1px solid ${COLORS.border};
    border-radius: 12px;
    padding: 20px;
    transition: border-color 0.2s, background 0.2s;
  }
  .card:hover { border-color: ${COLORS.borderHover}; }

  .input-field {
    background: ${COLORS.surface};
    border: 1px solid ${COLORS.border};
    border-radius: 8px;
    padding: 12px 16px;
    color: ${COLORS.textPrimary};
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px;
    width: 100%;
    outline: none;
    transition: border-color 0.2s;
  }
  .input-field:focus { border-color: ${COLORS.accent}; }
  .input-field::placeholder { color: ${COLORS.textMuted}; }

  .status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }
  .status-created {
    background: rgba(59,130,246,0.1);
    color: ${COLORS.blue};
  }
  .status-locked {
    background: rgba(245,158,11,0.1);
    color: ${COLORS.orange};
  }
  .status-disputed {
    background: rgba(239,68,68,0.1);
    color: ${COLORS.red};
  }
  .status-released {
    background: rgba(0,255,135,0.1);
    color: ${COLORS.accent};
  }
  .status-refunded {
    background: rgba(148,163,184,0.1);
    color: ${COLORS.textSecondary};
  }

  .alert {
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .alert-success {
    background: rgba(0,255,135,0.1);
    border: 1px solid rgba(0,255,135,0.2);
    color: ${COLORS.accent};
  }
  .alert-error {
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.2);
    color: ${COLORS.red};
  }
  .alert-info {
    background: rgba(59,130,246,0.1);
    border: 1px solid rgba(59,130,246,0.2);
    color: ${COLORS.blue};
  }
`;

// ========== NAVBAR COMPONENT ==========
function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = async () => {
    console.log("Connectors available:", connectors);
    if (isConnected) {
      disconnect();
    } else {
      if (connectors.length > 0) {
        // Find the injected connector which is most reliable for MetaMask/Opera
        const connector = connectors.find(c => c.id === 'injected') || connectors[0];
        console.log("Attempting connection with:", connector.id);
        
        try {
          await connect({ connector });
        } catch (err) {
          console.error("Connection failed:", err);
          alert(`Connection failed: ${err.message}\n\nTroubleshooting:\n1. Ensure MetaMask is UNLOCKED.\n2. In MetaMask, check 'Connected Sites' for localhost.\n3. If using Opera, disable Opera's built-in wallet in settings.`);
        }
      } else {
        alert("No web3 wallet detected. Please install MetaMask!");
      }
    }
  };

  return (
    <div style={{ padding: "20px 40px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.02em" }}>
        🔒 RentLock
      </div>
      <button
        className="btn-primary btn-sm"
        onClick={handleConnect}
        style={{ cursor: "pointer" }}
      >
        {isConnected ? `${address?.slice(0, 6)}...${address?.slice(-4)}` : "Connect Wallet"}
      </button>
    </div>
  );
}

// ========== CREATE ESCROW COMPONENT ==========
function CreateEscrow({ onSuccess }) {
  const { address } = useAccount();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    tenantAddress: "",
    depositAmount: "",
    deadline: "",
    gracePeriodDays: "7",
    moveInCID: "",
  });
  const [moveInPhotoCIDs, setMoveInPhotoCIDs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { initializeLease } = useInitializeLease();
  const { approve: approveStake } = useApproveUSDC();
  const publicClient = usePublicClient();

  const handleMoveInUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    setError("");

    try {
      const cids = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch("http://localhost:3001/api/ipfs/upload", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error("Server error");
          const data = await res.json();
          cids.push(data.cid);
        } catch {
          cids.push("QmDemoMoveIn" + Math.floor(Math.random() * 10000));
        }
      }
      setMoveInPhotoCIDs(cids);
      setSuccess(`✓ ${cids.length} move-in photo(s) uploaded`);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateLease = async () => {
    if (!formData.tenantAddress || !formData.depositAmount || !formData.moveInCID) {
      setError("Please fill all fields and upload move-in photos");
      return;
    }

    const deadline = Math.floor(new Date(formData.deadline).getTime() / 1000);
    const gracePeriod = parseInt(formData.gracePeriodDays) * 24 * 60 * 60;
    const depositAmount = parseFloat(formData.depositAmount);
    const stakeAmount = depositAmount / 5;

    try {
      setSuccess("Step 1 of 2: Approving USDC stake... (confirm in MetaMask)");
      const approveTxHash = await approveStake(stakeAmount);
      setSuccess("Step 1 of 2: Waiting for approval confirmation...");
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

      setSuccess("Step 2 of 2: Creating lease... (confirm in MetaMask)");
      await initializeLease(
        formData.tenantAddress,
        depositAmount,
        deadline,
        gracePeriod,
        formData.moveInCID,
      );

      setSuccess("✓ Lease created! Awaiting confirmation...");
      setTimeout(() => onSuccess?.(), 2000);
    } catch (err) {
      setError(`Contract call failed: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "600px" }}>
      <h2 style={{ marginBottom: "30px" }}>Create New Escrow</h2>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {success && <div className="alert alert-success">✓ {success}</div>}

      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: "20px" }}>Step 1: Lease Details</h3>
          <input className="input-field" placeholder="Tenant address (0x...)" value={formData.tenantAddress}
            onChange={(e) => setFormData({ ...formData, tenantAddress: e.target.value })} style={{ marginBottom: "12px" }} />
          <input className="input-field" placeholder="Deposit amount (USDC)" type="number" value={formData.depositAmount}
            onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })} style={{ marginBottom: "12px" }} />
          <input className="input-field" placeholder="Lease deadline" type="date" value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })} style={{ marginBottom: "12px" }} />
          <input className="input-field" placeholder="Grace period (days)" type="number" value={formData.gracePeriodDays}
            onChange={(e) => setFormData({ ...formData, gracePeriodDays: e.target.value })} style={{ marginBottom: "20px" }} />
          <button className="btn-primary" onClick={() => setStep(2)}>Next: Move-In Photos</button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: "8px" }}>Step 2: Move-In Photos 📷</h3>
          <p style={{ color: COLORS.textSecondary, marginBottom: "16px", fontSize: "14px" }}>
            Upload photos of every room and item in the rental unit <strong>before the tenant moves in</strong>.
            These serve as the baseline for any future damage claims.
          </p>
          <div style={{
            border: `2px dashed ${COLORS.border}`, borderRadius: "8px", padding: "24px",
            textAlign: "center", marginBottom: "16px", cursor: "pointer"
          }}>
            <p style={{ color: COLORS.textMuted, fontSize: "13px", marginBottom: "12px" }}>
              📸 Recommended: bedroom, living room, kitchen, bathroom, appliances, walls, flooring
            </p>
            <label style={{ cursor: "pointer" }}>
              <input type="file" multiple accept="image/*" onChange={handleMoveInUpload}
                disabled={uploading} style={{ display: "none" }} />
              <span className="btn-primary btn-sm" style={{ display: "inline-flex" }}>
                {uploading ? <span className="spinner"></span> : "Select Photos"}
              </span>
            </label>
          </div>

          {moveInPhotoCIDs.length > 0 && (
            <div style={{ marginBottom: "16px", padding: "12px", background: COLORS.surface, borderRadius: "8px" }}>
              <p style={{ fontSize: "12px", color: COLORS.accent, marginBottom: "8px" }}>
                ✓ {moveInPhotoCIDs.length} move-in photo(s) uploaded to IPFS
              </p>
              {moveInPhotoCIDs.map((cid, i) => (
                <div key={i} style={{ fontSize: "11px", color: COLORS.textMuted, wordBreak: "break-all" }}>
                  [{i + 1}] {cid}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>Back</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={async () => {
              let cids = moveInPhotoCIDs;
              if (cids.length === 0) {
                // Demo fallback
                cids = ["QmDemoMoveInFallback" + Math.floor(Math.random() * 9999)];
                setMoveInPhotoCIDs(cids);
              }
              // Upload metadata JSON containing all photo CIDs
              setUploading(true);
              try {
                const metadataRes = await fetch("http://localhost:3001/api/ipfs/upload-metadata", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    moveInPhotoCIDs: cids,
                    leaseTerms: {
                      tenantAddress: formData.tenantAddress,
                      depositAmount: formData.depositAmount,
                      deadline: formData.deadline,
                    },
                    uploadedAt: new Date().toISOString(),
                    type: "move-in",
                  }),
                });
                const metadataData = metadataRes.ok ? await metadataRes.json() : { cid: "QmDemoMetaFallback" + Math.floor(Math.random() * 9999) };
                setFormData(prev => ({ ...prev, moveInCID: metadataData.cid }));
              } catch {
                const demoCid = "QmDemoMetaFallback" + Math.floor(Math.random() * 9999);
                setFormData(prev => ({ ...prev, moveInCID: demoCid }));
              } finally {
                setUploading(false);
                setStep(3);
              }
            }}>
              {uploading ? <span className="spinner"></span> : "Next: Review"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: "20px" }}>Step 3: Review & Deploy</h3>
          <div style={{ background: COLORS.surface, padding: "16px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Tenant:</span><span className="mono">{formData.tenantAddress?.slice(0, 10)}...</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Deposit:</span><span>{formData.depositAmount} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Your Stake:</span><span>{(formData.depositAmount / 5).toFixed(2)} USDC (20%)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Grace Period:</span><span>{formData.gracePeriodDays} days</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Move-In Photos:</span>
              <span style={{ color: COLORS.accent }}>{moveInPhotoCIDs.length} photo(s) ✓</span>
            </div>
          </div>
          <p style={{ color: COLORS.textSecondary, marginBottom: "20px", fontSize: "13px" }}>
            Move-in photos are locked on IPFS as the baseline evidence for any future damage disputes.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-ghost" onClick={() => setStep(2)} style={{ flex: 1 }}>Back</button>
            <button className="btn-primary" onClick={handleCreateLease} style={{ flex: 1 }}>Deploy Escrow</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== ESCROW DETAIL COMPONENT ==========
function EscrowDetail({ leaseId, onBack }) {
  const { address } = useAccount();
  const { data: lease, refetch, isError, isLoading } = useLease(BigInt(leaseId));
  const { approve, isLoading: approving } = useApproveUSDC();
  const { deposit, isLoading: depositing } = useDepositFunds();
  const { propose, isLoading: proposing } = useProposeRelease();
  const { accept, isLoading: accepting } = useAcceptRelease();
  const { raise, isLoading: raising } = useRaiseDispute();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [proposedAmount, setProposedAmount] = useState("");

    if (isLoading) return <div style={{ padding: "40px" }}>Loading lease from blockchain...</div>;
  if (isError || !lease) return <div style={{ padding: "40px" }}>Error loading lease data.</div>;

  // Viem returns mapping data as an array. Destructure based on the new Solidity struct order:
  const [
    landlordRaw,
    tenantRaw,
    verifierRaw,
    depositAmountRaw,
    landlordStakeRaw,
    deadlineRaw,
    gracePeriodRaw,
    moveInCIDRaw,
    moveOutCIDRaw,
    stateRaw,
    amountToLandlordRaw
  ] = lease;

  const landlord = landlordRaw || "0x0000000000000000000000000000000000000000";
  const tenant = tenantRaw || "0x0000000000000000000000000000000000000000";
  
  const isLandlord = address?.toLowerCase() === landlord.toLowerCase();
  const isTenant = address?.toLowerCase() === tenant.toLowerCase();
  
  const stateNames = ["CREATED", "LOCKED", "DISPUTED", "RELEASED", "REFUNDED"];
  const stateIndex = Number(stateRaw || 0);
  const state = stateNames[stateIndex] || "UNKNOWN";

  // Divide by 1,000,000 to remove the 6 USDC decimals
  const displayDeposit = (Number(depositAmountRaw || 0) / 1_000_000).toFixed(2);
  const displayStake = (Number(landlordStakeRaw || 0) / 1_000_000).toFixed(2);

  const handleDeposit = async () => {
    try {
      await approve(lease.depositAmount.toString());
      setSuccess("✓ USDC approved. Now depositing...");
      await deposit(leaseId);
      setSuccess("✓ Funds deposited! Lease is now LOCKED");
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setError(`Deposit failed: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "800px" }}>
      <button className="btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: "20px" }}>
        ← Back
      </button>

      <h2 style={{ marginBottom: "20px" }}>Escrow #{leaseId.toString()}</h2>

      {error && <div className="alert alert-error" style={{ marginBottom: "20px" }}>⚠️ {error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "20px" }}>{success}</div>}

      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3>Overview</h3>
          <span className={`status-badge status-${state.toLowerCase()}`}>{state}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Landlord</p>
            <p className="mono" style={{ fontSize: "13px" }}>{landlord.slice(0, 10)}...</p>
          </div>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Tenant</p>
            <p className="mono" style={{ fontSize: "13px" }}>{tenant.slice(0, 10)}...</p>
          </div>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Deposit</p>
            <p>{displayDeposit} USDC</p>
          </div>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Landlord Stake</p>
            <p>{displayStake} USDC</p>
          </div>
        </div>
      </div>

      {/* Tenant Deposit Action */}
      {isTenant && stateIndex === 0 && (
        <div className="card" style={{ marginBottom: "20px", background: `${COLORS.blue}15` }}>
          <h3 style={{ marginBottom: "16px", color: COLORS.blue }}>Your Action Required</h3>
          <p style={{ marginBottom: "16px", fontSize: "14px" }}>
            Approve and deposit {displayDeposit} USDC to activate this lease.
          </p>
          <button className="btn-primary" onClick={handleDeposit} disabled={approving || depositing}>
            {approving || depositing ? <span className="spinner"></span> : null}
            Approve & Deposit USDC
          </button>
        </div>
      )}

      {/* Landlord Release Actions */}
      {isLandlord && stateIndex === 1 && (() => {
        const [damagePhotoCIDs, setDamagePhotoCIDs] = useState([]);
        const [damageUploading, setDamageUploading] = useState(false);
        const [damageDescription, setDamageDescription] = useState("");
        const [moveOutCID, setMoveOutCID] = useState("");

        const handleDamagePhotoUpload = async (e) => {
          const files = Array.from(e.target.files);
          if (files.length === 0) return;
          setDamageUploading(true);
          try {
            const cids = [];
            for (const file of files) {
              const fd = new FormData();
              fd.append("file", file);
              try {
                const res = await fetch("http://localhost:3001/api/ipfs/upload", { method: "POST", body: fd });
                if (!res.ok) throw new Error();
                const data = await res.json();
                cids.push(data.cid);
              } catch {
                cids.push("QmDemoDamage" + Math.floor(Math.random() * 10000));
              }
            }
            setDamagePhotoCIDs(cids);
          } finally {
            setDamageUploading(false);
          }
        };

        const handlePropose = async () => {
          if (!proposedAmount) { setError("Enter amount to propose"); return; }

          let outCID = moveOutCID;
          if (!outCID) {
            try {
              const res = await fetch("http://localhost:3001/api/ipfs/upload-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  moveOutPhotoCIDs: damagePhotoCIDs.length > 0 ? damagePhotoCIDs : ["QmDemoDamageFallback"],
                  landlordClaim: damageDescription || "Landlord claims deposit deduction for damages.",
                  uploadedAt: new Date().toISOString(),
                  type: "move-out",
                }),
              });
              const data = res.ok ? await res.json() : { cid: "QmDemoDamageMeta" + Math.floor(Math.random() * 9999) };
              outCID = data.cid;
              setMoveOutCID(outCID);
            } catch {
              outCID = "QmDemoDamageMeta" + Math.floor(Math.random() * 9999);
              setMoveOutCID(outCID);
            }
          }

          try {
            await propose(leaseId, proposedAmount, outCID);
            setSuccess("✓ Release proposed. Waiting for tenant...");
            setTimeout(() => refetch(), 2000);
          } catch (err) {
            setError(`Proposal failed: ${err.message}`);
          }
        };

        return (
          <div className="card" style={{ marginBottom: "20px", background: `${COLORS.accent}15` }}>
            <h3 style={{ marginBottom: "16px" }}>Propose Release</h3>
            <div style={{
              border: `2px dashed ${COLORS.border}`, borderRadius: "8px", padding: "16px",
              textAlign: "center", marginBottom: "12px"
            }}>
              <label style={{ cursor: "pointer" }}>
                <input type="file" multiple accept="image/*" onChange={handleDamagePhotoUpload} disabled={damageUploading} style={{ display: "none" }} />
                <span className="btn-ghost btn-sm" style={{ display: "inline-flex" }}>
                  {damageUploading ? <span className="spinner"></span> : "📷 Upload Damage Photos"}
                </span>
              </label>
            </div>
            {damagePhotoCIDs.length > 0 && <p style={{ fontSize: "12px", color: COLORS.accent, marginBottom: "12px" }}>✓ Photos ready</p>}
            
            <textarea className="input-field" placeholder="Describe the damage" value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} rows={2} style={{ marginBottom: "12px", resize: "vertical" }} />
            
            <div style={{ display: "flex", gap: "12px" }}>
              <input className="input-field" type="number" placeholder="Amount to keep (USDC)" value={proposedAmount} onChange={(e) => setProposedAmount(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-primary" onClick={handlePropose} disabled={proposing}>{proposing ? <span className="spinner"></span> : "Propose"}</button>
            </div>
          </div>
        );
      })()}

      {/* Tenant Dispute Action */}
      {isTenant && stateIndex === 1 && (
        <div className="card" style={{ marginBottom: "20px", background: `${COLORS.red}15` }}>
          <h3 style={{ marginBottom: "16px", color: COLORS.red }}>Raise a Dispute</h3>
          <p style={{ marginBottom: "16px", fontSize: "14px" }}>Disagree with the landlord? Raise a dispute for AI arbitration.</p>
          <button className="btn-primary" onClick={async () => {
            try {
              await raise(leaseId);
              setSuccess("✓ Dispute raised. AI judge is analyzing...");
              setTimeout(() => refetch(), 2000);
            } catch (err) { setError(`Dispute failed: ${err.message}`); }
          }} disabled={raising} style={{ background: COLORS.red }}>
            {raising ? <span className="spinner"></span> : "Raise Dispute"}
          </button>
        </div>
      )}
    </div>
  );
}

// ========== DASHBOARD COMPONENT ==========
function Dashboard() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLeaseId, setSelectedLeaseId] = useState(null);
  const [myLeases, setMyLeases] = useState([]);
  const [loadingLeases, setLoadingLeases] = useState(false);
  const [leaseLoadError, setLeaseLoadError] = useState("");

  const stateNames = ["CREATED", "LOCKED", "DISPUTED", "RELEASED", "REFUNDED"];

  const loadMyLeases = async () => {
    if (!address) return;

    setLoadingLeases(true);
    setLeaseLoadError("");

    try {
      const res = await fetch(
        `http://localhost:3001/api/leases?user=${encodeURIComponent(address)}`
      );

      if (!res.ok) {
        throw new Error(`Failed to load escrows (${res.status})`);
      }

      const data = await res.json();
      setMyLeases(data.leases || []);
    } catch (err) {
      setLeaseLoadError(err.message || "Failed to load escrows");
      setMyLeases([]);
    } finally {
      setLoadingLeases(false);
    }
  };

  useEffect(() => {
    if (!isConnected || activeTab !== "escrows" || !address) return;
    loadMyLeases();
  }, [isConnected, activeTab, address]);

  const formatUSDC = (raw) => {
    const value = Number(raw || 0);
    return (value / 1_000_000).toFixed(2);
  };

  const formatDate = (raw) => {
    const ts = Number(raw || 0);
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleDateString();
  };

  if (!isConnected) {
    return (
      <div style={{ padding: "60px 40px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "20px" }}>Connect your wallet to get started</h2>
        <p style={{ color: COLORS.textSecondary }}>RentLock secures rental deposits on-chain</p>
      </div>
    );
  }

  if (selectedLeaseId) {
    return <EscrowDetail leaseId={selectedLeaseId} onBack={() => setSelectedLeaseId(null)} />;
  }

  if (activeTab === "create") {
    return <CreateEscrow onSuccess={() => setActiveTab("escrows")} />;
  }

  return (
    <div style={{ padding: "40px" }}>
      <h2 style={{ marginBottom: "30px" }}>Dashboard</h2>

      <div style={{ display: "flex", gap: "12px", marginBottom: "30px" }}>
        <button
          className={`nav-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
          style={{
            background: activeTab === "overview" ? COLORS.accent : "transparent",
            color: activeTab === "overview" ? "#000" : COLORS.textSecondary,
          }}
        >
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === "escrows" ? "active" : ""}`}
          onClick={() => setActiveTab("escrows")}
          style={{
            background: activeTab === "escrows" ? COLORS.accent : "transparent",
            color: activeTab === "escrows" ? "#000" : COLORS.textSecondary,
          }}
        >
          My Escrows
        </button>
        <button
          className={`nav-tab ${activeTab === "create" ? "active" : ""}`}
          onClick={() => setActiveTab("create")}
          style={{
            background: activeTab === "create" ? COLORS.accent : "transparent",
            color: activeTab === "create" ? "#000" : COLORS.textSecondary,
          }}
        >
          Create New
        </button>
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          <div className="card">
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>My Escrows</p>
            <p style={{ fontSize: "32px", fontWeight: "700" }}>{myLeases.length}</p>
          </div>
          <div className="card">
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>Connected As</p>
            <p style={{ fontSize: "14px", fontWeight: "700", color: COLORS.accent }}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
          <div className="card">
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>Network</p>
            <p style={{ fontSize: "32px", fontWeight: "700" }}>Hardhat</p>
          </div>
        </div>
      )}

      {activeTab === "escrows" && (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h3>Your Escrows</h3>
            <button className="btn-ghost btn-sm" onClick={loadMyLeases}>
              Refresh
            </button>
          </div>

          {leaseLoadError && (
            <div className="alert alert-error" style={{ marginBottom: "20px" }}>
              ⚠️ {leaseLoadError}
            </div>
          )}

          {loadingLeases ? (
            <div style={{ textAlign: "center", padding: "40px", color: COLORS.textSecondary }}>
              Loading escrows...
            </div>
          ) : myLeases.length === 0 ? (
            <div style={{ marginTop: "20px", textAlign: "center", padding: "40px" }}>
              <p style={{ color: COLORS.textSecondary, marginBottom: "20px" }}>No active escrows found.</p>
              <button className="btn-primary btn-sm" onClick={() => setActiveTab("create")}>
                Create Your First Escrow
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {myLeases.map((lease) => {
                // Force lease.state to be parsed as an integer to fetch the correct index
                const stateIndex = parseInt(lease.state || 0, 10);
                const state = stateNames[stateIndex] || "UNKNOWN";
                const role =
                  lease.landlord.toLowerCase() === address?.toLowerCase()
                    ? "Landlord"
                    : "Tenant";

                return (
                  <button
                    key={lease.leaseId}
                    onClick={() => setSelectedLeaseId(lease.leaseId)}
                    style={{
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: "12px",
                      padding: "18px",
                      textAlign: "left",
                      color: COLORS.textPrimary,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "16px",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: "700", marginBottom: "6px" }}>
                          Escrow #{lease.leaseId}
                        </div>
                        <div style={{ color: COLORS.textSecondary, fontSize: "13px" }}>
                          Role: {role}
                        </div>
                      </div>

                      <span className={`status-badge status-${state.toLowerCase()}`}>
                        {state}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "12px",
                        fontSize: "14px",
                      }}
                    >
                      <div>
                        <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>
                          Deposit
                        </p>
                        <p>{formatUSDC(lease.depositAmount)} USDC</p>
                      </div>

                      <div>
                        <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>
                          Stake
                        </p>
                        <p>{formatUSDC(lease.landlordStake)} USDC</p>
                      </div>

                      <div>
                        <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>
                          Tenant
                        </p>
                        <p className="mono" style={{ fontSize: "12px" }}>
                          {lease.tenant.slice(0, 8)}...{lease.tenant.slice(-4)}
                        </p>
                      </div>

                      <div>
                        <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>
                          Deadline
                        </p>
                        <p>{formatDate(lease.deadline)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== MAIN APP ==========
export default function App() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }, []);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.textPrimary }}>
      <Navbar />
      <Dashboard />
    </div>
  );
}
