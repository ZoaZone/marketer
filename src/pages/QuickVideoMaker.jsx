import { useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { generateText, generateSceneVideo } from "@/utils/lane2";
import VideoFeedbackPanel from "@/components/video-feedback/VideoFeedbackPanel";
import BrandKitPanel from "@/components/brand-kit/BrandKitPanel";
import useBrandKit from "@/components/brand-kit/useBrandKit";
import VideoAudioSection from "@/components/quick-video/VideoAudioSection";
import {
  Zap, Loader2, Download, Copy, CheckCircle2, Save, Sparkles,
  AlertTriangle, ArrowRight, Film, Clapperboard,
} from "lucide-react";

/**
 * Quick Video Maker
 * ──────────────────
 * PURPOSE: a single-prompt, flexible-length AI video generator — the
 * direct successor to the old Media Studio "AI Video" tool (type a topic,
 * pick duration/aspect, get a clip). No script step, no storyboard, no
 * scene editor, no forced genre. It builds longer videos the same way the
 * old tool did past its single-clip limit: chaining several clips with a
 * "continue the same shot" prompt hint, rather than funnelling everyone
 * through a multi-step production wizard.
 *
 * WHO IT'S FOR: solo creators, SMBs and influencers who want one quick,
 * generic marketing/social clip fast, and don't need Quick Create's
 * script→storyboard→dialogue→music→export pipeline or Movie Maker Pro's
 * scene-by-scene film production (reference locking, per-scene timeline,
 * dubbing, lip-sync). Use THIS when the ask is "just make me a 10-second
 * clip about X". Use Quick Create when you want a narrated/dialogue short
 * with edited scenes. Use Movie Maker Pro for a multi-scene film.
 *
 * ACCESS / SUBSCRIPTION GATE: deliberately NOT tier-gated on this page.
 * base44/functions/submitVideo already tries Base44-native video for
 * EVERY account first — free trial included, metered only in AI credits —
 * and falls back to the paid Kling path only if that fails, and that
 * fallback stays correctly gated at Agency+ tier server-side
 * (GENERATION_ENTITLED_TIERS in submitVideo/entry.ts) with no changes
 * needed here. Gating this page on top of that would just reintroduce the
 * exact mismatch it exists to fix: an account the backend is willing to
 * serve, blocked at the UI before it even tries. That's also why this is
 * a NEW page rather than a change to Quick Create or Movie Maker — their
 * own tiering (Quick Create's Agency+ "Cinematic (Pro)"/AI-music gate,
 * Movie Maker's Lane-2 tier-4 gate) is intentional for what THEY do and is
 * left exactly as is.
 */

const PLATFORMS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "Twitter/X", "WhatsApp", "General"];
const TONES = ["Professional", "Casual", "Exciting", "Friendly", "Luxury", "Humorous", "Inspirational"];
const ASPECTS = [
  { label: "Reel / TikTok / Short (9:16)", value: "9:16" },
  { label: "YouTube / Landscape (16:9)", value: "16:9" },
];

// The backend (Base44's own video model, and the Kling fallback on the
// render worker) only accepts 5s or 10s clips — see VALID_CLIP_DURATIONS in
// base44/functions/submitVideo/entry.ts and MovieMaker.jsx. That is a shared
// limit, not something this page imposes. Anything past one clip is built
// the same way the old Media Studio tool built anything past ~8 seconds:
// generate several clips in sequence with a "this continues the same shot"
// hint in the prompt.
const DURATIONS = [
  { label: "5 seconds", clips: [5] },
  { label: "10 seconds", clips: [10] },
  { label: "20 seconds (2 clips)", clips: [10, 10] },
  { label: "30 seconds (3 clips)", clips: [10, 10, 10] },
  { label: "40 seconds (4 clips)", clips: [10, 10, 10, 10] },
];

// Ported verbatim from the old Media Studio AI Video generator.
// Vertex/Replicate video models flag personal names, relationship terms
// and some celebration contexts — this rewrites them into safe,
// intent-preserving equivalents instead of letting the whole job fail.
function sanitizeVideoPrompt(rawPrompt) {
  let p = rawPrompt;
  const relationshipMap = {
    "\\bwife\\b": "person", "\\bhusband\\b": "person",
    "\\bgirlfriend\\b": "person", "\\bboyfriend\\b": "person",
    "\\bfiance\\b": "person", "\\bfiancee\\b": "person",
    "\\bspouse\\b": "person", "\\bpartner\\b": "individual",
  };
  Object.entries(relationshipMap).forEach(([pattern, replacement]) => {
    p = p.replace(new RegExp(pattern, "gi"), replacement);
  });
  // Strip personal names (two capitalised words in a row) to "a person".
  p = p.replace(/(?<![.!?]\s)\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, "a person");
  p = p.replace(/celebrating\s+\w+'s\s+birthday/gi, "celebrating a birthday");
  p = p.replace(/\w+'s\s+birthday/gi, "a birthday celebration");
  p = p.replace(/five[- ]star hotel/gi, "luxury hotel");
  p = p.replace(/grand background/gi, "elegant backdrop");
  p = p.replace(/I have attached[^.]+\.?/gi, "");
  p = p.replace(/as attachment[^.]*\.?/gi, "");
  p = p.replace(/reference photo[^.]*\.?/gi, "");
  p = p.replace(/the photo[^.]*\.?/gi, "");
  p = p.replace(/\s{2,}/g, " ").trim();
  return p;
}

export default function QuickVideoMaker() {
  useOutletContext(); // user/tier available if a future tweak needs them; intentionally unused for gating — see header note.
  const qc = useQueryClient();

  const [form, setForm] = useState({
    prompt: "", platform: "Instagram", tone: "Professional", style: "",
    aspect: "9:16", durationIdx: 1, audioNote: "",
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { index, total, status }
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mixed, setMixed] = useState(null); // { url, voiceUrl, musicUrl } once voice/music is mixed in
  const kit = useBrandKit();

  const duration = DURATIONS[form.durationIdx];

  const formState = form;
  const generate = async (override) => {
    const form = override?.form || formState;
    if (!form.prompt.trim()) { setError("Describe the video you want."); return; }
    setError(""); setResult(null); setMixed(null); setLoading(true); setProgress(null);
    try {
      const clipSpecs = duration.clips;
      const safePrompt = sanitizeVideoPrompt(form.prompt.trim());
      const styleHint = form.style.trim() || "Clean, natural, professional marketing footage.";
      const audioHint = form.audioNote.trim() ? ` Audio direction: ${form.audioNote.trim()}.` : "";

      const clipUrls = [];
      for (let i = 0; i < clipSpecs.length; i++) {
        const sceneHint = clipSpecs.length > 1
          ? ` This is clip ${i + 1} of ${clipSpecs.length} — seamlessly continue the same shot and subject, do not restart the scene.`
          : "";
        const videoPrompt = `${safePrompt}. Platform: ${form.platform}. Tone: ${form.tone}. ${styleHint} ${kit.look}${kit.voice ? ` Mood: ${kit.voice}.` : ""}${sceneHint}${audioHint}`;
        setProgress({ index: i + 1, total: clipSpecs.length, status: "starting" });
        const url = await generateSceneVideo({
          prompt: videoPrompt,
          durationSeconds: clipSpecs[i],
          imageUrl: i === 0 ? kit.imageRefs[0] : undefined,
          aspectRatio: form.aspect,
          onProgress: ({ status }) => setProgress({ index: i + 1, total: clipSpecs.length, status }),
        });
        if (url) clipUrls.push(url);
      }
      if (!clipUrls.length) throw new Error("No video was produced. Please try again.");

      const totalSeconds = clipSpecs.reduce((a, b) => a + b, 0);
      let captions = override?.captions || "";
      if (!captions) try {
        captions = await generateText({
          type: "caption",
          platform: form.platform, tone: form.tone,
          prompt: `Generate short punchy captions/subtitles for a ${totalSeconds}-second video about: "${form.prompt}". Platform: ${form.platform}. Format as timestamped lines:\n[0:00] caption text\n[0:02] next caption\n...`,
        });
      } catch { /* captions are a bonus, not fatal */ }

      setResult({ url: clipUrls[0], clipUrls, captions: typeof captions === "string" ? captions : "" });
    } catch (e) {
      setError(e?.billing
        ? `${e.message} Real AI video resumes once the provider account is funded.`
        : (e?.upgradeRequired
          ? `${e.message} (This only affects the Kling fallback — Base44's own video generation should still work on your plan; please try again.)`
          : (e?.message || "Video generation failed.")));
    }
    setLoading(false);
    setProgress(null);
  };

  const applyFeedback = (imp) => {
    const next = { ...formState, prompt: imp.prompt, audioNote: imp.references ? `${formState.audioNote ? formState.audioNote + ". " : ""}${imp.references}` : formState.audioNote };
    setForm(next);
    generate({ form: next, captions: imp.captions !== result?.captions ? imp.captions : "" });
  };

  const copyCaptions = async () => {
    if (!result?.captions) return;
    await navigator.clipboard.writeText(result.captions);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    if (!result?.url) return;
    await base44.entities.ContentAsset.create({
      type: "video",
      title: form.prompt.slice(0, 60),
      content: result.captions || "",
      file_url: mixed?.url || result.url,
      voiceover_url: mixed?.voiceUrl || undefined,
      music_url: mixed?.musicUrl || undefined,
      platform: form.platform,
      ai_generated: true,
      prompt_used: form.prompt,
      status: "ready",
    });
    qc.invalidateQueries(["media_library"]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shrink-0">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-foreground">Quick Video Maker</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            One prompt → a real AI video clip, up to 40 seconds. No script step, no storyboard, no forced style.
          </p>
        </div>
      </div>

      {/* Purpose / routing note */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl bg-card border border-border text-xs text-muted-foreground">
        <p className="flex-1">
          Want narrated scenes with dialogue and edited mux? Try{" "}
          <Link to="/quick-create" className="text-fuchsia-400 hover:underline inline-flex items-center gap-0.5">
            Quick Create <ArrowRight className="w-3 h-3" />
          </Link>. Want a full multi-scene film with reference locking, music and dubbing? Try{" "}
          <Link to="/movie-maker" className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">
            Movie Maker Pro <ArrowRight className="w-3 h-3" />
          </Link>.
        </p>
      </div>

      {/* Form */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">What's the video about?</label>
          <textarea
            value={form.prompt}
            onChange={e => setForm(p => ({ ...p, prompt: e.target.value }))}
            placeholder="e.g. A barista pouring latte art in a cozy cafe, morning light"
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Platform</label>
            <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm">
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tone</label>
            <select value={form.tone} onChange={e => setForm(p => ({ ...p, tone: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm">
              {TONES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Format</label>
            <select value={form.aspect} onChange={e => setForm(p => ({ ...p, aspect: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm">
              {ASPECTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Duration</label>
            <select value={form.durationIdx} onChange={e => setForm(p => ({ ...p, durationIdx: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm">
              {DURATIONS.map((d, i) => <option key={d.label} value={i}>{d.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Style notes <span className="text-muted-foreground/50">(optional — leave blank for clean, natural footage; only mention "cinematic" if you actually want that look)</span>
          </label>
          <input
            value={form.style}
            onChange={e => setForm(p => ({ ...p, style: e.target.value }))}
            placeholder="e.g. bright and upbeat, handheld feel"
            className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Audio direction <span className="text-muted-foreground/50">(optional)</span></label>
          <input
            value={form.audioNote}
            onChange={e => setForm(p => ({ ...p, audioNote: e.target.value }))}
            placeholder="e.g. light cafe ambience, no dialogue"
            className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
        </div>

        <BrandKitPanel kit={kit} disabled={loading} />

        <button onClick={() => generate()} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading
            ? (progress ? `Generating clip ${progress.index}/${progress.total} — ${progress.status}…` : "Generating…")
            : "Generate Video"}
        </button>
        <p className="text-[11px] text-muted-foreground text-center">
          Uses your plan's AI credits (or free-trial credits) — about 6 credits per 5 seconds. Available on every plan, including the free trial.
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Result */}
      {result?.url && (
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <video key={mixed?.url || result.url} src={mixed?.url || result.url} controls className="w-full rounded-xl bg-black max-h-[480px]" />
          {mixed && <p className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Preview includes your voice-over and music. This is what will be saved.</p>}
          {!mixed && result.clipUrls.length > 1 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5" /> {result.clipUrls.length} clips generated and chained — showing clip 1. Each clip is also downloadable individually.
            </p>
          )}
          <VideoAudioSection clipUrls={result.clipUrls} clipSeconds={duration.clips} aspect={form.aspect} topic={form.prompt}
            voiceStyle={kit.voice || form.tone} disabled={loading} onMixed={setMixed} />
          {!mixed && result.clipUrls.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {result.clipUrls.map((url, i) => (
                <a key={url} href={url} download={`clip-${i + 1}.mp4`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/20">
                  <Download className="w-3 h-3" /> Clip {i + 1}
                </a>
              ))}
            </div>
          )}
          {result.captions && (
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                Captions
                <button onClick={copyCaptions} className="flex items-center gap-1 text-fuchsia-400 hover:underline">
                  {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
                </button>
              </label>
              <pre className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-xs whitespace-pre-wrap">{result.captions}</pre>
            </div>
          )}
          <VideoFeedbackPanel prompt={form.prompt} captions={result.captions} applyLabel="Apply & regenerate video" disabled={loading} onApply={applyFeedback} />
          <div className="flex gap-2">
            <a href={mixed?.url || result.url} download="quick-video.mp4" target="_blank" rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted/20">
              <Download className="w-4 h-4" /> Download
            </a>
            <button onClick={save} disabled={saved}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 text-fuchsia-400 text-sm font-medium hover:bg-fuchsia-500/25">
              {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />} {saved ? "Saved" : "Save to Library"}
            </button>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="flex flex-col items-center py-10 text-center text-muted-foreground/60">
          <Clapperboard className="w-8 h-8 mb-2" />
          <p className="text-sm">Your generated clip will appear here.</p>
        </div>
      )}
    </div>
  );
}