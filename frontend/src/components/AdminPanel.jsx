import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { useReadContract } from "wagmi";
import { ESCROW_ABI, ESCROW_ADDRESS } from "../config/contracts";
import { API_BASE_URL, USDC_DECIMALS_FACTOR } from "../config/api";
import { ipfsUrl, formatUSDC } from "../utils/format";

const COLORS = {
  bg: "#0A0A0F", surface: "#12121A", card: "#16161F",
  border: "#1E1E2E", accent: "#00FF87", orange: "#F59E0B",
  red: "#EF4444", blue: "#3B82F6", purple: "#A78BFA",
  textPrimary: "#F1F5F9", textSecondary: "#94A3B8", textMuted: "#475569",
};

const STATE_NAMES = ["CREATED", "LOCKED", "DISPUTED", "RELEASED", "REFUNDED"];

/**
 * Fetches on-chain lease details and the associated AI verdict from IPFS.
 * Only executes when leaseId is truthy (used to defer loading until expanded).
 */
function useLeaseDetails(leaseId) {
  const [details, setDetails] = useState(null);
  const [aiVerdict, setAiVerdict] = useState(null);
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leaseId) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/leases/${leaseId}`)
      .then((r) => r.json())
      .then((d) => setDetails(d))
      .catch((err) => setFetchError(err.message || "Failed to load lease"))
      .finally(() => setLoading(false));
  }, [leaseId]);

  const { data: verdictCID } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "aiVerdictCIDs",
    args: [BigInt(leaseId ?? 0)],
    query: { enabled: !!leaseId },
  });

  useEffect(() => {
    if (!verdictCID || verdictCID === "") return;
    fetch(ipfsUrl(verdictCID))
      .then((r) => r.json())
      .then((d) => setAiVerdict(d))
      .catch((err) => setFetchError(err.message || "Failed to load AI verdict"));
  }, [verdictCID]);

  return { details, aiVerdict, verdictCID, loading, fetchError };
}

/**
 * Displays photos stored under a given IPFS CID, fetching the metadata JSON
 * and rendering each photo CID as a thumbnail.
 */
function EvidenceGallery({ cid, label, photoKey }) {
  const [meta, setMeta] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!cid) return;
    setMeta(null);
    setFetchError(false);
    fetch(ipfsUrl(cid))
      .then((r) => {
        if (!r.ok) throw new Error("IPFS fetch failed");
        return r.json();
      })
      .then((d) => setMeta(d))
      .catch(() => setFetchError(true));
  }, [cid]);

  if (!cid) return (
    <p style={{ color: COLORS.textMuted, fontSize: "12px" }}>No {label} CID on-chain.</p>
  );

  // Filter out placeholder CIDs injected during local testing.
  const photos = (meta?.[photoKey] ?? []).filter(p => !p.includes("Fallback"));

  return (
    <div>
      <p style={{ color: COLORS.textSecondary, fontSize: "13px", fontWeight: "600", marginBottom: "8px" }}>
        {label}
      </p>
      {!meta && !fetchError && (
        <p style={{ color: COLORS.textMuted, fontSize: "12px" }}>
          <span className="spinner" style={{ display: "inline-block", marginRight: "6px", verticalAlign: "middle" }}></span>
          Fetching from IPFS…
        </p>
      )}
      {fetchError && (
        <p style={{ color: COLORS.red, fontSize: "12px" }}>⚠️ Could not fetch IPFS metadata.</p>
      )}
      {meta && photos.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "6px" }}>
          {photos.map((photoCid, i) => (
            <a key={i} href={ipfsUrl(photoCid)} target="_blank" rel="noopener noreferrer">
              <img
                src={ipfsUrl(photoCid)}
                alt={`${label} ${i + 1}`}
                style={{
                  width: "100%", height: "90px", objectFit: "cover",
                  borderRadius: "6px", border: `1px solid ${COLORS.border}`,
                  cursor: "pointer", transition: "opacity 0.2s",
                }}
                onError={(e) => { e.target.style.display = "none"; }}
                onMouseOver={(e) => { e.target.style.opacity = "0.8"; }}
                onMouseOut={(e) => { e.target.style.opacity = "1"; }}
              />
            </a>
          ))}
        </div>
      ) : meta ? (
        <p style={{ color: COLORS.textMuted, fontSize: "12px" }}>No photos uploaded.</p>
      ) : null}
      {cid && (
        <a
          href={ipfsUrl(cid)}
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: "11px", color: COLORS.textMuted, display: "inline-block", marginTop: "8px" }}
        >
          ↗ Raw metadata: {cid.slice(0, 16)}…
        </a>
      )}
    </div>
  );
}

EvidenceGallery.propTypes = {
  cid: PropTypes.string,
  /** Human-readable section label (e.g. "Move-In Photos"). */
  label: PropTypes.string.isRequired,
  /** Key in the IPFS metadata JSON that holds the array of photo CIDs. */
  photoKey: PropTypes.string.isRequired,
};

/**
 * Card for a single escalated dispute. Expands to show on-chain lease details,
 * evidence galleries, the AI verdict, and a form for the admin to resolve on-chain.
 */
function DisputeCard({ d, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [localError, setLocalError] = useState("");
  const { details, aiVerdict, verdictCID, loading } = useLeaseDetails(expanded ? d.leaseId : null);

  const deposit = details ? formatUSDC(details.depositAmount) : "—";
  const stake = details ? formatUSDC(details.landlordStake) : "—";
  const state = details ? (STATE_NAMES[details.state] ?? "UNKNOWN") : "—";
  const deadline = details ? new Date(Number(details.deadline) * 1000).toLocaleString() : "—";

  const handleResolveClick = async () => {
    if (!amountInput) { setLocalError("Enter an amount"); return; }
    setLocalError("");
    try {
      setResolving(true);
      const res = await fetch(
        `${API_BASE_URL}/api/disputes/${d.leaseId}/resolve-onchain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountToLandlord: amountInput }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setShowResolveForm(false);
      onResolved(); // Reload the parent dispute list after resolution.
    } catch (err) {
      setLocalError(`Error: ${err.message}`);
    } finally {
      setResolving(false);
    }
  };

  /**
   * Formats the AI verdict amount for display.
   * The LLM returns human-readable USDC (e.g. 300.0) but legacy on-chain data
   * may have been stored as raw 6-decimal units (e.g. 300000000). Values above
   * the maximum realistic human-readable deposit (~10 000 USDC) are treated as
   * raw and converted; smaller values are used directly.
   */
  const formatVerdictAmount = (raw) =>
    raw > 10_000 * USDC_DECIMALS_FACTOR
      ? formatUSDC(raw)
      : Number(raw).toFixed(2);

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${d.status === "resolved" ? "rgba(0,255,135,0.3)" : COLORS.orange}`,
      borderRadius: "12px", padding: "18px",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "700" }}>Lease #{d.leaseId}</div>
          <div style={{ fontSize: "13px", color: COLORS.textSecondary, marginTop: "4px" }}>
            Contested by: <span style={{ color: COLORS.textPrimary }}>{d.role}</span> — {d.contestedBy?.slice(0, 10)}…
          </div>
          <div style={{ fontSize: "12px", color: COLORS.textMuted, marginTop: "2px" }}>
            {new Date(d.timestamp).toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{
            padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "500",
            background: d.status === "resolved" ? "rgba(0,255,135,0.1)" : "rgba(245,158,11,0.1)",
            color: d.status === "resolved" ? COLORS.accent : COLORS.orange,
          }}>
            {d.status === "resolved" ? "Resolved" : "Pending"}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.textSecondary, padding: "4px 12px", borderRadius: "6px",
              fontSize: "12px", cursor: "pointer",
            }}
          >
            {expanded ? "▲ Hide" : "▼ Details"}
          </button>
        </div>
      </div>

      {/* Statement */}
      {d.statement && (
        <div style={{
          background: COLORS.surface, borderRadius: "8px", padding: "10px 14px",
          marginBottom: "10px", fontSize: "13px",
        }}>
          <p style={{ color: COLORS.textSecondary, marginBottom: "4px", fontSize: "12px" }}>
            Statement from {d.role}:
          </p>
          <p style={{ fontStyle: "italic" }}>{d.statement}</p>
        </div>
      )}

      {/* Expanded panels */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
          {loading && <p style={{ color: COLORS.textMuted, fontSize: "13px" }}>Loading on-chain data…</p>}

          {details && (
            <div style={{ background: COLORS.surface, borderRadius: "10px", padding: "14px" }}>
              <p style={{ color: COLORS.orange, fontWeight: "600", marginBottom: "12px", fontSize: "14px" }}>
                📋 Escrow Details
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                {[
                  ["State", state],
                  ["Deposit", `${deposit} USDC`],
                  ["Landlord Stake", `${stake} USDC`],
                  ["Deadline", deadline],
                  ["Landlord", details.landlord?.slice(0, 14) + "…"],
                  ["Tenant", details.tenant?.slice(0, 14) + "…"],
                  ["Verifier", details.verifier?.slice(0, 14) + "…"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p style={{ color: COLORS.textMuted, fontSize: "11px", marginBottom: "2px" }}>{label}</p>
                    <p style={{ fontFamily: "monospace", fontSize: "12px" }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {details && (
            <div style={{ background: COLORS.surface, borderRadius: "10px", padding: "14px" }}>
              <p style={{ color: COLORS.orange, fontWeight: "600", marginBottom: "12px", fontSize: "14px" }}>
                🖼️ Evidence
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <EvidenceGallery cid={details.moveInCID} label="Move-In Photos" photoKey="moveInPhotoCIDs" />
                <EvidenceGallery cid={details.moveOutCID} label="Move-Out Photos" photoKey="moveOutPhotoCIDs" />
              </div>
            </div>
          )}

          <div style={{ background: COLORS.surface, borderRadius: "10px", padding: "14px" }}>
            <p style={{ color: COLORS.purple, fontWeight: "600", marginBottom: "12px", fontSize: "14px" }}>
              🤖 AI Verdict
            </p>
            {!verdictCID ? (
              <p style={{ color: COLORS.textMuted, fontSize: "13px" }}>No AI verdict submitted on-chain yet.</p>
            ) : aiVerdict ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                {aiVerdict.amountToLandlord !== undefined && (
                  <p>
                    Landlord: <strong style={{ color: COLORS.purple }}>
                      {formatVerdictAmount(aiVerdict.amountToLandlord)} USDC
                    </strong>
                    {" · "}
                    Tenant: <strong style={{ color: COLORS.accent }}>
                      {(
                        Number(formatUSDC(details?.depositAmount ?? 0)) -
                        Number(formatVerdictAmount(aiVerdict.amountToLandlord))
                      ).toFixed(2)} USDC
                    </strong>
                  </p>
                )}
                {aiVerdict.reasoning && (
                  <div>
                    <p style={{ color: COLORS.textMuted, fontSize: "11px", marginBottom: "4px" }}>Reasoning</p>
                    <p style={{ lineHeight: "1.6", color: COLORS.textSecondary, whiteSpace: "pre-wrap" }}>
                      {aiVerdict.reasoning}
                    </p>
                  </div>
                )}
                {aiVerdict.damages && (
                  <div>
                    <p style={{ color: COLORS.textMuted, fontSize: "11px", marginBottom: "4px" }}>Damage Assessment</p>
                    <p style={{ color: COLORS.textSecondary }}>{aiVerdict.damages}</p>
                  </div>
                )}
                <a
                  href={ipfsUrl(verdictCID)}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "11px", color: COLORS.textMuted }}
                >
                  ↗ Full verdict on IPFS: {verdictCID.slice(0, 16)}…
                </a>
              </div>
            ) : (
              <p style={{ color: COLORS.textMuted, fontSize: "13px" }}>
                Fetching AI verdict from IPFS ({verdictCID?.slice(0, 16)}…)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resolve section */}
      {d.status === "resolved" ? (
        <div style={{ fontSize: "13px", color: COLORS.textSecondary, marginTop: "10px" }}>
          Resolved by: <span style={{ fontFamily: "monospace" }}>{d.resolvedBy?.slice(0, 10)}…</span>
          {" · "}Tx: <span style={{ fontFamily: "monospace" }}>{d.txHash?.slice(0, 12)}…</span>
        </div>
      ) : showResolveForm ? (
        <div style={{ marginTop: "14px" }}>
          <p style={{ fontSize: "13px", color: COLORS.textSecondary, marginBottom: "8px" }}>
            Enter the amount (USDC) to award to the <strong>landlord</strong>. Remainder goes to the tenant.
          </p>
          {localError && (
            <p style={{ color: COLORS.red, fontSize: "12px", marginBottom: "8px" }}>⚠️ {localError}</p>
          )}
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="number"
              placeholder="Amount to landlord (USDC)"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              style={{
                flex: 1, background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: "8px", padding: "10px 14px", color: COLORS.textPrimary,
                fontFamily: "inherit", fontSize: "14px", outline: "none",
              }}
            />
            <button
              onClick={handleResolveClick}
              disabled={resolving}
              style={{
                background: COLORS.accent, color: "#000", border: "none",
                padding: "10px 20px", borderRadius: "8px", fontWeight: "600",
                fontSize: "14px", cursor: resolving ? "not-allowed" : "pointer",
                opacity: resolving ? 0.6 : 1,
              }}
            >
              {resolving ? "…" : "Resolve On-Chain"}
            </button>
            <button
              onClick={() => { setShowResolveForm(false); setLocalError(""); }}
              style={{
                background: "transparent", border: `1px solid ${COLORS.border}`,
                color: COLORS.textSecondary, padding: "10px 16px",
                borderRadius: "8px", cursor: "pointer", fontSize: "14px",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowResolveForm(true)}
          style={{
            marginTop: "12px", background: COLORS.accent, color: "#000", border: "none",
            padding: "8px 18px", borderRadius: "8px", fontWeight: "600",
            fontSize: "13px", cursor: "pointer",
          }}
        >
          Review & Resolve
        </button>
      )}
    </div>
  );
}

DisputeCard.propTypes = {
  /** Escalation record from the backend. */
  d: PropTypes.shape({
    leaseId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    status: PropTypes.string,
    role: PropTypes.string,
    contestedBy: PropTypes.string,
    statement: PropTypes.string,
    timestamp: PropTypes.string,
    resolvedBy: PropTypes.string,
    txHash: PropTypes.string,
  }).isRequired,
  /** Called after a successful on-chain resolution to trigger a list refresh. */
  onResolved: PropTypes.func.isRequired,
};

/** Admin view for reviewing escalated disputes and submitting on-chain resolutions. */
export default function AdminPanel({ onBack }) {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/disputes/all`);
      const data = await res.json();
      setDisputes(data.disputes || []);
    } catch {
      setMessage("Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  return (
    <div style={{ padding: "40px", maxWidth: "860px" }}>
      <div style={{ position: "relative", marginBottom: "30px", textAlign: "center" }}>
        <button
          onClick={onBack}
          style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: `1px solid ${COLORS.border}`,
            color: COLORS.textSecondary, padding: "6px 14px", borderRadius: "6px",
            fontSize: "13px", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
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
        <button
          onClick={loadDisputes}
          style={{
            background: "transparent", border: `1px solid ${COLORS.border}`,
            color: COLORS.textSecondary, padding: "6px 14px", borderRadius: "6px",
            fontSize: "13px", cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: COLORS.textSecondary }}>Loading…</p>
      ) : disputes.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px", color: COLORS.textSecondary,
          background: COLORS.card, borderRadius: "12px", border: `1px solid ${COLORS.border}`,
        }}>
          No escalated disputes
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {disputes.map((d) => (
            <DisputeCard key={d.leaseId} d={d} onResolved={loadDisputes} />
          ))}
        </div>
      )}
    </div>
  );
}

AdminPanel.propTypes = {
  /** Called when the user navigates back from the admin panel. */
  onBack: PropTypes.func,
};

AdminPanel.defaultProps = {
  onBack: () => {},
};
