import { Lock, Zap, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const BRAND = "Marketer OS";
const PRICING_ROUTE = "/Pricing";
const ACCENT = "#10b981";

// TIER_NAMES maps numeric tier level → display name for this app
const TIER_NAMES = {"1": "Starter", "2": "Growth", "3": "Pro", "4": "Agency"};

/**
 * PlanGate — wraps a feature behind a plan tier check.
 *
 * Props:
 *   requiredTier  — minimum numeric tier required (e.g. 2)
 *   currentTier   — user's current numeric tier (from their subscription record)
 *   featureName   — display name of the locked feature
 *   children      — content to render when access is granted
 *   inline        — if true, render a compact inline banner instead of full-page block
 */
export default function PlanGate({ requiredTier, currentTier, children, featureName, inline = false }) {
  // Grant access if user's tier meets or exceeds required tier
  if ((currentTier ?? 0) >= (requiredTier ?? 1)) return children;

  const requiredName = TIER_NAMES[requiredTier] || ("Tier " + requiredTier);

  if (inline) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12,
        background: ACCENT + "12", border: "1px solid " + ACCENT + "30", fontSize:13 }}>
        <Lock style={{ width:14, height:14, color:ACCENT, flexShrink:0 }} />
        <span style={{ color:"#334155", flex:1 }}>
          <strong style={{ color: ACCENT }}>{featureName || "This feature"}</strong> requires the
          <strong> {requiredName}</strong> plan or higher.
        </span>
        <Link to={PRICING_ROUTE} style={{ color:ACCENT, fontWeight:600, fontSize:12, whiteSpace:"nowrap",
          display:"flex", alignItems:"center", gap:4 }}>
          Upgrade <ArrowRight style={{ width:12, height:12 }} />
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"60vh", display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"40px 24px", textAlign:"center" }}>
      <div style={{ width:72, height:72, borderRadius:20, background: ACCENT + "15",
        display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
        <Lock style={{ width:32, height:32, color:ACCENT }} />
      </div>
      <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", marginBottom:8 }}>
        {featureName || "This Feature"} is Locked
      </h2>
      <p style={{ color:"#64748b", maxWidth:380, marginBottom:28, lineHeight:1.6, fontSize:14 }}>
        You need the <strong style={{ color:ACCENT }}>{requiredName}</strong> plan or higher to access this feature.
        Upgrade now to unlock it and keep your workflow running.
      </p>
      <Link to={PRICING_ROUTE} style={{ display:"inline-flex", alignItems:"center", gap:8,
        padding:"12px 24px", borderRadius:12, background: ACCENT,
        color:"white", fontWeight:700, fontSize:14, textDecoration:"none" }}>
        <Zap style={{ width:16, height:16 }} />
        View {BRAND} Plans
      </Link>
    </div>
  );
}
