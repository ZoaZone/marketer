import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { generateText, generateImage, generateVoiceover, uploadFile, splitScriptIntoScenes, assembleLane1Video } from "@/utils/lane1";
// Tier-gated Lane 2 access — see the amended lane guard in eslint.config.js.
// Entitlement is enforced server-side in base44/functions/submitVideo (403);
// the client check below is UX, so an unentitled user gets an upgrade prompt
// instead of a failed request.
import { generateSceneVideo, submitRender, getRenderStatus } from "@/utils/lane2";
import { VIDEO_RATIOS } from "@/utils/videoAssembler";
import {
  Wand2, Image as ImageIcon, Video, Loader2, Download, Save, CheckCircle2,
  AlertTriangle, Mic, Sparkles, Paperclip, X, Music, VolumeX, ChevronRight,
  ChevronLeft, Check, Film, Lightbulb,
} from "lucide-react";

// Lane 1 (Business/Marketing) page — imports only from @/utils/lane1,
// never @/utils/lane2 or aiClient.js's paid-generation exports directly
// (enforced by eslint.config.js's lane guard). Short-video assembly
// happens server-side via lane1.js's assembleLane1Video (the shared
// FFmpeg-assembly worker route — 1080p, real H.264 with audio,
// loudnorm/contrast finishing pass), not the old client-side
// Canvas+MediaRecorder path (src/utils/videoAssembler.js's assembleVideo,
// still in the repo but no longer called here). Background music here is
// upload-only — Lane 1 doesn't have access to MusicGen (that's a paid
// Replicate call, Lane 2 only).
//
// The video path is a linear, gated stepper (Work Package G): each step's
// "Next" stays disabled until that step's own artifact exists (script
// written, storyboard images generated, audio resolved, video assembled).
// The image path stays a single quick action — the stepper only applies to
// video, which is the pipeline the mux/voiceover/publish steps describe.

const STEPS = [
  { id: "idea", label: "Prompt/Idea", icon: Lightbulb },
  { id: "script", label: "Script", icon: Wand2 },
  { id: "storyboard", label: "Storyboard/Images", icon: ImageIcon },
  { id: "video", label: "Short Video", icon: Film },
  { id: "voiceover", label: "Voiceover", icon: Mic },
  { id: "mux", label: "FFmpeg Mux", icon: Sparkles },
  { id: "export", label: "Publish/Export", icon: Download },
];

const AUDIO_MODES = [
  { id: "voiceover", label: "Voiceover", icon: Mic },
  { id: "music", label: "Music", icon: Music },
  { id: "silent", label: "Silent", icon: VolumeX },
];

// Pixel-dimension hints passed to the image generator per aspect ratio.
const RATIO_DIMENSIONS = { "1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792", "4:5": "1024x1280" };

// Tier at which real generative video unlocks. Mirrors AppLayout's TIER_MAP
// (3 = agency, 4 = any Lane 2 tier or BYOK) and must stay in step with
// GENERATION_ENTITLED_TIERS in base44/functions/submitVideo/entry.ts, which is
// the check that actually enforces it.
const MOTION_MIN_TIER = 3;

// Per-scene clip length for real video. Kling bills per clip, so Quick Create
// generates exactly one short clip per scene — Movie Maker is where multi-shot
// scenes and longer durations live.
const MOTION_CLIP_SECONDS = 5;

export default function QuickCreate() {
  const qc = useQueryClient();
  // AppLayout supplies this via <Outlet context>. Defaults keep the page
  // usable if it is ever rendered outside that shell.
  const { userTier = 0, isAdmin = false } = useOutletContext() || {};
  const canMotion = isAdmin || userTier >= MOTION_MIN_TIER;

  // "motion" = real generative video (Kling, one clip per scene).
  // "slideshow" = the original FFmpeg Ken Burns pan over stills.
  // Entitled users default to motion, because that is what "Short Video"
  // is understood to mean; everyone else gets the slideshow, labelled.
  const [motionMode, setMotionMode] = useState(canMotion ? "motion" : "slideshow");
  const useMotion = canMotion && motionMode === "motion";
  const [motionProgress, setMotionProgress] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [outputType, setOutputType] = useState("image"); // "image" | "video"
  const [attachments, setAttachments] = useState([]); // [{ url, name }]
  const [uploadingFile, setUploadingFile] = useState(false);
  const [expandingPrompt, setExpandingPrompt] = useState(false);
  const [error, setError] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [warnings, setWarnings] = useState([]);

  // ── Image (quick, non-stepper) path ──
  const [ratio, setRatio] = useState("1:1");
  const [generating, setGenerating] = useState(false);
  const [imageResult, setImageResult] = useState(null);
  const [imageSaved, setImageSaved] = useState(false);

  // ── Video stepper state ──
  const [step, setStep] = useState(0);
  const [videoRatio, setVideoRatio] = useState(VIDEO_RATIOS[0]);
  const [resolution, setResolution] = useState("1080p"); // "1080p" | "720p"
  const [sceneCount, setSceneCount] = useState(3); // 2-4 scenes x 8s = a 16-32s short
  const [script, setScript] = useState("");
  const [generatingScript, setGeneratingScript] = useState(false);
  const [scenes, setScenes] = useState([]); // [{ imageUrl, text, seconds }]
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [storyboardProgress, setStoryboardProgress] = useState(0);
  const [audioMode, setAudioMode] = useState("voiceover"); // "voiceover" | "music" | "silent"
  const [voiceoverUrl, setVoiceoverUrl] = useState("");
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [muxProgress, setMuxProgress] = useState(0);
  const [videoResult, setVideoResult] = useState("");
  const [videoSaved, setVideoSaved] = useState(false);

  const resetVideoPipeline = () => {
    setStep(0); setScript(""); setScenes([]); setVoiceoverUrl("");
    setMusicUrl(""); setMusicName(""); setVideoResult(""); setVideoSaved(false);
    setWarnings([]); setError("");
  };

  const switchOutputType = (type) => {
    setOutputType(type);
    setError(""); setWarnings([]); setUpgradeRequired(false);
    if (type === "video") resetVideoPipeline();
  };

  const expandPrompt = async () => {
    if (!prompt.trim()) { setError("Enter a brief description first."); return; }
    setExpandingPrompt(true);
    setError("");
    try {
      const expanded = await generateText({
        type: "caption",
        prompt: `Expand this brief into a detailed, vivid AI image/video generation prompt (2-3 sentences, no preamble, just the prompt): "${prompt}"`,
        tone: "Professional",
      });
      if (expanded) setPrompt(expanded.trim());
    } catch { setError("AI expansion failed."); }
    setExpandingPrompt(false);
  };

  const addAttachments = async (files) => {
    if (!files?.length) return;
    setUploadingFile(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const url = await uploadFile(file);
        if (url) setAttachments(prev => [...prev, { url, name: file.name }]);
      }
    } catch (e) {
      setError(e?.message || "Attachment upload failed.");
    }
    setUploadingFile(false);
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));
  const referenceImageUrls = attachments.map(a => a.url);

  // ── Image (quick) generation ──
  const generateImageQuick = async () => {
    if (!prompt.trim()) { setError("Describe what you'd like to create."); return; }
    setError(""); setUpgradeRequired(false); setImageResult(null); setImageSaved(false); setGenerating(true);
    try {
      const url = await generateImage({ prompt, dimensions: RATIO_DIMENSIONS[ratio] || "1024x1024", referenceImageUrls });
      if (!url) throw new Error("Image generation failed — try a different description.");
      setImageResult(url);
    } catch (e) {
      setError(e?.message || "Generation failed.");
      if (e?.upgradeRequired) setUpgradeRequired(true);
    }
    setGenerating(false);
  };

  const saveImageToLibrary = async () => {
    if (!imageResult) return;
    try {
      await base44.entities.ContentAsset.create({
        type: "image", title: prompt.slice(0, 60) || "Quick Create", file_url: imageResult, ai_generated: true, prompt_used: prompt.slice(0, 500),
      });
      qc.invalidateQueries(["media_library"]);
      setImageSaved(true);
    } catch (e) { setError(e?.message || "Save failed."); }
  };

  // ── Video stepper: Step 1 (Script) ──
  const generateScriptStep = async () => {
    if (!prompt.trim()) { setError("Describe what you'd like to create."); return; }
    setError(""); setGeneratingScript(true);
    try {
      const result = await generateText({
        type: "video_script",
        prompt: `Write a short, vivid visual video script (plain prose, no scene labels or markdown, no preamble) for a video about: ${prompt}`,
        tone: "Professional",
      });
      setScript((result || prompt).trim());
    } catch (e) {
      setError(e?.message || "Script generation failed.");
    }
    setGeneratingScript(false);
  };

  // ── Step 2 (Storyboard/Images) ──
  const generateStoryboardStep = async () => {
    if (!script.trim()) { setError("Generate or write a script first."); return; }
    setError(""); setGeneratingStoryboard(true); setStoryboardProgress(0); setScenes([]);
    try {
      const sceneScripts = splitScriptIntoScenes(script, sceneCount);
      const built = [];
      for (let i = 0; i < sceneScripts.length; i++) {
        setStoryboardProgress(i / sceneScripts.length);
        const imgUrl = await generateImage({ prompt: sceneScripts[i].imagePrompt || sceneScripts[i].text || prompt, referenceImageUrls });
        built.push({
          imageUrl: imgUrl,
          text: sceneScripts[i].text,
          seconds: useMotion ? MOTION_CLIP_SECONDS : 8,
        });
        setScenes([...built]);
      }
      setStoryboardProgress(1);

      // Real video: each still becomes the start frame for a generated clip,
      // which is what keeps the look consistent across scenes. Sequential, not
      // parallel — the worker fans these out to Replicate and firing them all
      // at once risks tripping rate limits across the whole batch (same reason
      // MovieMaker paces its own scene loop).
      if (useMotion) {
        setMotionProgress(0);
        for (let i = 0; i < built.length; i++) {
          try {
            const clipUrl = await generateSceneVideo({
              prompt: built[i].text || prompt,
              imageUrl: built[i].imageUrl,
              durationSeconds: MOTION_CLIP_SECONDS,
            });
            if (clipUrl) {
              built[i] = { ...built[i], videoUrl: clipUrl };
              setScenes([...built]);
            }
          } catch (clipError) {
            // A failed clip is not fatal — the scene keeps its still image and
            // the assembler pans it instead, so the render still completes.
            const msg = /403|plan|upgrade/i.test(clipError?.message || "")
              ? "Your plan does not include AI video generation — finishing as a cinematic slideshow instead."
              : `Scene ${i + 1}: ${clipError?.message || "video clip generation failed"} — using the still image for this scene.`;
            setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
            if (/403|plan|upgrade/i.test(clipError?.message || "")) {
              setMotionMode("slideshow");
              break;
            }
          }
          setMotionProgress((i + 1) / built.length);
        }
      }
    } catch (e) {
      setError(e?.message || "Storyboard generation failed.");
    }
    setGeneratingStoryboard(false);
  };

  // ── Step 4 (Voiceover) ──
  const generateVoiceoverStep = async () => {
    if (!scenes.length) { setError("Generate the storyboard first."); return; }
    setError(""); setGeneratingVoiceover(true);
    try {
      const blob = await generateVoiceover(scenes.map(s => s.text).join(". "));
      if (blob) {
        const url = await uploadFile(new File([blob], "quick-create-vo.mp3", { type: blob.type || "audio/mpeg" }));
        setVoiceoverUrl(url || "");
        if (!url) setError("Voiceover upload failed.");
      } else {
        setError("No voiceover was produced.");
      }
    } catch (e) {
      setError(e?.message || "Voiceover generation failed.");
    }
    setGeneratingVoiceover(false);
  };

  const handleMusicUpload = async (file) => {
    if (!file) return;
    setUploadingMusic(true);
    setError("");
    try {
      const url = await uploadFile(file);
      if (url) { setMusicUrl(url); setMusicName(file.name); }
      else setError("Music upload failed.");
    } catch (e) { setError(e?.message || "Music upload failed."); }
    setUploadingMusic(false);
  };

  // ── Step 5 (FFmpeg mux+normalize) ──
  const assembleStep = async () => {
    if (!scenes.length) { setError("Generate the storyboard first."); return; }
    setError(""); setWarnings([]); setAssembling(true); setMuxProgress(0); setVideoResult(""); setVideoSaved(false);
    try {
      const effectiveAudioMode = (audioMode === "voiceover" && !voiceoverUrl) || (audioMode === "music" && !musicUrl) ? "silent" : audioMode;
      if (audioMode === "voiceover" && !voiceoverUrl) setWarnings(prev => [...prev, "No voiceover was generated — shipping silent instead."]);
      if (audioMode === "music" && !musicUrl) setWarnings(prev => [...prev, "No music track uploaded — shipping silent. Use Movie Maker Pro for AI-composed music."]);

      // Two assemblers, picked by what the scenes actually contain. The Lane 2
      // render worker understands scene.videoUrl and stitches real clips;
      // assembleLane1Video only knows how to Ken Burns a still. Routing on the
      // scenes rather than on the toggle means a partial failure above (some
      // clips generated, some not) still assembles correctly — render.js
      // already falls back to the still for any scene lacking a videoUrl.
      const hasClips = scenes.some(s => s.videoUrl);
      let url;

      if (hasClips) {
        const jobId = await submitRender({
          scenes, ratio: videoRatio, resolution,
          audioMode: effectiveAudioMode,
          voiceoverUrl: voiceoverUrl || undefined,
          musicUrl: musicUrl || undefined,
        });
        for (;;) {
          await new Promise(r => setTimeout(r, 4000));
          const job = await getRenderStatus(jobId);
          if (typeof job?.progress === "number") setMuxProgress(job.progress);
          if (job?.status === "done") { url = job.url; break; }
          if (job?.status === "error") throw new Error(job.error || "Video assembly failed.");
        }
      } else {
        url = await assembleLane1Video({
          scenes, ratio: videoRatio, resolution,
          audioMode: effectiveAudioMode,
          voiceoverUrl: voiceoverUrl || undefined,
          musicUrl: musicUrl || undefined,
        }, { onProgress: setMuxProgress });
      }

      setVideoResult(url);
      setStep(6); // advance straight to Publish/Export once assembled
    } catch (e) {
      setError(e?.message || "Video assembly failed.");
    }
    setAssembling(false);
  };

  const saveVideoToLibrary = async () => {
    if (!videoResult) return;
    try {
      await base44.entities.ContentAsset.create({
        type: "video", title: prompt.slice(0, 60) || "Quick Create", file_url: videoResult, ai_generated: true, prompt_used: prompt.slice(0, 500),
      });
      qc.invalidateQueries(["media_library"]);
      setVideoSaved(true);
    } catch (e) { setError(e?.message || "Save failed."); }
  };

  // Each step's "Next" is gated on that step's own artifact existing.
  const stepReady = [
    !!prompt.trim(),                 // 0 idea -> can move to script
    !!script.trim(),                 // 1 script -> can move to storyboard
    scenes.length > 0,                // 2 storyboard -> can move to short video review
    scenes.length > 0,                // 3 short video -> can move to voiceover
    true,                             // 4 voiceover -> mux (silent is always valid)
    !!videoResult,                    // 5 mux -> export
  ];

  const currentStep = STEPS[step];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><Wand2 className="w-6 h-6 text-fuchsia-400" /> Quick Create</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Generate a standalone image (one click) or a short video (guided steps) — no brand, accounts, or script step required beyond what's built in.</p>
      </div>

      <div>
        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Output</label>
        <div className="flex gap-2 max-w-sm">
          <button onClick={() => switchOutputType("image")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${outputType === "image" ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
            <ImageIcon className="w-4 h-4" /> Image
          </button>
          <button onClick={() => switchOutputType("video")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${outputType === "video" ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
            <Video className="w-4 h-4" /> Video
          </button>
        </div>
      </div>

      {error && !upgradeRequired && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
          <button onClick={() => setWarnings([])} className="shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {upgradeRequired && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/30 space-y-3">
          <div className="flex items-start gap-2 text-sm text-fuchsia-200">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-fuchsia-400" /> {error}
          </div>
          <Link to="/pricing" className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 transition-all">
            View Plans &amp; Pricing
          </Link>
        </div>
      )}

      {/* ── Prompt/Idea (shared by both paths) ── */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide">Describe what you want</label>
            <button onClick={expandPrompt} disabled={expandingPrompt || !prompt.trim()}
              className="flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 disabled:opacity-40 transition-colors">
              {expandingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {expandingPrompt ? "Expanding…" : "✨ Expand with AI"}
            </button>
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
            placeholder="Brief description → click '✨ Expand with AI' to get a detailed prompt, or write your own..."
            className="w-full rounded-xl border border-input bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Reference Images (optional)</label>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                <button onClick={() => removeAttachment(i)}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <label className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-muted/20 transition-colors">
              {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingFile}
                onChange={e => { addAttachments(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>
      </div>

      {outputType === "image" ? (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Aspect Ratio</label>
              <div className="flex gap-2 flex-wrap">
                {Object.keys(RATIO_DIMENSIONS).map(r => (
                  <button key={r} onClick={() => setRatio(r)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${ratio === r ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={generateImageQuick} disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 shadow-lg">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Wand2 className="w-4 h-4" /> Generate</>}
            </button>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
            <h3 className="font-semibold text-foreground mb-3">Preview</h3>
            {!imageResult && !generating && (
              <div className="flex-1 flex items-center justify-center text-center text-sm text-muted-foreground py-12">Your generated image will appear here.</div>
            )}
            {generating && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground py-12">
                <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
              </div>
            )}
            {imageResult && !generating && (
              <div className="space-y-4">
                <img src={imageResult} alt="" className="w-full rounded-xl border border-border" />
                <div className="flex gap-2">
                  <a href={imageResult} download target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20">
                    <Download className="w-4 h-4" /> Download
                  </a>
                  <button onClick={saveImageToLibrary} disabled={imageSaved}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                    {imageSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stepper tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => i <= step && setStep(i)} disabled={i > step}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  i === step ? "bg-fuchsia-500 text-white shadow-sm"
                  : i < step ? "bg-fuchsia-500/20 text-fuchsia-400"
                  : "bg-card border border-border text-muted-foreground/50"
                }`}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />} {s.label}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 min-h-[260px]">
            {/* Step 0: Prompt/Idea — just confirms the shared prompt above is ready */}
            {step === 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">Prompt/Idea</h3>
                <p className="text-sm text-muted-foreground">Your idea is entered above. Move on to generate a script from it.</p>
              </div>
            )}

            {/* Step 1: Script */}
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">Script</h3>
                <button onClick={generateScriptStep} disabled={generatingScript || !prompt.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                  {generatingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {script ? "Regenerate Script" : "Generate Script"}
                </button>
                {script && (
                  <textarea value={script} onChange={e => setScript(e.target.value)} rows={8}
                    className="w-full rounded-xl border border-input bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                )}
              </div>
            )}

            {/* Step 2: Storyboard/Images */}
            {step === 2 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">Storyboard/Images</h3>

                {/* Motion mode. Until now this step always produced stills that
                    were later panned by FFmpeg, so "Short Video" returned what
                    reads as a slideshow. Both options are now explicit, and the
                    cost difference is stated rather than hidden. */}
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Output</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => canMotion && setMotionMode("motion")}
                      disabled={!canMotion || generatingStoryboard}
                      aria-pressed={useMotion}
                      className={`text-left p-3 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${useMotion ? "bg-fuchsia-500/15 border-fuchsia-500/50" : "border-border hover:bg-muted/20"}`}>
                      <span className={`flex items-center gap-1.5 text-sm font-bold ${useMotion ? "text-fuchsia-400" : "text-foreground"}`}>
                        <Video className="w-3.5 h-3.5" /> Real AI video
                ລ                     </span>
                      <span className="block text-[11px] text-muted-foreground mt-1">
                        Generates an actual moving clip per scene. Uses credits.
                        {!canMotion && " Available on Agency and Movie Maker Pro plans."}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMotionMode("slideshow")}
                      disabled={generatingStoryboard}
                      aria-pressed={!useMotion}
                      className={`text-left p-3 rounded-lg border transition-all ${!useMotion ? "bg-fuchsia-500/15 border-fuchsia-500/50" : "border-border hover:bg-muted/20"}`}>
                      <span className={`flex items-center gap-1.5 text-sm font-bold ${!useMotion ? "text-fuchsia-400" : "text-foreground"}`}>
                        <ImageIcon className="w-3.5 h-3.5" /> Cinematic slideshow
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-1">
                        Still images with a slow pan and zoom. Fast, no credits.
                      </span>
                    </button>
                  </div>
                  {!canMotion && (
                    <p className="text-[11px] text-muted-foreground">
                      <Link to="/pricing" className="text-fuchsia-400 hover:underline font-semibold">Upgrade</Link>
                      {" "}to generate real motion video instead of a slideshow.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    Scenes ({useMotion ? `~${MOTION_CLIP_SECONDS}s clips` : "~8s each"})
                  </label>
                  <div className="flex gap-2">
                    {[2, 3, 4].map(n => (
                      <button key={n} onClick={() => setSceneCount(n)} disabled={generatingStoryboard}
                        className={`px-3 py-1 rounded-lg border text-xs font-bold transition-all ${sceneCount === n ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={generateStoryboardStep} disabled={generatingStoryboard || !script.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                  {generatingStoryboard
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {
                        storyboardProgress < 1
                          ? `Generating images (${Math.round(storyboardProgress * 100)}%)…`
                          : useMotion
                            ? `Generating video clips (${Math.round(motionProgress * 100)}%)…`
                            : "Finishing…"
                      }</>
                    : <><ImageIcon className="w-4 h-4" /> {scenes.length ? "Regenerate Storyboard" : "Generate Storyboard"}</>}
                </button>
                {scenes.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {scenes.map((s, i) => (
                      <div key={i} className="space-y-1">
                        {s.imageUrl ? <img src={s.imageUrl} alt="" className="w-full aspect-video object-cover rounded-lg border border-border" /> : <div className="w-full aspect-video rounded-lg bg-muted animate-pulse" />}
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{s.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Short Video — review + ratio/resolution */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Short Video</h3>
                <p className="text-sm text-muted-foreground">{scenes.length} scenes · {scenes.length * 8}s total. Choose the format for the final short.</p>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Aspect Ratio</label>
                  <div className="flex gap-2 flex-wrap">
                    {VIDEO_RATIOS.map(r => (
                      <button key={r} onClick={() => setVideoRatio(r)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${videoRatio === r ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Resolution</label>
                  <div className="flex gap-2 max-w-xs">
                    {["1080p", "720p"].map(r => (
                      <button key={r} onClick={() => setResolution(r)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${resolution === r ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {scenes.map((s, i) => <img key={i} src={s.imageUrl} alt="" className="w-full aspect-video object-cover rounded-lg border border-border" />)}
                </div>
              </div>
            )}

            {/* Step 4: Voiceover */}
            {step === 4 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Voiceover</h3>
                <div className="flex gap-2 max-w-md">
                  {AUDIO_MODES.map(m => (
                    <button key={m.id} onClick={() => setAudioMode(m.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-all ${audioMode === m.id ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                      <m.icon className="w-3.5 h-3.5" /> {m.label}
                    </button>
                  ))}
                </div>
                {audioMode === "voiceover" && (
                  <div className="space-y-2">
                    <button onClick={generateVoiceoverStep} disabled={generatingVoiceover}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                      {generatingVoiceover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      {voiceoverUrl ? "Regenerate Voiceover" : "Generate Voiceover"}
                    </button>
                    {voiceoverUrl && <audio src={voiceoverUrl} controls className="w-full" />}
                  </div>
                )}
                {audioMode === "music" && (
                  <label className="w-full max-w-md flex items-center gap-3 p-3 rounded-xl border border-border text-left cursor-pointer hover:bg-muted/20 transition-all">
                    <Music className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm text-muted-foreground truncate">{uploadingMusic ? "Uploading…" : musicName || "Upload a music track (required)"}</span>
                    {uploadingMusic ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : musicUrl ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : null}
                    <input type="file" accept="audio/*" className="hidden" disabled={uploadingMusic}
                      onChange={e => { handleMusicUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
                {audioMode === "silent" && <p className="text-sm text-muted-foreground">No audio — the short will render silent.</p>}
              </div>
            )}

            {/* Step 5: FFmpeg mux+normalize */}
            {step === 5 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">FFmpeg Mux + Normalize</h3>
                <p className="text-sm text-muted-foreground">Assembles the storyboard into one {resolution} {videoRatio} short, mixes in the chosen audio, and applies a contrast/loudness finishing pass.</p>
                <button onClick={assembleStep} disabled={assembling}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 shadow-lg">
                  {assembling ? <><Loader2 className="w-4 h-4 animate-spin" /> Assembling ({Math.round(muxProgress * 100)}%)…</> : <><Sparkles className="w-4 h-4" /> Assemble Video</>}
                </button>
                {assembling && (
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(muxProgress * 100)}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Publish/Export */}
            {step === 6 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Publish/Export</h3>
                {videoResult ? (
                  <div className="space-y-3">
                    <video src={videoResult} controls loop className="w-full rounded-xl border border-border bg-black" />
                    <div className="flex gap-2">
                      <a href={videoResult} download target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20">
                        <Download className="w-4 h-4" /> Download
                      </a>
                      <button onClick={saveVideoToLibrary} disabled={videoSaved}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                        {videoSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Go back and assemble your video first.</p>
                )}
              </div>
            )}
          </div>

          {/* Stepper nav */}
          <div className="flex items-center justify-between">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < STEPS.length - 1 && (
              <button onClick={() => stepReady[step] && setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={!stepReady[step]}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/20 disabled:opacity-30 transition-all">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
