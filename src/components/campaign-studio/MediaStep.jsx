import { useState } from "react";
import {
  Upload, Image as ImageIcon, Video, Music, Mic, Captions, X,
  Loader2, AlertTriangle, Library, Eye, Download, Save, CheckCircle2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AssetPickerModal from "./AssetPickerModal";
import ClipTimeline from "./ClipTimeline";

const MUSIC_STYLES = ["Corporate Tech", "Upbeat Pop", "Cinematic", "Lo-Fi Chill", "Trending TikTok"];
const SUBTITLE_PRESETS = [
  { id: "bottom", label: "Dynamic Bottom (Bold)" },
  { id: "center", label: "Centered Headline" },
  { id: "none", label: "No Captions" },
];

const inp = "w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-fuchsia-500/70 transition-all";
const lbl = "block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-2";

const isImageUrl = (u = "") => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || u.startsWith("blob:") || u.startsWith("data:image");

export default function MediaStep({
  campaign, setCampaign, mediaRef, musicRef, uploadMedia, genImage, uploadMusic,
  compileVideo, generatingMedia, uploadingMusic, videoProgress, imageCount,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [savedAssets, setSavedAssets] = useState({});

  const images = campaign.media_urls.filter(isImageUrl);

  // Map an index into `images` (the image-only subset) back to its real
  // index in `campaign.media_urls`, so reorder/remove keep videos in place.
  const imageIndices = campaign.media_urls.map((u, i) => (isImageUrl(u) ? i : -1)).filter(i => i !== -1);

  const moveClip = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= images.length) return;
    const from = imageIndices[fromIdx];
    const to = imageIndices[toIdx];
    const nextUrls = [...campaign.media_urls];
    const [moved] = nextUrls.splice(from, 1);
    nextUrls.splice(to, 0, moved);
    let nextDur = campaign.clip_durations || [];
    if (nextDur.length === images.length) {
      nextDur = [...nextDur];
      const [d] = nextDur.splice(fromIdx, 1);
      nextDur.splice(toIdx, 0, d);
    }
    setCampaign(p => ({ ...p, media_urls: nextUrls, clip_durations: nextDur }));
  };

  const removeClip = (idx) => {
    const actual = imageIndices[idx];
    const nextUrls = campaign.media_urls.filter((_, i) => i !== actual);
    let nextDur = campaign.clip_durations || [];
    if (nextDur.length === images.length) nextDur = nextDur.filter((_, i) => i !== idx);
    setCampaign(p => ({ ...p, media_urls: nextUrls, clip_durations: nextDur }));
  };

  const saveAsset = async (url, i) => {
    try {
      await base44.entities.ContentAsset.create({
        type: isImageUrl(url) ? "image" : "video",
        title: `${campaign.campaign_name || "Studio asset"} ${i + 1}`,
        file_url: url,
        ai_generated: true,
      });
      setSavedAssets(p => ({ ...p, [url]: true }));
    } catch (_e) {
      // best-effort; saving is non-critical
    }
  };

  const handleLibrarySelect = (assets) => {
    const urls = assets.map(a => a.file_url).filter(Boolean);
    if (urls.length) setCampaign(p => ({ ...p, media_urls: [...p.media_urls, ...urls] }));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid md:grid-cols-3 gap-6">

        {/* Generator Actions */}
        <div className="space-y-4">
          <button onClick={() => mediaRef.current?.click()} className="w-full p-6 border-2 border-dashed border-neutral-700 rounded-2xl bg-neutral-900/50 hover:border-fuchsia-500/50 transition-all flex flex-col items-center">
            <Upload className="w-6 h-6 text-neutral-400 mb-2" /> <span className="font-bold text-white text-sm">Upload Files</span>
          </button>
          <input ref={mediaRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => uploadMedia(e.target.files)} />

          <button onClick={genImage} disabled={generatingMedia} className="w-full p-6 border border-neutral-700 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 hover:border-fuchsia-500/50 transition-all flex flex-col items-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-fuchsia-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            {generatingMedia ? <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500 mb-2" /> : <ImageIcon className="w-6 h-6 text-fuchsia-400 mb-2" />}
            <span className="font-bold text-white text-sm">Generate AI Image</span>
          </button>

          <button onClick={() => setShowPicker(true)} className="w-full p-6 border border-neutral-700 rounded-2xl bg-neutral-900/50 hover:border-fuchsia-500/50 transition-all flex flex-col items-center">
            <Library className="w-6 h-6 text-fuchsia-400 mb-2" /> <span className="font-bold text-white text-sm">Browse Library</span>
          </button>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              <strong>Tip:</strong> AI image models struggle with rendering text. Generate clean base imagery here and add text overlays during video compile.
            </p>
          </div>
        </div>

        {/* Video Generation Tool */}
        <div className="md:col-span-2 bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl flex flex-col">
          <h3 className="font-bold text-white text-lg mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-indigo-400" /> AI Video Generator</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className={lbl}><Music className="w-3.5 h-3.5" /> Background Music</label>
              <select value={campaign.video_settings.music} onChange={e => setCampaign(p => ({ ...p, video_settings: { ...p.video_settings, music: e.target.value } }))} className={inp}>
                {MUSIC_STYLES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}><Mic className="w-3.5 h-3.5" /> Voiceover Style</label>
              <select value={campaign.video_settings.voice} onChange={e => setCampaign(p => ({ ...p, video_settings: { ...p.video_settings, voice: e.target.value } }))} className={inp}>
                <option>AI Female (Natural)</option><option>AI Male (Deep)</option><option>Energetic Promo</option><option>No Voiceover</option>
              </select>
            </div>
            <div>
              <label className={lbl}><Captions className="w-3.5 h-3.5" /> Caption Style</label>
              <select value={campaign.video_settings.subtitleStyle} onChange={e => setCampaign(p => ({ ...p, video_settings: { ...p.video_settings, subtitleStyle: e.target.value } }))} className={inp}>
                {SUBTITLE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Real background music source — the dropdown above is just a style hint for AI, it has no audio behind it yet */}
          <div className="mb-6">
            <label className={lbl}><Music className="w-3.5 h-3.5" /> Background Music Track</label>
            {campaign.video_settings.musicUrl ? (
              <div className="flex items-center justify-between gap-2 bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white">
                <span className="truncate">🎵 {campaign.video_settings.musicName || "Custom track uploaded"}</span>
                <button onClick={() => setCampaign(p => ({ ...p, video_settings: { ...p.video_settings, musicUrl: "", musicName: "" } }))} className="text-neutral-400 hover:text-red-400 shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => musicRef.current?.click()} disabled={uploadingMusic} className={`${inp} flex items-center justify-center gap-2 cursor-pointer hover:border-fuchsia-500/50`}>
                {uploadingMusic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingMusic ? "Uploading..." : "Upload an audio track (mp3/wav)"}
              </button>
            )}
            <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={e => uploadMusic(e.target.files?.[0])} />
            <p className="text-[11px] text-neutral-500 mt-1.5">The style dropdown above is just a label for your own notes — there's no audio behind it. Upload a track here for real background music; it'll be mixed under the voiceover.</p>
          </div>

          <p className="text-xs text-neutral-500 mb-4">Compiles your {imageCount} image{imageCount !== 1 ? "s" : ""} into a captioned vertical video. Captions are pulled from your generated copy.</p>
          {generatingMedia && videoProgress > 0 && (
            <div className="mb-4">
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all" style={{ width: `${videoProgress * 100}%` }} />
              </div>
              <p className="text-xs text-neutral-400 mt-1">Rendering… {Math.round(videoProgress * 100)}%</p>
            </div>
          )}
          <button onClick={compileVideo} disabled={generatingMedia || imageCount === 0} className="mt-auto w-full py-3 bg-indigo-600/20 border border-indigo-500/50 text-indigo-300 rounded-xl font-bold hover:bg-indigo-600/40 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
            {generatingMedia ? <Loader2 className="animate-spin" /> : <Video className="w-4 h-4" />} Compile AI Video
          </button>
          {imageCount === 0 && !generatingMedia && (
            <p className="text-[11px] text-amber-400/80 mt-2 text-center">Generate, upload or browse the library for at least one image to enable video compiling.</p>
          )}
        </div>
      </div>

      {/* Per-clip duration editor */}
      <ClipTimeline images={images} durations={campaign.clip_durations} onChange={next => setCampaign(p => ({ ...p, clip_durations: next }))}
        onMove={moveClip} onRemove={removeClip} />

      {/* Assembled video preview */}
      {campaign.video_url && (
        <div className="pt-6 border-t border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white">Compiled Video</h3>
            <a href={campaign.video_url} download={`${(campaign.campaign_name || "campaign").replace(/\s+/g, "_")}.webm`} className="text-xs text-fuchsia-400 hover:underline">Download .webm</a>
          </div>
          <video src={campaign.video_url} controls loop className="max-h-80 rounded-2xl border border-neutral-800 bg-black" />
        </div>
      )}

      {/* Visual Gallery */}
      {campaign.media_urls.length > 0 && (
        <div className="pt-6 border-t border-neutral-800">
          <h3 className="font-bold text-white mb-4">Generated & Uploaded Assets</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            {campaign.media_urls.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-neutral-800 group bg-black">
                {isImageUrl(url) ? (
                  <img src={url} className="w-full h-full object-cover" alt="Asset" />
                ) : (
                  <video src={url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted loop />
                )}
                <button onClick={() => setCampaign(p => ({ ...p, media_urls: p.media_urls.filter((_, j) => j !== i) }))} className="absolute top-2 right-2 bg-black/70 backdrop-blur-md rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4 text-white" /></button>
                {!isImageUrl(url) && <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-bold text-white">VIDEO</div>}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1.5 p-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={url} target="_blank" rel="noopener noreferrer" title="View"
                    className="bg-black/60 backdrop-blur-md rounded-full p-1.5 hover:bg-black/90"><Eye className="w-3.5 h-3.5 text-white" /></a>
                  <a href={url} download target="_blank" rel="noopener noreferrer" title="Download"
                    className="bg-black/60 backdrop-blur-md rounded-full p-1.5 hover:bg-black/90"><Download className="w-3.5 h-3.5 text-white" /></a>
                  <button onClick={() => saveAsset(url, i)} title="Save to Library"
                    className="bg-black/60 backdrop-blur-md rounded-full p-1.5 hover:bg-black/90">
                    {savedAssets[url] ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AssetPickerModal open={showPicker} onClose={() => setShowPicker(false)} types={["image", "video"]} multiple title="Browse Media Library" onSelect={handleLibrarySelect} />
    </div>
  );
}
