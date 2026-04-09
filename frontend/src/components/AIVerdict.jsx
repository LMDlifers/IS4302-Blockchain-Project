import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ESCROW_ADDRESS, ESCROW_ABI } from "../config/contracts";

export default function AIVerdict({ leaseId, escrowDetails, onAccepted, onEscalated, externalRejected = false }) {
  const { address } = useAccount();
  const [aiData, setAiData] = useState(null);
  const [fetchError, setFetchError] = useState("");
  const [userRejected, setUserRejected] = useState(false);

  const landlordAddr = escrowDetails?.[0];
  const tenantAddr = escrowDetails?.[1];

  const stateIndex = escrowDetails && escrowDetails.length > 9
    ? Number(escrowDetails[9])
    : Number(escrowDetails?.state);

  const isTenant = address && tenantAddr && address.toLowerCase() === tenantAddr.toLowerCase();
  const isLandlord = address && landlordAddr && address.toLowerCase() === landlordAddr.toLowerCase();
  const canAct = isTenant || isLandlord;

  const safeLeaseId = useMemo(() => {
    try { return BigInt(leaseId?.toString() || "0"); }
    catch { return BigInt(0); }
  }, [leaseId]);

  const { data: verdictCID, isLoading: isVerdictCidLoading, refetch: refetchVerdictCid } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "aiVerdictCIDs",
    args: [safeLeaseId],
    query: { refetchInterval: 4000 },
  });

  const { data: tenantAgreed, refetch: refetchTenantAgreed } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "tenantAgreedAI",
    args: [safeLeaseId],
    query: { refetchInterval: 4000 },
  });

  const { data: landlordAgreed, refetch: refetchLandlordAgreed } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "landlordAgreedAI",
    args: [safeLeaseId],
    query: { refetchInterval: 4000 },
  });
   const isRejected = userRejected || externalRejected;

  // Load AI verdict from IPFS
  useEffect(() => {
    const loadVerdict = async () => {
      if (!verdictCID || verdictCID === "") { setAiData(null); return; }
      try {
        setFetchError("");
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${verdictCID}`);
        if (!res.ok) throw new Error(`Failed to fetch verdict: ${res.status}`);
        const json = await res.json();
        setAiData(json);
      } catch (err) {
        console.error("Failed to fetch AI verdict:", err);
        setFetchError(err.message || "Failed to load AI verdict");
      }
    };
    loadVerdict();
  }, [verdictCID]);

  // On mount: check backend if this user already escalated (persists across page reloads)
  useEffect(() => {
    if (!leaseId || !address) return;
    fetch(`http://localhost:3001/api/disputes/${leaseId}/escalation-status`)
      .then(r => r.json())
      .then(data => {
        if (data.escalated && data.contestedBy?.toLowerCase() === address.toLowerCase()) {
          setUserRejected(true);
          onEscalated?.();
        }
      })
      .catch(() => {});
  }, [leaseId, address]);

  const { writeContract: writeAccept, data: acceptHash, isPending: isAcceptPending } = useWriteContract();
  const { writeContract: writeEscalate, data: escalateHash, isPending: isEscalatePending } = useWriteContract();

  const { isSuccess: isAcceptSuccess, isLoading: isAcceptConfirming } = useWaitForTransactionReceipt({ hash: acceptHash });
  const { isSuccess: isEscalateSuccess, isLoading: isEscalateConfirming } = useWaitForTransactionReceipt({ hash: escalateHash });

  useEffect(() => {
    if (isAcceptSuccess) {
      refetchVerdictCid();
      refetchTenantAgreed();
      refetchLandlordAgreed();
      onAccepted?.();
    }
  }, [isAcceptSuccess, refetchVerdictCid, refetchTenantAgreed, refetchLandlordAgreed, onAccepted]);

  useEffect(() => {
    if (isEscalateSuccess) {
      refetchVerdictCid();
      refetchTenantAgreed();
      refetchLandlordAgreed();
      setUserRejected(true);
      onEscalated?.();
    }
  }, [isEscalateSuccess, refetchVerdictCid, refetchTenantAgreed, refetchLandlordAgreed, onEscalated]);

  const handleAccept = () => {
    writeAccept({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "acceptAIVerdict",
      args: [safeLeaseId],
    });
  };

  const handleEscalate = () => {
    writeEscalate({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "escalateToHuman",
      args: [safeLeaseId],
    });
  };

  const hasCurrentUserAccepted = useMemo(() => {
    if (isTenant) return Boolean(tenantAgreed);
    if (isLandlord) return Boolean(landlordAgreed);
    return false;
  }, [isTenant, isLandlord, tenantAgreed, landlordAgreed]);

  if (stateIndex !== 2) return null;

  if (isVerdictCidLoading) {
    return (
      <div className="card" style={{ marginTop: "20px", textAlign: "center", padding: "30px" }}>
        <span className="spinner" style={{ marginRight: "10px" }}></span>
        <span style={{ color: "#94A3B8" }}>Loading AI verdict status...</span>
      </div>
    );
  }

  if (!verdictCID || verdictCID === "") {
    return (
      <div className="card" style={{ marginTop: "20px", background: "rgba(245, 158, 11, 0.05)", borderColor: "rgba(245, 158, 11, 0.2)", textAlign: "center", padding: "30px" }}>
        <span className="spinner" style={{ marginRight: "10px", borderTopColor: "#F59E0B" }}></span>
        <span style={{ color: "#FCD34D" }}>AI is currently reviewing the evidence. Please wait...</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "20px", background: "rgba(59, 130, 246, 0.05)", borderColor: "rgba(59, 130, 246, 0.3)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid rgba(59, 130, 246, 0.2)", paddingBottom: "16px" }}>
        <span style={{ fontSize: "24px" }}>🤖</span>
        <h3 style={{ margin: 0, color: "#60A5FA", fontSize: "18px" }}>AI Arbitrator Proposal</h3>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "8px", border: "1px solid #1E1E2E" }}>
          <p style={{ color: "#94A3B8", fontSize: "12px", marginBottom: "4px" }}>Proposed to Landlord</p>
          <p style={{ fontSize: "18px", fontWeight: "700", color: "#F1F5F9" }}>
            {aiData?.amountToLandlord !== undefined ? `${aiData.amountToLandlord} USDC` : "Loading..."}
          </p>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "8px", border: "1px solid #1E1E2E" }}>
          <p style={{ color: "#94A3B8", fontSize: "12px", marginBottom: "4px" }}>AI Confidence</p>
          <p style={{ fontSize: "18px", fontWeight: "700", color: aiData?.confidence >= 0.8 ? "#00FF87" : "#F59E0B" }}>
            {aiData?.confidence ? `${(aiData.confidence * 100).toFixed(0)}%` : "N/A"}
          </p>
        </div>
      </div>

      {/* Reasoning Box */}
      <div style={{ background: "rgba(0,0,0,0.3)", padding: "20px", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.15)", marginBottom: "24px" }}>
        <p style={{ color: "#60A5FA", fontSize: "12px", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Reasoning</p>
        <p style={{ color: "#E2E8F0", fontSize: "14px", lineHeight: "1.6", fontStyle: "italic" }}>
          "{aiData?.reasoning || "Analyzing..."}"
        </p>
      </div>

      {/* Agreement Status — shows Rejected badge if this user escalated */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", background: "#12121A", padding: "12px 16px", borderRadius: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#94A3B8", fontSize: "13px" }}>Tenant Status:</span>
          <span className={`status-badge ${
            tenantAgreed ? "status-released"
            : (isRejected) ? "status-disputed"
            : "status-locked"
          }`}>
            {tenantAgreed ? "Accepted" : (isRejected) ? "Rejected" : "Pending"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#94A3B8", fontSize: "13px" }}>Landlord Status:</span>
          <span className={`status-badge ${
            landlordAgreed ? "status-released"
            : (isRejected) ? "status-disputed"
            : "status-locked"
          }`}>
            {landlordAgreed ? "Accepted" : (isRejected) ? "Rejected" : "Pending"}
          </span>
        </div>
      </div>

      {/* Error State */}
      {fetchError && (
        <div className="alert alert-error" style={{ marginBottom: "20px" }}>{fetchError}</div>
      )}

      {/* Action Buttons */}
      {!canAct ? (
        <p style={{ textAlign: "center", color: "#94A3B8", fontSize: "13px", margin: 0 }}>
          Only the tenant and landlord can respond to this proposal.
        </p>
      ) : hasCurrentUserAccepted ? (
        <div className="alert alert-success" style={{ justifyContent: "center", margin: 0 }}>
          ✅ You have accepted this proposal. Waiting for the other party...
        </div>
      ) : isRejected ? (
        <div style={{
          padding: "12px 16px", borderRadius: "8px",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
          color: "#EF4444", fontSize: "13px", fontWeight: "500", textAlign: "center",
        }}>
          ❌ You or the other party rejected this AI proposal and requested human arbitration.
        </div>
      ) : (
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className="btn-primary"
            onClick={handleAccept}
            disabled={isAcceptPending || isAcceptConfirming}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {isAcceptPending || isAcceptConfirming
              ? <><span className="spinner"></span> Accepting...</>
              : "Accept Proposal"}
          </button>
          
        </div>
      )}
    </div>
  );
}