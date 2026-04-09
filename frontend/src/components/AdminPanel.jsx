import { useState, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useResolveDispute } from "../hooks/useEscrow";

const COLORS = {
  bg: "#0A0A0F", surface: "#12121A", card: "#16161F",
  border: "#1E1E2E", accent: "#00FF87", orange: "#F59E0B",
  red: "#EF4444", blue: "#3B82F6",
  textPrimary: "#F1F5F9", textSecondary: "#94A3B8", textMuted: "#475569",
};

export default // ========== ADMIN PANEL ==========
function AdminPanel({ onBack = () => {} }) {
  const { address } = useAccount();
  const { resolve } = useResolveDispute();
  const publicClient = usePublicClient();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [amountInput, setAmountInput] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [message, setMessage] = useState("");

  const loadDisputes = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/disputes/all");
      const data = await res.json();
      setDisputes(data.disputes || []);
    } catch { setMessage("Failed to load disputes"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDisputes(); }, []);

  const handleResolve = async (dispute) => {
    if (!amountInput) { setMessage("Enter amount to award landlord"); return; }
    try {
      setTxPending(true);
      setMessage("Sending on-chain resolution... (confirm in MetaMask)");
      const txHash = await resolve(dispute.leaseId, amountInput);
      setMessage("Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetch(`http://localhost:3001/api/disputes/${dispute.leaseId}/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedBy: address, txHash, amountToLandlord: amountInput }),
      });
      setMessage(`✓ Dispute #${dispute.leaseId} resolved on-chain!`);
      setSelected(null);
      setAmountInput("");
      loadDisputes();
    } catch (err) { setMessage(`Error: ${err.message}`); }
    finally { setTxPending(false); }
  };

    return (
    <div style={{ padding: "40px", maxWidth: "800px" }}>
        <div style={{ position: "relative", marginBottom: "30px", textAlign: "center" }}>
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            color: COLORS.textSecondary,
            padding: "6px 14px",
            borderRadius: "6px",
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          ← Back
        </button>
        <h2 style={{ color: COLORS.textPrimary, marginBottom: "6px" }}>⚖️ Arbitrator Admin Panel</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: "14px", margin: 0 }}>
          Review escalated disputes and submit on-chain resolutions.
        </p>
      </div>

      {message && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
          background: message.startsWith("✓") ? "rgba(0,255,135,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${message.startsWith("✓") ? "rgba(0,255,135,0.2)" : "rgba(239,68,68,0.2)"}`,
          color: message.startsWith("✓") ? COLORS.accent : COLORS.red, fontSize: "14px",
        }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3>{disputes.length} escalated dispute(s)</h3>
        <button onClick={loadDisputes} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary, padding: "6px 14px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: COLORS.textSecondary }}>Loading...</p>
      ) : disputes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: COLORS.textSecondary, background: COLORS.card, borderRadius: "12px", border: `1px solid ${COLORS.border}` }}>
          No escalated disputes
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {disputes.map((d) => (
            <div key={d.leaseId} style={{ background: COLORS.card, border: `1px solid ${d.status === "resolved" ? "rgba(0,255,135,0.3)" : COLORS.orange}`, borderRadius: "12px", padding: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: "700" }}>Lease #{d.leaseId}</div>
                  <div style={{ fontSize: "13px", color: COLORS.textSecondary, marginTop: "4px" }}>
                    Contested by: <span style={{ color: COLORS.textPrimary }}>{d.role}</span> — {d.contestedBy?.slice(0, 10)}...
                  </div>
                  <div style={{ fontSize: "12px", color: COLORS.textMuted, marginTop: "2px" }}>{new Date(d.timestamp).toLocaleString()}</div>
                </div>
                <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "500", background: d.status === "resolved" ? "rgba(0,255,135,0.1)" : "rgba(245,158,11,0.1)", color: d.status === "resolved" ? COLORS.accent : COLORS.orange }}>
                  {d.status === "resolved" ? "Resolved" : "Pending"}
                </span>
              </div>

              {d.statement && (
                <div style={{ background: COLORS.surface, borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px" }}>
                  <p style={{ color: COLORS.textSecondary, marginBottom: "4px", fontSize: "12px" }}>Statement from {d.role}:</p>
                  <p style={{ fontStyle: "italic" }}>{d.statement}</p>
                </div>
              )}

              {d.status === "resolved" ? (
                <div style={{ fontSize: "13px", color: COLORS.textSecondary }}>
                  Resolved by: <span className="mono">{d.resolvedBy?.slice(0, 10)}...</span> — Tx: <span className="mono">{d.txHash?.slice(0, 12)}...</span>
                </div>
              ) : selected === d.leaseId ? (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ fontSize: "13px", color: COLORS.textSecondary, marginBottom: "8px" }}>
                    Enter the amount (USDC) to award to the <strong>landlord</strong>. Remainder goes to the tenant.
                  </p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input type="number" placeholder="Amount to landlord (USDC)" value={amountInput} onChange={(e) => setAmountInput(e.target.value)}
                      style={{ flex: 1, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: "8px", padding: "10px 14px", color: COLORS.textPrimary, fontFamily: "inherit", fontSize: "14px", outline: "none" }} />
                    <button onClick={() => handleResolve(d)} disabled={txPending}
                      style={{ background: COLORS.accent, color: "#000", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: "600", fontSize: "14px", cursor: txPending ? "not-allowed" : "pointer", opacity: txPending ? 0.6 : 1 }}>
                      {txPending ? "..." : "Resolve On-Chain"}
                    </button>
                    <button onClick={() => setSelected(null)}
                      style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary, padding: "10px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setSelected(d.leaseId)}
                  style={{ marginTop: "8px", background: COLORS.accent, color: "#000", border: "none", padding: "8px 18px", borderRadius: "8px", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}>
                  Review & Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}