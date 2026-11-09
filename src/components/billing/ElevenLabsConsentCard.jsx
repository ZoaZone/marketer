import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

// How much more of the plan allowance an ElevenLabs run draws. Display only
// — the server is the authority (ELEVENLABS_SURCHARGE_PCT in the metering
// block, which refuses any surcharged run without a matching stored
// consent). Deliberately expressed in allowance terms, which is the unit
// customers actually see on their usage page.
const SURCHARGE_LABEL = "25%";

/**
 * ElevenLabsConsentCard — the opt-in for ElevenLabs-backed generation.
 *
 * ElevenLabs runs draw more from a plan's monthly allowance than the
 * standard rate, so the server refuses them outright (402,
 * `elevenlabs_consent_required`) until an account has recorded agreement.
 * This is where that agreement is given and withdrawn.
 *
 * Shown to everyone, not just BYOK-entitled accounts: the charge applies to
 * runs on the PLATFORM key, which is exactly the case a BYOK customer is
 * not in. A customer using their own ElevenLabs key is never surcharged and
 * never needs to consent — the card says so rather than asking them for
 * agreement they don't owe.
 */
export default function ElevenLabsConsentCard({ user, usingOwnKey = false }) {
  const qc = useQueryClient();
  const stored = user?.settings?.elevenlabs_surcharge_consent;
  const accepted = stored?.accepted === true;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setConsent = async (next) => {
    setSaving(true); setError("");
    try {
      const res = await base44.functions.invoke("setElevenLabsConsent", { accepted: next });
      const data = res?.data ?? res;
      if (!data?.success) throw new Error(data?.error || "Could not save your choice.");
      // The consent lives on the user record, which is what gates every
      // ElevenLabs run — refetch so the rest of the app sees it immediately
      // instead of after the next full reload.
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["user"] });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Could not save your choice.");
    }
    setSaving(false);
  };

  if (usingOwnKey) {
    return (
      <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3">
        <Mic className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">ElevenLabs runs on your own key</p>
          <p className="text-xs text-muted-foreground">
            Your ElevenLabs account is billed directly, so these generations don't draw on your plan
            allowance at all and there's nothing to approve here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border ${accepted ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/25"}`}>
      <div className="flex items-start gap-3">
        <Mic className={`w-4 h-4 shrink-0 mt-0.5 ${accepted ? "text-emerald-400" : "text-amber-400"}`} />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            ElevenLabs generation {accepted ? "— approved" : "— approval needed"}
          </p>
          <p className="text-xs text-muted-foreground">
            ElevenLabs powers AI music, voiceover and dubbing. Because it costs more to run than the
            standard engines, an ElevenLabs generation draws <strong className="text-foreground">{SURCHARGE_LABEL} more</strong> from
            your monthly allowance than the same job on the standard rate. Nothing else about your plan changes.
          </p>
          {accepted ? (
            <p className="text-[11px] text-emerald-400/90 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Approved{stored?.acceptedAt ? ` on ${new Date(stored.acceptedAt).toLocaleDateString()}` : ""} — ElevenLabs features are enabled.
            </p>
          ) : (
            <p className="text-[11px] text-amber-400/90">
              Until you approve this, ElevenLabs music, voiceover and dubbing are declined rather than
              charged. Other engines keep working normally.
            </p>
          )}
          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => setConsent(!accepted)}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
              accepted
                ? "border border-border text-muted-foreground hover:bg-muted/20"
                : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90"
            }`}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {accepted ? "Withdraw approval" : `Approve ${SURCHARGE_LABEL} allowance uplift`}
          </button>
        </div>
      </div>
    </div>
  );
}
