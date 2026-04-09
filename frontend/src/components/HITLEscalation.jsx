// frontend/src/components/HITLEscalation.jsx
import { useEffect, useState } from "react";

const COLORS = {
  surface: "#12121A",
  card: "#16161F",
  border: "#1E1E2E",
  borderHover: "#2A2A3E",
  accent: "#00FF87",
  orange: "#F59E0B",
  red: "#EF4444",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#475569",
};

export default function HITLEscalation({
  leaseId,
  isLandlord,
  isTenant,
  address,
  escrowDetails,
  moveInPhotos = [],
  moveOutPhotos = [],
  tenantAgreed = false,
  landlordAgreed = false,
  onEscalated,  
}) {
  const [status, setStatus] = useState(null);
  const [statement, setStatement] = useState("");
  const [showStatementBox, setShowStatementBox] = useState(false);
  const [escalationData, setEscalationData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`http://localhost:3001/api/disputes/${leaseId}/escalation-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.escalated) {
            setStatus("submitted");
            setEscalationData(data);
          } else {
            setStatus("idle");
          }
        } else {
          setStatus("idle");
        }
      } catch {
        setStatus("idle");
      }
    }
    checkStatus();
  }, [leaseId]);

  const handleSubmitEscalation = async () => {
  try {
    setStatus("submitting");
    const res = await fetch(`http://localhost:3001/api/disputes/${leaseId}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contestedBy: address,
        role: isLandlord ? "landlord" : "tenant",
        statement: statement || null,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error("Failed to escalate");
    const data = await res.json();
    setEscalationData(data);
    setStatus("submitted");
    onEscalated?.();       // ← ADD THIS
  } catch (err) {
    setError(err.message);
    setStatus("error");
  }
};
  if (!isLandlord && !isTenant) return null;
  if (status === null) return null;

  // Hide only for the specific user who accepted on-chain
  const thisUserAccepted = (isTenant && tenantAgreed) || (isLandlord && landlordAgreed);
  if (thisUserAccepted) return null;

  return (
    <div className="card" style={{ marginTop: "20px", borderColor: status === "submitted" ? COLORS.orange : COLORS.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "20px" }}>⚖️</span>
        <h3>Human Review</h3>
      </div>

      {status === "idle" && (
        <>
          <p style={{ fontSize: "14px", color: COLORS.textSecondary, marginBottom: "16px" }}>
            If you disagree with the AI verdict above, you can escalate this dispute to a human arbitrator for a final binding decision.
          </p>
          <div style={{ padding: "12px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", color: COLORS.orange }}>
            ⚠️ A non-refundable arbitration fee will be deducted from the <strong>losing party's</strong> payout. Estimated resolution: 24–72 hours.
          </div>
          <button className="btn-primary" onClick={() => setStatus("confirming")} style={{ background: COLORS.orange, color: "#000" }}>
            ❌ Contest AI Verdict — Request Human Review
          </button>
        </>
      )}

      {status === "confirming" && (
        <>
          <p style={{ fontSize: "14px", color: COLORS.textSecondary, marginBottom: "16px" }}>
            Your case will be escalated to a human arbitrator who will review all IPFS evidence and the AI reasoning.
          </p>
          <div style={{ marginBottom: "16px" }}>
            <button onClick={() => setShowStatementBox(!showStatementBox)} className="btn-ghost btn-sm" style={{ marginBottom: "10px" }}>
              {showStatementBox ? "Hide" : "📝 Add optional written statement"}
            </button>
            {showStatementBox && (
              <textarea
                className="input-field"
                placeholder="Describe why you disagree with the AI verdict and provide any additional context..."
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={4}
                style={{ resize: "vertical" }}
              />
            )}
          </div>
          <div style={{ background: COLORS.surface, borderRadius: "8px", padding: "14px", marginBottom: "16px", fontSize: "13px" }}>
            <p style={{ color: COLORS.textSecondary, marginBottom: "6px" }}>What happens next:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", color: COLORS.textPrimary }}>
              <span>1. Your escalation request is logged on the backend</span>
              <span>2. The assigned verifier is notified</span>
              <span>3. Verifier reviews move-in photos, move-out photos, and AI reasoning</span>
              <span>4. Verifier submits a final on-chain resolution (24–72h)</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-ghost" onClick={() => setStatus("idle")} style={{ flex: 1 }}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmitEscalation} style={{ flex: 1, background: COLORS.orange, color: "#000" }}>
              Confirm Escalation
            </button>
          </div>
        </>
      )}

      {status === "submitting" && (
        <div style={{ textAlign: "center", padding: "20px", color: COLORS.textSecondary }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 12px" }}></span>
          Submitting escalation request...
        </div>
      )}

      {status === "submitted" && (
        <div>
          <div style={{
            padding: "12px 16px", borderRadius: "8px", marginBottom: "16px",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
            color: COLORS.red, fontSize: "14px",
          }}>
            ❌ You have rejected the AI proposal and requested human arbitration.
          </div>
          <div style={{ background: COLORS.surface, borderRadius: "8px", padding: "14px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: COLORS.textSecondary }}>Status</span>
              <span style={{ background: "rgba(245,158,11,0.1)", color: COLORS.orange, padding: "2px 10px", borderRadius: "12px", fontSize: "12px" }}>
                Pending Arbitrator Review
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: COLORS.textSecondary }}>Contested by</span>
              <span className="mono">{escalationData?.contestedBy?.slice(0, 10)}...</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: COLORS.textSecondary }}>Submitted at</span>
              <span>{escalationData?.timestamp ? new Date(escalationData.timestamp).toLocaleString() : "-"}</span>
            </div>
            {escalationData?.statement && (
              <div>
                <p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>Your statement:</p>
                <p style={{ fontStyle: "italic" }}>{escalationData.statement}</p>
              </div>
            )}
          </div>
          <p style={{ marginTop: "12px", fontSize: "12px", color: COLORS.textMuted }}>
            The verifier will resolve this dispute on-chain within 24–72 hours.
          </p>
        </div>
      )}

      {status === "error" && (
        <div>
          <div className="alert alert-error" style={{ marginBottom: "12px" }}>⚠️ {error}</div>
          <button className="btn-ghost btn-sm" onClick={() => setStatus("idle")}>Try Again</button>
        </div>
      )}
    </div>
  );
}