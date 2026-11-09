import { Eye, Hash, Calendar, Zap, Image as ImageIcon, AlertTriangle, Repeat, Layers } from "lucide-react";
import { PLATFORM_META } from "./platformMeta";
import { occurrenceCount } from "@/utils/recurrence";

const isImageUrl = (u = "") => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || u.startsWith("blob:") || u.startsWith("data:image");

export default function PreviewStep({ campaign, brandAccounts, imageCount }) {
  const accounts = brandAccounts.filter(a => campaign.selected_accounts.includes(a.id));
  const hashtags = campaign.outputs?.hashtag_set || "";
  const hasContent = campaign.ai_output || campaign.video_url || campaign.media_urls.length > 0;
  const scheduledSlots = campaign.schedules.filter(s => s.date);
  const overriddenPlatforms = Object.entries(campaign.platform_overrides || {}).filter(([, o]) => o?.media_url || o?.hashtags || o?.description || o?.thumbnail);
  const repeat = campaign.repeat || {};

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><Eye className="w-5 h-5 text-fuchsia-400" /> Preview & Review</h2>

      {!hasContent && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          Go back to <strong>Copy &amp; Scripts</strong> or <strong>Media &amp; Clips</strong> to generate something to post before launching.
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 max-w-2xl">
        <div className="flex items-start gap-3">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 pt-1">Accounts</span>
          <div className="flex gap-1.5 flex-wrap">
            {accounts.length === 0 && <span className="text-sm text-neutral-500 italic">None selected — will be saved as a draft</span>}
            {accounts.map(a => {
              const meta = PLATFORM_META[a.platform] || { label: a.platform, bg: "bg-neutral-800 border-neutral-700 text-neutral-300" };
              return <span key={a.id} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.bg}`}>{meta.label} · {a.account_name}</span>;
            })}
          </div>
        </div>

        {(campaign.video_url || campaign.media_urls.length > 0) && (
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 pt-1">Media</span>
            {campaign.video_url ? (
              <video src={campaign.video_url} controls className="max-h-64 rounded-xl border border-neutral-800 bg-black" />
            ) : (
              <div className="flex gap-2 flex-wrap">
                {campaign.media_urls.slice(0, 4).map((url, i) => (
                  isImageUrl(url)
                    ? <img key={i} src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-neutral-800" />
                    : <div key={i} className="w-20 h-20 flex items-center justify-center rounded-lg border border-neutral-800 bg-black text-neutral-500"><ImageIcon className="w-5 h-5" /></div>
                ))}
                {imageCount > 4 && <span className="text-xs text-neutral-500 self-center">+{imageCount - 4} more</span>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-3">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 pt-1">Caption</span>
          <p className="text-sm text-neutral-200 whitespace-pre-wrap line-clamp-6">{campaign.ai_output || <span className="text-neutral-500 italic">No copy generated yet</span>}</p>
        </div>

        {hashtags && (
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 pt-1 flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Hashtags</span>
            <p className="text-sm text-fuchsia-400 line-clamp-2">{hashtags}</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-neutral-800">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Schedule</span>
          <span className="text-sm text-white flex items-center gap-1.5">
            {campaign.postNow
              ? <><Zap className="w-4 h-4 text-emerald-400" /> Post Immediately on Launch</>
              : scheduledSlots.length
                ? `${scheduledSlots.length} scheduled slot${scheduledSlots.length !== 1 ? "s" : ""}`
                : "Save as draft"}
          </span>
        </div>

        {!campaign.postNow && repeat.enabled && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> Repeats</span>
            <span className="text-sm text-fuchsia-300">
              {occurrenceCount(repeat.cadence, repeat.months)} posts · {repeat.cadence === "weekly" ? "weekly" : repeat.cadence === "biweekly" ? "every 2 weeks" : "monthly"} for {repeat.months} months · each with fresh, auto-themed copy
            </span>
          </div>
        )}

        {overriddenPlatforms.length > 0 && (
          <div className="flex items-start gap-3 pt-2 border-t border-neutral-800">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider w-28 pt-1 flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Repurposed</span>
            <div className="flex gap-1.5 flex-wrap">
              {overriddenPlatforms.map(([platform]) => {
                const meta = PLATFORM_META[platform] || { label: platform, bg: "bg-neutral-800 border-neutral-700 text-neutral-300" };
                return <span key={platform} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.bg}`}>{meta.label}</span>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
