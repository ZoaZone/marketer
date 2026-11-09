import { Wand2, Loader2, CheckCircle2, AlertTriangle, Zap, Repeat, Layers, ExternalLink } from "lucide-react";
import { occurrenceCount } from "@/utils/recurrence";

export default function LaunchStep({ campaign, navigate, saving, saved, publishReport, publishCampaign, imageCount, publishStatus }) {
  const outputCount = Object.values(campaign.outputs || {}).filter(Boolean).length;
  const repeat = campaign.repeat || {};
  const repurposedCount = Object.values(campaign.platform_overrides || {}).filter(o => o?.media_url || o?.hashtags || o?.description || o?.thumbnail).length;

  return (
    <div className="space-y-6 text-center py-12 animate-in fade-in duration-500">
      {saved ? (
        <div className="animate-in zoom-in slide-in-from-bottom-4 duration-700">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-12 h-12 text-emerald-500" /></div>
          <p className="text-4xl font-black text-white mb-3">Campaign Saved</p>
          <p className="text-neutral-400 mb-6">
            {publishReport.length ? "Here's what happened for each account:" : "Your campaign and content were saved as drafts — no accounts were targeted."}
          </p>
          {publishReport.length > 0 && (
            <div className="max-w-md mx-auto text-left space-y-2 mb-6">
              {publishReport.map((r, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                  r.status === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : r.status === "skipped" ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  : "bg-red-500/10 border-red-500/20 text-red-300"
                }`}>
                  {r.status === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <p className="font-semibold">{r.account_name} <span className="text-xs opacity-70 capitalize">({r.platform})</span></p>
                    <p className="text-xs opacity-80 mt-0.5">{r.message}</p>
                    {r.post_url && (
                      <a href={r.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline mt-1.5">
                        <ExternalLink className="w-3 h-3" /> View live post
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => navigate("/social-hub")} className="px-8 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-full font-bold text-white transition-colors">Go to Social Hub</button>
        </div>
      ) : (
        <div className="max-w-md mx-auto">
          <Wand2 className="w-16 h-16 text-fuchsia-500 mx-auto mb-6 opacity-80" />
          <h2 className="text-3xl font-black text-white mb-2">Ready to Launch?</h2>
          <div className="text-left text-sm text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6 space-y-1.5">
            <p>Campaign: <span className="text-white font-semibold">{campaign.campaign_name || "Untitled"}</span></p>
            <p>Accounts: <span className="text-white font-semibold">{campaign.selected_accounts.length || "none (drafts)"}</span></p>
            <p>Copy: <span className="text-white font-semibold">{campaign.ai_output ? "✓ generated" : "none"}</span></p>
            <p>Outputs saved: <span className="text-white font-semibold">{outputCount || "none"}{campaign.outputs?.hashtag_set ? " (incl. hashtags)" : ""}</span></p>
            <p>Media: <span className="text-white font-semibold">{campaign.video_url ? "video + " : ""}{imageCount} image(s)</span></p>
            <p>Timeline: <span className="text-white font-semibold flex items-center gap-1.5 justify-end">
              {campaign.postNow ? <><Zap className="w-3.5 h-3.5 text-emerald-400" /> Post Now</> : `${campaign.schedules.filter(s => s.date).length || 0} scheduled slot(s)`}
            </span></p>
            {!campaign.postNow && repeat.enabled && (
              <p>Repeats: <span className="text-white font-semibold flex items-center gap-1.5 justify-end">
                <Repeat className="w-3.5 h-3.5 text-fuchsia-400" /> {occurrenceCount(repeat.cadence, repeat.months)} posts/account · auto-themed
              </span></p>
            )}
            {repurposedCount > 0 && (
              <p>Repurposed: <span className="text-white font-semibold flex items-center gap-1.5 justify-end">
                <Layers className="w-3.5 h-3.5 text-indigo-400" /> {repurposedCount} platform{repurposedCount !== 1 ? "s" : ""} customized
              </span></p>
            )}
          </div>
          <button onClick={publishCampaign} disabled={saving} className="w-full py-5 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-black text-xl hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" /> : "Deploy Campaign"}
          </button>
          {saving && publishStatus && <p className="text-xs text-neutral-400 mt-3">{publishStatus}</p>}
        </div>
      )}
    </div>
  );
}
