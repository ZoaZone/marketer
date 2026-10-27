import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Wand2, Loader2, Download, Save, CheckCircle2, AlertTriangle, Clapperboard, Zap, SlidersHorizontal, Sliders } from "lucide-react";
import { VIDEO_RATIOS } from "@/utils/videoAssembler";
import { uploadFile } from "@/utils/lane1";
import { MUSIC_PRESETS, defaultPresetFor } from "@/components/quick-create/musicPresets";
import useAutoVideo from "@/components/quick-create/useAutoVideo";

const btn = (on) => `px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${on ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`;

export default function AutoVideoCreator({ prompt, referenceImageUrls, canMotion, canMusic, onBusyChange, onAdvanced }) {
  const isPro = canMusic;
  const [quality, setQuality] = useState("standard");
  const [ratio, setRatio] = useState(VIDEO_RATIOS[0]);
  const cinematic = quality === "cinematic";
  const [resolution, setResolution] = useState("1080p");
  // Every video gets a background track by default: a library style, which is always available.
  const [musicMode, setMusicMode] = useState("preset");
  const [pickedPreset, setPickedPreset] = useState("");
  const musicPreset = pickedPreset || defaultPresetFor(cinematic);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [musicError, setMusicError] = useState("");
  const v = useAutoVideo({ cinematic, canMotion, canMusic, ratio, resolution, referenceImageUrls, musicMode, uploadedMusicUrl: musicUrl, musicPreset });

  const uploadMusic = async (file) => {
    if (!file) return;
    setUploading(true); setMusicError("");
    try {
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed.");
      setMusicUrl(url); setMusicName(file.name); setMusicMode("upload");
    } catch (e) { setMusicError(e?.message || "Music upload failed."); }
    setUploading(false);
  };

  useEffect(() => { onBusyChange(v.busy); return () => onBusyChange(false); }, [v.busy, onBusyChange]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Quality</label>
          <div className="grid sm:grid-cols-2 gap-2">
            <button type="button" disabled={v.busy} onClick={() => setQuality("standard")} aria-pressed={!cinematic}
              className={`text-left p-3 rounded-lg border transition-all ${!cinematic ? "bg-fuchsia-500/15 border-fuchsia-500/50" : "border-border hover:bg-muted/20"}`}>
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Zap className="w-3.5 h-3.5" /> Quick</span>
              <span className="block text-[11px] text-muted-foreground mt-1">3 regular moving clips with a voice-over, made with AI credits.</span>
            </button>
            <button type="button" disabled={v.busy || !isPro} onClick={() => setQuality("cinematic")} aria-pressed={cinematic}
              className={`text-left p-3 rounded-lg border transition-all disabled:opacity-60 ${cinematic ? "bg-fuchsia-500/15 border-fuchsia-500/50" : "border-border hover:bg-muted/20"}`}>
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Clapperboard className="w-3.5 h-3.5" /> Cinematic (Pro)</span>
              <span className="block text-[11px] text-muted-foreground mt-1">5 scenes filmed as real moving clips, one film look, voice-over, original score, 1080p. Takes 10-20 minutes.</span>
            </button>
          </div>
          {!isPro && <p className="text-[11px] text-muted-foreground mt-2"><Link to="/pricing" className="text-fuchsia-400 font-semibold hover:underline">Upgrade</Link> to unlock Cinematic videos.</p>}
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Format</label>
          <div className="flex gap-2 flex-wrap">
            {VIDEO_RATIOS.map(r => <button key={r} type="button" disabled={v.busy} onClick={() => setRatio(r)} className={btn(ratio === r)}>{r}</button>)}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Quality / size</label>
          <div className="flex gap-2 flex-wrap">
            {[["720p", "HD 720p"], ["1080p", "Full HD 1080p"]].map(([r, l]) => <button key={r} type="button" disabled={v.busy} onClick={() => setResolution(r)} className={btn(resolution === r)}>{l}</button>)}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Background music</label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={v.busy} onClick={() => setMusicMode("none")} className={btn(musicMode === "none")}>No music</button>
            <button type="button" disabled={v.busy} onClick={() => setMusicMode("preset")} className={btn(musicMode === "preset")}>Library track</button>
            <button type="button" disabled={v.busy || !canMusic} onClick={() => setMusicMode("ai")} className={btn(musicMode === "ai")}>AI-composed score</button>
            <button type="button" disabled={v.busy || !musicUrl} onClick={() => setMusicMode("upload")} className={btn(musicMode === "upload")}>My track{musicName ? `: ${musicName.slice(0, 18)}` : ""}</button>
            <label className={`${btn(false)} cursor-pointer ${v.busy || uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? "Uploading…" : "Upload a track"}
              <input type="file" accept="audio/*" className="hidden" onChange={e => { uploadMusic(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {musicMode === "preset" && <div className="flex gap-2 flex-wrap mt-2">
            {MUSIC_PRESETS.map(p => <button key={p.id} type="button" disabled={v.busy} onClick={() => setPickedPreset(p.id)} title={p.hint} className={btn(musicPreset === p.id)}>{p.label}</button>)}
          </div>}
          {musicMode === "preset" && <p className="text-[11px] text-muted-foreground mt-1">{MUSIC_PRESETS.find(p => p.id === musicPreset)?.hint}. Added automatically to your video.</p>}
          {!canMusic && <p className="text-[11px] text-muted-foreground mt-2">AI-composed music is on Pro plans. You can upload your own track on any plan.</p>}
          {musicError && <p className="text-[11px] text-red-400 mt-2">{musicError}</p>}
          {musicMode === "upload" && musicUrl && <audio src={musicUrl} controls className="w-full mt-2 h-8" />}
          <p className="text-[11px] text-muted-foreground mt-2">Music plays under the voice-over at a lower volume. Works for Quick and Cinematic motion videos.</p>
        </div>
        <button onClick={() => v.run(prompt)} disabled={v.busy || !prompt.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 shadow-lg">
          {v.busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {v.stage || "Working"}…</> : <><Wand2 className="w-4 h-4" /> Create my video</>}
        </button>
        {!prompt.trim() && !v.busy && <p className="text-[11px] text-muted-foreground">Describe your video above to get started.</p>}
        {v.busy && (
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(v.progress * 100)}%` }} />
          </div>
        )}
        <button type="button" onClick={onAdvanced} disabled={v.busy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced: edit script, scenes and audio step by step
        </button>
      </div>

      {v.error && <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {v.error}</div>}
      {v.warnings.length > 0 && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">{v.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}

      {v.result && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <video src={v.result} controls loop className="w-full rounded-xl border border-border bg-black" />
          <div className="flex gap-2">
            <a href={v.result} download target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20"><Download className="w-4 h-4" /> Download</a>
            <button onClick={() => v.save(prompt)} disabled={v.saved} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold disabled:opacity-60">
              {v.saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}
            </button>
          </div>
          <Link to="/media-editor" state={{ assets: [{ type: "video", file_url: v.result, title: (prompt || "Auto video").slice(0, 40) }] }} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-foreground hover:bg-muted/20"><Sliders className="w-4 h-4" /> Fix text, logos &amp; more in Edit Media</Link>
        </div>
      )}
    </div>
  );
}