import { Layers, Wand2, Loader2, Hash, MessageSquare, Image as ImageIcon, RefreshCw, Check } from "lucide-react";
import { PLATFORM_META, PLATFORM_RATIOS } from "./platformMeta";
import { VIDEO_RATIOS } from "@/utils/videoAssembler";

const SCHEDULABLE_PLATFORMS = new Set(["instagram", "facebook", "tiktok", "linkedin", "youtube", "twitter_x", "pinterest"]);
const isAccountConnected = (a) => a?.status === "active" || a?.status === "connected";
const isImageUrl = (u = "") => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || u.startsWith("blob:") || u.startsWith("data:image");

export default function RepurposeStep({ campaign, setCampaign, brandAccounts, repurposeVideo, generatePlatformCopy, repurposing, generatingCopyFor }) {
  const platforms = [...new Set(
    brandAccounts
      .filter(a => campaign.selected_accounts.includes(a.id) && isAccountConnected(a) && SCHEDULABLE_PLATFORMS.has(a.platform))
      .map(a => a.platform)
  )];

  const images = campaign.media_urls.filter(isImageUrl);

  const setOverride = (platform, patch) => setCampaign(p => ({
    ...p,
    platform_overrides: { ...p.platform_overrides, [platform]: { ...(p.platform_overrides?.[platform] || {}), ...patch } },
  }));

  if (!platforms.length) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-5 h-5 text-fuchsia-400" /> Repurpose for Platforms</h2>
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
          Go back to <strong>Accounts</strong> and select at least one connected social account to generate platform-specific versions.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-5 h-5 text-fuchsia-400" /> Repurpose for Platforms</h2>
        <p className="text-sm text-neutral-400 mt-1">Optional — resize your video, generate per-platform hashtags &amp; descriptions, and choose a thumbnail for each platform. Anything left blank falls back to your default copy and media.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {platforms.map(platform => {
          const meta = PLATFORM_META[platform] || { label: platform, bg: "bg-neutral-800 border-neutral-700 text-neutral-300" };
          const override = campaign.platform_overrides?.[platform] || {};
          const ratio = override.ratio || PLATFORM_RATIOS[platform] || "9:16";
          const busyVideo = !!repurposing?.[platform];
          const busyCopy = generatingCopyFor === platform;
          return (
            <div key={platform} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.bg}`}>{meta.label}</span>
                <select value={ratio} onChange={e => setOverride(platform, { ratio: e.target.value })} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white">
                  {VIDEO_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Resize video */}
              <div>
                <button onClick={() => repurposeVideo(platform, ratio)} disabled={busyVideo || !campaign.video_url}
                  className="w-full py-2.5 bg-indigo-600/20 border border-indigo-500/50 text-indigo-300 rounded-xl font-bold text-sm hover:bg-indigo-600/40 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                  {busyVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Resize Video for {ratio}
                </button>
                {!campaign.video_url && <p className="text-[11px] text-amber-400/80 mt-1.5">Compile a video in Media &amp; Clips to enable resizing.</p>}
                {override.media_url && (
                  <video src={override.media_url} controls loop className="mt-3 max-h-48 mx-auto rounded-xl border border-neutral-800 bg-black" />
                )}
              </div>

              {/* Hashtags + description — optional per-platform override of the Copy & Scripts defaults */}
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-500">Optional — leave blank to use your global Hashtags &amp; Caption from Copy &amp; Scripts for this platform.</p>
                <button onClick={() => generatePlatformCopy(platform)} disabled={busyCopy}
                  className="w-full py-2.5 bg-fuchsia-600/20 border border-fuchsia-500/50 text-fuchsia-300 rounded-xl font-bold text-sm hover:bg-fuchsia-600/40 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                  {busyCopy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate Hashtags &amp; Description for {meta.label}
                </button>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1"><Hash className="w-3 h-3" /> Hashtags Override</label>
                    {!!(campaign.outputs?.hashtag_set) && (
                      <button onClick={() => setOverride(platform, { hashtags: campaign.outputs.hashtag_set })} className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300">Use Global</button>
                    )}
                  </div>
                  <textarea value={override.hashtags || ""} onChange={e => setOverride(platform, { hashtags: e.target.value })} rows={2}
                    placeholder="Falls back to your global Hashtags from Copy & Scripts..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-fuchsia-300 placeholder:text-neutral-600 resize-none" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Description Override</label>
                    {!!campaign.ai_output && (
                      <button onClick={() => setOverride(platform, { description: campaign.ai_output })} className="text-[11px] font-bold text-fuchsia-400 hover:text-fuchsia-300">Use Global Caption</button>
                    )}
                  </div>
                  <textarea value={override.description || ""} onChange={e => setOverride(platform, { description: e.target.value })} rows={2}
                    placeholder="Platform-tailored description / auto-caption..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none" />
                </div>
              </div>

              {/* Thumbnail picker */}
              {images.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Thumbnail / Cover</label>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setOverride(platform, { thumbnail: "" })}
                      className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center text-[10px] font-bold ${!override.thumbnail ? "border-fuchsia-500 text-fuchsia-300" : "border-neutral-800 text-neutral-500"}`}>
                      Auto
                    </button>
                    {images.map((url, i) => (
                      <button key={i} onClick={() => setOverride(platform, { thumbnail: url })}
                        className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 ${override.thumbnail === url ? "border-fuchsia-500" : "border-neutral-800"}`}>
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {override.thumbnail === url && <div className="absolute inset-0 bg-fuchsia-500/30 flex items-center justify-center"><Check className="w-5 h-5 text-white" /></div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
