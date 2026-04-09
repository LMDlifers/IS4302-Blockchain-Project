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
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  if (!isLandlord && !isTenant) return null;
  if (status === null) return null;

  const stateNames = ["CREATED", "LOCKED", "DISPUTED", "RELEASED", "REFUNDED"];
  const stateIndex = Number(escrowDetails?.[9] || 0);
  const state = stateNames[stateIndex] || "UNKNOWN";
  const landlord = escrowDetails?.[0] || "0x0000000000000000000000000000000000000000";
  const tenant = escrowDetails?.[1] || "0x0000000000000000000000000000000000000000";
  const deposit = (Number(escrowDetails?.[3] || 0) / 1_000_000).toFixed(2);
  const stake = (Number(escrowDetails?.[4] || 0) / 1_000_000).toFixed(2);

  return (
    <div className="card" style={{ marginTop: "20px", borderColor: status === "submitted" ? COLORS.orange : COLORS.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "20px" }}>⚖️</span>
        <h3>Human Review</h3>
      </div>

      {/* <div className="card" style={{ marginBottom: "16px", background: COLORS.surface }}>
        <h4 style={{ marginBottom: "12px", color: COLORS.orange }}>Escrow Details</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
          <div><p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>Lease ID</p><p>{leaseId}</p></div>
          <div><p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>State</p><p>{state}</p></div>
          <div><p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>Landlord</p><p className="mono">{landlord.slice(0, 10)}...</p></div>
          <div><p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>Tenant</p><p className="mono">{tenant.slice(0, 10)}...</p></div>
          <div><p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>Deposit</p><p>{deposit} USDC</p></div>
          <div><p style={{ color: COLORS.textSecondary, marginBottom: "4px" }}>Stake</p><p>{stake} USDC</p></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <h4 style={{ marginBottom: "12px", color: COLORS.orange }}>Evidence Gallery</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <p style={{ color: COLORS.textSecondary, marginBottom: "8px" }}>Move-in Photos</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "8px" }}>
              {moveInPhotos.length > 0 ? moveInPhotos.map((cid, i) => (
                <a key={i} href={`https://gateway.pinata.cloud/ipfs/${cid}`} target="_blank" rel="noopener noreferrer">
                  <img
                    src={`https://gateway.pinata.cloud/ipfs/${cid}`}
                    alt={`Move-in ${i}`}
                    style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "6px" }}
                  />
                </a>
              )) : <p style={{ color: COLORS.textMuted, fontSize: "12px" }}>No move-in photos.</p>}
            </div>
          </div>

          <div>
            <p style={{ color: COLORS.textSecondary, marginBottom: "8px" }}>Move-out Photos</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "8px" }}>
              {moveOutPhotos.length > 0 ? moveOutPhotos.map((cid, i) => (
                <a key={i} href={`https://gateway.pinata.cloud/ipfs/${cid}`} target="_blank" rel="noopener noreferrer">
                  <img
                    src={`https://gateway.pinata.cloud/ipfs/${cid}`}
                    alt={`Move-out ${i}`}
                    style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "6px" }}
                  />
                </a>
              )) : <p style={{ color: COLORS.textMuted, fontSize: "12px" }}>No move-out photos.</p>}
            </div>
          </div>
        </div>
      </div> */}

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
          <div className="alert alert-success" style={{ marginBottom: "16px" }}>✓ Human review requested successfully</div>
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