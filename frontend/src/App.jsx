import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
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
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <div style={{ padding: "20px 40px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.02em" }}>
        🔒 RentLock
      </div>
      <button
        className="btn-primary btn-sm"
        onClick={() => {
          if (isConnected) {
            disconnect();
          } else {
            connect({ connector: injected() });
          }
        }}
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
  const [step, setStep] = useState(1); // 1=details, 2=upload, 3=review
  const [formData, setFormData] = useState({
    tenantAddress: "",
    depositAmount: "",
    deadline: "",
    gracePeriodDays: "7",
    ipfsCID: "",
  });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { initializeLease, isLoading: isInitializing, hash: txHash } = useInitializeLease();

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    setError("");

    try {
      const cids = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("http://localhost:3001/api/ipfs/upload", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) throw new Error("IPFS upload failed");
        const data = await res.json();
        cids.push(data.cid);
      }

      setUploadedFiles(cids);
      setFormData((prev) => ({ ...prev, ipfsCID: cids[0] })); // Use first CID as primary
      setSuccess(`✓ Uploaded ${cids.length} file(s) to IPFS`);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateLease = async () => {
    if (!formData.tenantAddress || !formData.depositAmount || !formData.ipfsCID) {
      setError("Please fill all fields and upload IPFS data");
      return;
    }

    const deadline = Math.floor(new Date(formData.deadline).getTime() / 1000);
    const gracePeriod = parseInt(formData.gracePeriodDays) * 24 * 60 * 60;

    try {
      await initializeLease(
        formData.tenantAddress,
        formData.depositAmount,
        deadline,
        gracePeriod,
        formData.ipfsCID
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

      {error && (
        <div className="alert alert-error">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          ✓ {success}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: "20px" }}>Step 1: Lease Details</h3>
          <input
            className="input-field"
            placeholder="Tenant address (0x...)"
            value={formData.tenantAddress}
            onChange={(e) => setFormData({ ...formData, tenantAddress: e.target.value })}
            style={{ marginBottom: "12px" }}
          />
          <input
            className="input-field"
            placeholder="Deposit amount (USDC)"
            type="number"
            value={formData.depositAmount}
            onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
            style={{ marginBottom: "12px" }}
          />
          <input
            className="input-field"
            placeholder="Lease deadline"
            type="date"
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            style={{ marginBottom: "12px" }}
          />
          <input
            className="input-field"
            placeholder="Grace period (days)"
            type="number"
            value={formData.gracePeriodDays}
            onChange={(e) => setFormData({ ...formData, gracePeriodDays: e.target.value })}
            style={{ marginBottom: "20px" }}
          />
          <button className="btn-primary" onClick={() => setStep(2)}>
            Next: Upload Evidence
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: "20px" }}>Step 2: Upload Lease Documents</h3>
          <p style={{ color: COLORS.textSecondary, marginBottom: "16px", fontSize: "14px" }}>
            Upload lease PDF and photos. These will be stored on IPFS.
          </p>
          <label style={{ display: "block", marginBottom: "20px" }}>
            <input
              type="file"
              multiple
              accept=".pdf,image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ cursor: uploading ? "not-allowed" : "pointer" }}
            />
          </label>

          {uploadedFiles.length > 0 && (
            <div style={{ marginBottom: "20px", padding: "12px", background: COLORS.surface, borderRadius: "8px" }}>
              <p style={{ fontSize: "12px", color: COLORS.accent }}>
                ✓ {uploadedFiles.length} file(s) uploaded
              </p>
              {uploadedFiles.map((cid, i) => (
                <div key={i} style={{ fontSize: "12px", color: COLORS.textMuted, wordBreak: "break-all" }}>
                  {cid.slice(0, 20)}...
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>
              Back
            </button>
            <button className="btn-primary" onClick={() => setStep(3)} disabled={uploadedFiles.length === 0} style={{ flex: 1 }}>
              {uploading ? <span className="spinner"></span> : null}
              Next: Review
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: "20px" }}>Step 3: Review & Deploy</h3>
          <div style={{ background: COLORS.surface, padding: "16px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Tenant:</span>
              <span className="mono">{formData.tenantAddress?.slice(0, 10)}...</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Deposit:</span>
              <span>{formData.depositAmount} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Your Stake:</span>
              <span>{(formData.depositAmount / 5).toFixed(2)} USDC (20%)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Grace Period:</span>
              <span>{formData.gracePeriodDays} days</span>
            </div>
          </div>

          <p style={{ color: COLORS.textSecondary, marginBottom: "20px", fontSize: "13px" }}>
            You will be prompted to approve and transfer your stake to the contract.
          </p>

          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-ghost" onClick={() => setStep(2)} style={{ flex: 1 }}>
              Back
            </button>
            <button className="btn-primary" onClick={handleCreateLease} disabled={isInitializing} style={{ flex: 1 }}>
              {isInitializing ? <span className="spinner"></span> : null}
              {isInitializing ? "Deploying..." : "Deploy Escrow"}
            </button>
          </div>

          {txHash && (
            <p style={{ marginTop: "16px", fontSize: "12px", color: COLORS.accent }}>
              ✓ Tx: <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent }}>
                {txHash.slice(0, 10)}...
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ========== ESCROW DETAIL COMPONENT ==========
function EscrowDetail({ leaseId, onBack }) {
  const { address } = useAccount();
  const { data: lease, refetch } = useLease(BigInt(leaseId));
  const { approve, isLoading: approving } = useApproveUSDC();
  const { deposit, isLoading: depositing } = useDepositFunds();
  const { propose, isLoading: proposing } = useProposeRelease();
  const { accept, isLoading: accepting } = useAcceptRelease();
  const { raise, isLoading: raising } = useRaiseDispute();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [proposedAmount, setProposedAmount] = useState("");

  if (!lease) return <div style={{ padding: "40px" }}>Loading...</div>;

  const isLandlord = address?.toLowerCase() === lease.landlord.toLowerCase();
  const isTenant = address?.toLowerCase() === lease.tenant.toLowerCase();
  const stateNames = ["CREATED", "LOCKED", "DISPUTED", "RELEASED", "REFUNDED"];
  const state = stateNames[lease.state];

  const handleDeposit = async () => {
    try {
      // Step 1: Approve
      await approve(lease.depositAmount.toString());
      setSuccess("✓ USDC approved. Now depositing...");

      // Step 2: Deposit
      await deposit(leaseId);
      setSuccess("✓ Funds deposited! Lease is now LOCKED");
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setError(`Deposit failed: ${err.message}`);
    }
  };

  const handleProposeRelease = async () => {
    if (!proposedAmount) {
      setError("Enter amount to propose");
      return;
    }
    try {
      await propose(leaseId, proposedAmount);
      setSuccess("✓ Release proposed. Waiting for tenant acceptance...");
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setError(`Proposal failed: ${err.message}`);
    }
  };

  const handleRaiseDispute = async () => {
    try {
      await raise(leaseId);
      setSuccess("✓ Dispute raised. LLM judge will analyze...");
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setError(`Dispute failed: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "800px" }}>
      <button className="btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: "20px" }}>
        ← Back
      </button>

      <h2 style={{ marginBottom: "20px" }}>Escrow #{leaseId}</h2>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "20px" }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: "20px" }}>
          {success}
        </div>
      )}

      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3>Overview</h3>
          <span className={`status-badge status-${state.toLowerCase()}`}>
            {state}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Landlord</p>
            <p className="mono" style={{ fontSize: "13px" }}>{lease.landlord.slice(0, 10)}...</p>
          </div>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Tenant</p>
            <p className="mono" style={{ fontSize: "13px" }}>{lease.tenant.slice(0, 10)}...</p>
          </div>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Deposit</p>
            <p>{(lease.depositAmount / 1000000).toFixed(2)} USDC</p>
          </div>
          <div>
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "4px" }}>Landlord Stake</p>
            <p>{(lease.landlordStake / 1000000).toFixed(2)} USDC</p>
          </div>
        </div>
      </div>

      {/* Tenant Deposit Action */}
      {isTenant && lease.state === 0 && (
        <div className="card" style={{ marginBottom: "20px", background: `${COLORS.blue}15` }}>
          <h3 style={{ marginBottom: "16px", color: COLORS.blue }}>Your Action Required</h3>
          <p style={{ marginBottom: "16px", fontSize: "14px" }}>
            Approve and deposit {(lease.depositAmount / 1000000).toFixed(2)} USDC to activate this lease.
          </p>
          <button className="btn-primary" onClick={handleDeposit} disabled={approving || depositing}>
            {approving || depositing ? <span className="spinner"></span> : null}
            Approve & Deposit USDC
          </button>
        </div>
      )}

      {/* Landlord Release Actions */}
      {isLandlord && lease.state === 1 && (
        <div className="card" style={{ marginBottom: "20px", background: `${COLORS.accent}15` }}>
          <h3 style={{ marginBottom: "16px" }}>Propose Release</h3>
          <p style={{ marginBottom: "16px", fontSize: "14px", color: COLORS.textSecondary }}>
            Propose how much of the {(lease.depositAmount / 1000000).toFixed(2)} USDC deposit you want to keep.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              className="input-field"
              type="number"
              placeholder="Amount to keep (USDC)"
              value={proposedAmount}
              onChange={(e) => setProposedAmount(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" onClick={handleProposeRelease} disabled={proposing}>
              {proposing ? <span className="spinner"></span> : null}
              Propose
            </button>
          </div>
        </div>
      )}

      {/* Tenant Dispute Action */}
      {isTenant && lease.state === 1 && (
        <div className="card" style={{ marginBottom: "20px", background: `${COLORS.red}15` }}>
          <h3 style={{ marginBottom: "16px", color: COLORS.red }}>Raise a Dispute</h3>
          <p style={{ marginBottom: "16px", fontSize: "14px", color: COLORS.textSecondary }}>
            If you disagree with the landlord's claim, raise a dispute. An LLM judge will analyze the evidence.
          </p>
          <button className="btn-primary" onClick={handleRaiseDispute} disabled={raising} style={{ background: COLORS.red }}>
            {raising ? <span className="spinner"></span> : null}
            Raise Dispute
          </button>
        </div>
      )}

      {/* Evidence IPFS Link */}
      {lease.ipfsCID && (
        <div className="card">
          <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>Evidence on IPFS</p>
          <a
            href={`https://gateway.pinata.cloud/ipfs/${lease.ipfsCID}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: COLORS.accent, fontSize: "13px", wordBreak: "break-all" }}
          >
            {lease.ipfsCID}
          </a>
        </div>
      )}
    </div>
  );
}

// ========== DASHBOARD COMPONENT ==========
function Dashboard() {
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLeaseId, setSelectedLeaseId] = useState(null);

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
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>Total Escrows</p>
            <p style={{ fontSize: "32px", fontWeight: "700" }}>4</p>
          </div>
          <div className="card">
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>Secured</p>
            <p style={{ fontSize: "32px", fontWeight: "700", color: COLORS.accent }}>$12,450</p>
          </div>
          <div className="card">
            <p style={{ color: COLORS.textSecondary, fontSize: "12px", marginBottom: "8px" }}>Avg. Completion</p>
            <p style={{ fontSize: "32px", fontWeight: "700" }}>98.7%</p>
          </div>
        </div>
      )}

      {activeTab === "escrows" && (
        <div className="card">
          <h3 style={{ marginBottom: "20px" }}>Your Escrows</h3>
          <p style={{ color: COLORS.textSecondary, fontSize: "14px" }}>
            Click on a lease to view details and take action.
          </p>
          <div style={{ marginTop: "20px" }}>
            {["ESC-0x1a2b", "ESC-0x3c4d", "ESC-0x5e6f"].map((esc, i) => (
              <div
                key={i}
                style={{
                  padding: "16px",
                  borderBottom: i < 2 ? `1px solid ${COLORS.border}` : "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onClick={() => setSelectedLeaseId(i + 1)}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: "500" }}>{esc}</span>
                  <span className="status-badge status-locked">LOCKED</span>
                </div>
                <p style={{ fontSize: "13px", color: COLORS.textSecondary, marginTop: "8px" }}>
                  2,500 USDC • 76 days remaining
                </p>
              </div>
            ))}
          </div>
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
