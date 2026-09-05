import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
// Lane 1 (Business/Marketing) page — imports only from @/utils/lane1,
// never @/utils/lane2 or aiClient.js's paid-generation exports directly
// (enforced by eslint.config.js's lane guard). submitCapture/
// getCaptureStatus reach the capture worker (server-capture/) the same
// way every other call here reaches the render worker — through a Base44
// function (no worker URL or shared secret ever touches this client code).
import { generateText, generateImage, generateVoiceover, uploadFile, splitScriptIntoScenes, assembleLane1Video, submitCapture, getCaptureStatus } from "@/utils/lane1";
import { VIDEO_RATIOS } from "@/utils/videoAssembler";
// AI background music (ElevenLabs Music, paid Lane 2) — enabled for the walkthrough
// so "Music" mode generates a track instead of shipping silent.
import { generateMusic, generateSceneVideo, submitRender, getRenderStatus } from "@/utils/lane2";
import { isRealVideoEntitled } from "@/utils/entitlements";
import {
  Globe, Loader2, Sparkles, Monitor, Wand2, Play, Square, Download, Save,
  CheckCircle2, AlertTriangle, Mic, ExternalLink, RefreshCw, Music, VolumeX,
  Lock, Video,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

const CAPTURE_POLL_MS = 3000;
const CAPTURE_TIMEOUT_MS = 5 * 60 * 1000;

// Mode A's walkthrough assembles server-side via the shared FFmpeg-assembly
// worker route (1080p H.264 with real audio) instead of the old
// client-side Canvas+MediaRecorder path (src/utils/videoAssembler.js's
// assembleVideo, still in the repo but no longer called here). Background
// music here is upload-only — Lane 1 doesn't have access to AI music
// generation (that's a paid provider call, Lane 2 only).
const AUDIO_MODES = [
  { id: "voiceover", label: "Voiceover", icon: Mic },
  { id: "music", label: "Music", icon: Music },
  { id: "silent", label: "Silent", icon: VolumeX },
];

export default function DemoVideoMaker() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [description, setDescription] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [script, setScript] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("walkthrough"); // "walkthrough" | "recording" | "capture"

  // Mode A — AI-narrated walkthrough
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1080p"); // "1080p" | "720p"
  const [audioMode, setAudioMode] = useState("voiceover"); // "voiceover" | "music" | "silent"
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [walkthroughResult, setWalkthroughResult] = useState(null);
  const [walkthroughSaved, setWalkthroughSaved] = useState(false);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [warnings, setWarnings] = useState([]);

  // Mode B — screen recording + AI voiceover
  const [voiceoverUrl, setVoiceoverUrl] = useState("");
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [savingRecording, setSavingRecording] = useState(false);
  const voiceoverBlobRef = useRef(null);
  const recordedBlobRef = useRef(null);
  const recorderRef = useRef(null);
  const displayStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioElRef = useRef(null);

  // Mode C — server-side headless-browser capture (server-capture/), via
  // the same submitCapture/getCaptureStatus Base44 proxy MovieMaker's
  // "Auto Demo from URL" uses. Public-only by default; the authenticated
  // toggle below reveals a consent-gated login form, mirroring
  // MovieMaker.jsx's Auto Demo from URL card so the two flows read the
  // same way to a user who's seen either one.
  const [captureAuthenticated, setCaptureAuthenticated] = useState(false);
  const [captureLoginUrl, setCaptureLoginUrl] = useState("");
  const [captureUsername, setCaptureUsername] = useState("");
  const [capturePassword, setCapturePassword] = useState("");
  const [captureShowAdvanced, setCaptureShowAdvanced] = useState(false);
  const [captureUsernameField, setCaptureUsernameField] = useState("");
  const [capturePasswordField, setCapturePasswordField] = useState("");
  const [captureSubmitSelector, setCaptureSubmitSelector] = useState("");
  const [captureSuccessSelector, setCaptureSuccessSelector] = useState("");
  const [captureConsent, setCaptureConsent] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureStepLabel, setCaptureStepLabel] = useState("");
  const [capturePercent, setCapturePercent] = useState(0);
  const [captureResult, setCaptureResult] = useState(null); // { url }
  const [captureSaved, setCaptureSaved] = useState(false);
  const captureCancelledRef = useRef(false);

  const resetResults = () => {
    setWalkthroughResult(null); setWalkthroughSaved(false);
    setVoiceoverUrl(""); voiceoverBlobRef.current = null;
    setRecordedUrl(""); recordedBlobRef.current = null; setRecordingSaved(false);
    setCaptureResult(null); setCaptureSaved(false);
  };

  const analyze = async () => {
    if (!url.trim()) return;
    const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
    setScanning(true); setError(""); setScan(null); setScript(""); setDescription(""); setScreenshotUrl(""); resetResults();
    try {
      const res = await base44.functions.invoke("scanWebsite", { url: cleanUrl });
      const data = res?.data || res;
      const analysis = data?.analysis || data;
      setScan(analysis);
      setDescription((analysis?.business_summary || "").trim());
      setScreenshotUrl(`https://image.thum.io/get/width/1280/${cleanUrl}`);

      const prompt = `Write a short, engaging voiceover script (about 60-90 seconds when read aloud, plain prose, no scene labels, no markdown, no preamble) for a demo video introducing this website/product.\nURL: ${cleanUrl}\nBusiness summary: ${analysis?.business_summary || "N/A"}\nServices: ${(analysis?.services_found || []).join(", ") || "N/A"}\nKeywords: ${(analysis?.keywords_found || []).join(", ") || "N/A"}`;
      const generatedScript = await generateText({ type: "video_script", prompt, tone: analysis?.tone || "Professional" });
      setScript((generatedScript || "").trim());
    } catch (e) {
      setError(e?.message || "Scan failed.");
    }
    setScanning(false);
  };

  // Re-write the voiceover script using the user-edited Description (and any
  // extra points they added), without re-scanning the URL.
  const regenerateScript = async () => {
    if (!description.trim()) return;
    setError(""); setScanning(true);
    try {
      const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
      const prompt = `Write a short, engaging voiceover script (about 60-90 seconds when read aloud, plain prose, no scene labels, no markdown, no preamble) for a demo video introducing this website/product.\nURL: ${cleanUrl}\nDescription: ${description}\nServices: ${(scan?.services_found || []).join(", ") || "N/A"}\nKeywords: ${(scan?.keywords_found || []).join(", ") || "N/A"}`;
      const generatedScript = await generateText({ type: "video_script", prompt, tone: scan?.tone || "Professional" });
      setScript((generatedScript || "").trim());
    } catch (e) {
      setError(e?.message || "Script generation failed.");
    }
    setScanning(false);
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

  // ── Mode A: AI-narrated walkthrough (fully automated, no real screen capture) ──
  const generateWalkthrough = async () => {
    if (!script.trim()) { setError("Generate or write a script first."); return; }
    setError(""); setWarnings([]); setWalkthroughResult(null); setWalkthroughSaved(false); setGeneratingVideo(true); setProgress(0); setStatusMsg("");
    try {
      const sceneScripts = splitScriptIntoScenes(script, 4);
      const scenes = [];
      const sceneStyles = [
        "wide establishing hero shot, bright airy lighting, spacious composition",
        "close-up detail shot, shallow depth of field, warm accent lighting",
        "dynamic three-quarter angle, bold contrasting colors, energetic composition",
        "clean flat-lay top-down layout, soft even lighting, minimalist negative space",
        "over-the-shoulder perspective, cinematic teal-and-orange grade, sense of motion",
        "isometric illustrative style, cool gradient palette, structured grid layout",
      ];
      for (let i = 0; i < sceneScripts.length; i++) {
        setStatusMsg(`Generating scene ${i + 1} of ${sceneScripts.length}...`);
        setProgress((i / sceneScripts.length) * 0.4);
        let imgUrl;
        if (i === 0 && screenshotUrl) {
          // Open on a real screenshot of the scanned URL, not a generic AI image.
          imgUrl = screenshotUrl;
        } else {
          const context = description ? ("Brand context: " + description + ". ") : "";
          const style = sceneStyles[i % sceneStyles.length];
          imgUrl = await generateImage({ prompt: context + "Distinct marketing visual for scene " + (i + 1) + " of a product walkthrough. " + style + ". Depict specifically: " + sceneScripts[i].text + ". No text, no words, no captions in the image.", referenceImageUrls: screenshotUrl ? [screenshotUrl] : [] });
        }
        scenes.push({ imageUrl: imgUrl, text: sceneScripts[i].text, seconds: 8 });
      }

      let voiceoverUrl;
      let finalMusicUrl = musicUrl || undefined;
      if (audioMode === "voiceover") {
        setStatusMsg("Generating voiceover...");
        const blob = await generateVoiceover(scenes.map(s => s.text).join(". "));
        if (blob) voiceoverUrl = await uploadFile(new File([blob], "demo-vo.mp3", { type: blob.type || "audio/mpeg" }));
        else setWarnings(prev => [...prev, "No voiceover was produced — shipping silent instead."]);
      } else if (audioMode === "music" && !finalMusicUrl) {
        // No track uploaded: generate AI background music (Lane 2).
        setStatusMsg("Composing AI background music...");
        const totalSeconds = scenes.reduce((s, sc) => s + (sc.seconds || 8), 0);
        try {
          const music = await generateMusic({
            prompt: `Upbeat, modern, inspiring background music for a product demo about ${description || "an AI creative platform"}. Instrumental, no vocals.`,
            durationSeconds: Math.min(Math.max(totalSeconds, 20), 120),
            instrumental: true,
          });
          // generateMusic resolves to { url, vocals }. This read `music.url`
          // back when the function returned a bare URL string, so it was
          // always undefined and every generated track was thrown away —
          // the demo shipped silent with a "returned no track" warning that
          // had nothing to do with the provider. The contract is an object
          // now, so the same expression is finally correct; keep the two in
          // step if it ever changes again.
          if (music?.url) finalMusicUrl = music.url;
          else setWarnings(prev => [...prev, "AI music generation returned no track — shipping silent."]);
        } catch (e) {
          setWarnings(prev => [...prev, `AI music generation failed (${e?.message || "error"}) — shipping silent.`]);
        }
      }

let realVideo = false;
try {
  const me = await base44.auth.me();
  const subs = await base44.entities.Subscription.filter({ owner_email: me?.email }, null, 1);
  realVideo = isRealVideoEntitled(Array.isArray(subs) ? subs[0] : subs);
} catch (_e) { realVideo = false; }

let hostedUrl;
const effectiveAudioMode = (audioMode === "voiceover" && !voiceoverUrl) || (audioMode === "music" && !finalMusicUrl) ? "silent" : audioMode;
if (realVideo) {
  const videoScenes = [];
  for (let i = 0; i < scenes.length; i++) {
    setStatusMsg(`Generating motion for scene ${i + 1} of ${scenes.length}...`);
    setProgress(0.4 + (i / scenes.length) * 0.35);
    let clipUrl = null;
    try {
      const clip = await generateSceneVideo({ prompt: sceneScripts[i].text, imageUrl: scenes[i].imageUrl, durationSeconds: Math.max(4, Math.round(scenes[i].seconds || 5)) });
      clipUrl = typeof clip === "string" ? clip : (clip && (clip.url || clip.videoUrl)) || null;
    } catch (_e) { clipUrl = null; }
    videoScenes.push({ imageUrl: scenes[i].imageUrl, videoUrl: clipUrl, seconds: scenes[i].seconds, subtitle: scenes[i].text });
  }
  setStatusMsg("Rendering your video...");
  const jobId = await submitRender({ scenes: videoScenes, audioMode: effectiveAudioMode, voiceoverUrl, musicUrl: finalMusicUrl, burnSubtitles: true });
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > CAPTURE_TIMEOUT_MS) throw new Error("Video render timed out. Please try again.");
    const job = await getRenderStatus(jobId);
    if (job && typeof job.progress === "number") setProgress(0.75 + job.progress * 0.25);
    if (job && job.status === "done") { hostedUrl = job.url; break; }
    if (job && job.status === "error") throw new Error(job.error || "Video render failed.");
    await new Promise((res) => setTimeout(res, CAPTURE_POLL_MS));
  }
} else {
  setStatusMsg("Assembling video...");
  hostedUrl = await assembleLane1Video({
    scenes, ratio, resolution,
    audioMode: effectiveAudioMode,
    voiceoverUrl, musicUrl: finalMusicUrl,
  }, { onProgress: (p) => setProgress(0.4 + p * 0.6) });
}
      setProgress(1);
      setWalkthroughResult({ url: hostedUrl });
    } catch (e) {
      setError(e?.message || "Video generation failed.");
    }
    setGeneratingVideo(false); setStatusMsg("");
  };

  const saveWalkthrough = async () => {
    if (!walkthroughResult) return;
    try {
      await base44.entities.ContentAsset.create({
        type: "video", title: `Demo walkthrough — ${url}`, file_url: walkthroughResult.url, ai_generated: true, prompt_used: script.slice(0, 500),
      });
      qc.invalidateQueries(["media_library"]);
      setWalkthroughSaved(true);
    } catch (e) { setError(e?.message || "Save failed."); }
  };

  // ── Mode B: screen recording with synced AI voiceover ──
  const generateVoiceoverOnly = async () => {
    if (!script.trim()) { setError("Generate or write a script first."); return; }
    setError(""); setGeneratingVoiceover(true);
    try {
      const blob = await generateVoiceover(script);
      if (!blob) throw new Error("Voiceover generation is unavailable right now.");
      voiceoverBlobRef.current = blob;
      setVoiceoverUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e?.message || "Voiceover generation failed.");
    }
    setGeneratingVoiceover(false);
  };

  const startRecording = async () => {
    setError(""); setRecordedUrl(""); recordedBlobRef.current = null; setRecordingSaved(false);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen recording isn't supported in this browser. Try Chrome or Edge on desktop.");
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      displayStreamRef.current = displayStream;
      let combinedStream = displayStream;

      if (voiceoverBlobRef.current) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        const audioEl = new Audio(voiceoverUrl);
        audioElRef.current = audioEl;
        const source = audioCtx.createMediaElementSource(audioEl);
        source.connect(dest);
        source.connect(audioCtx.destination); // also audible while recording
        combinedStream = new MediaStream([...displayStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        audioEl.play().catch(() => {});
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 6_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        recordedBlobRef.current = blob;
        setRecordedUrl(URL.createObjectURL(blob));
        audioElRef.current?.pause();
        try { audioCtxRef.current?.close(); } catch (_) { /* noop */ }
        setRecording(false);
      };
      // Stop automatically if the user ends the share from the browser's own UI.
      displayStream.getVideoTracks()[0].onended = () => stopRecording();

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError(e?.message || "Screen-share permission was denied or cancelled.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const saveRecording = async () => {
    if (!recordedBlobRef.current) return;
    setError(""); setSavingRecording(true);
    try {
      const hostedUrl = await uploadFile(new File([recordedBlobRef.current], "demo-recording.webm", { type: "video/webm" }));
      await base44.entities.ContentAsset.create({
        type: "video", title: `Demo recording — ${url}`, file_url: hostedUrl, ai_generated: false, prompt_used: script.slice(0, 500),
      });
      qc.invalidateQueries(["media_library"]);
      setRecordingSaved(true);
    } catch (e) { setError(e?.message || "Save failed."); }
    setSavingRecording(false);
  };

  // ── Mode C: server-side capture via server-capture/ ──
  const cancelCapture = () => {
    captureCancelledRef.current = true;
    setCapturing(false);
  };

  const startServerCapture = async () => {
    if (!url.trim()) { setError("Enter a URL first."); return; }
    if (captureAuthenticated && (!capturePassword || !captureConsent)) {
      setError("Enter a password and confirm you're authorized to log in first.");
      return;
    }

    captureCancelledRef.current = false;
    setError(""); setCaptureResult(null); setCaptureSaved(false);
    setCapturing(true); setCaptureStepLabel("Starting capture…"); setCapturePercent(0);

    try {
      const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
      const credentials = captureAuthenticated ? {
        loginUrl: captureLoginUrl.trim() || undefined,
        usernameField: captureUsernameField.trim() || undefined,
        passwordField: capturePasswordField.trim() || undefined,
        submitSelector: captureSubmitSelector.trim() || undefined,
        successSelector: captureSuccessSelector.trim() || undefined,
        username: captureUsername,
        password: capturePassword,
      } : undefined;

      const captureId = await submitCapture(credentials ? { url: cleanUrl, credentials } : { url: cleanUrl });
      // The password (and username) only ever need to exist in state for
      // this one submit — clear them immediately rather than leaving them
      // in memory/React DevTools for the rest of the session.
      setCapturePassword(""); setCaptureUsername("");

      const startedAt = Date.now();
      for (;;) {
        if (captureCancelledRef.current) return;
        if (Date.now() - startedAt > CAPTURE_TIMEOUT_MS) throw new Error("Capture timed out. Please try again.");
        await new Promise((resolve) => setTimeout(resolve, CAPTURE_POLL_MS));
        const job = await getCaptureStatus(captureId);
        if (typeof job?.stepIndex === "number" && typeof job?.stepTotal === "number" && job.stepTotal > 0) {
          setCaptureStepLabel(`Capturing walkthrough… step ${Math.min(job.stepIndex + 1, job.stepTotal)} of ${job.stepTotal}`);
        }
        if (typeof job?.percent === "number") setCapturePercent(job.percent / 100);
        if (job?.status === "done") { setCaptureResult({ url: job.videoUrl }); break; }
        if (job?.status === "login_required") {
          throw new Error(job.error || "This page requires a login — turn on Authenticated capture and provide credentials.");
        }
        if (job?.status === "login_failed") {
          // Deliberately generic, same as the worker's own message — never
          // surface anything from the credentials that were sent.
          throw new Error("Login failed. Please double-check the credentials and try again.");
        }
        if (job?.status === "error") throw new Error(job.error || "Capture failed.");
        // else "queued" / "processing" — keep polling
      }
    } catch (e) {
      if (!captureCancelledRef.current) setError(e?.message || "Capture failed.");
    }
    if (!captureCancelledRef.current) setCapturing(false);
  };

  const saveCapture = async () => {
    if (!captureResult) return;
    try {
      await base44.entities.ContentAsset.create({
        type: "video", title: `Demo capture — ${url}`, file_url: captureResult.url, ai_generated: true, prompt_used: script.slice(0, 500) || undefined,
      });
      qc.invalidateQueries(["media_library"]);
      setCaptureSaved(true);
    } catch (e) { setError(e?.message || "Save failed."); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader
        icon={Monitor}
        iconGradient="from-fuchsia-500 to-purple-600"
        title="Create Demo Video"
        subtitle="Turn any app, site, or product URL into a narrated demo video — automatically, or by recording your own screen with an AI voiceover."
      />

      {/* URL + analyze */}
      <div className="bg-card border border-fuchsia-500/20 rounded-2xl p-6">
        <h3 className="font-semibold text-foreground mb-3">1. Enter the URL</h3>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && analyze()}
              placeholder="yourapp.com or https://yourproduct.com"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={analyze} disabled={scanning || !url}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 shadow-lg">
            {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Sparkles className="w-4 h-4" /> Analyze &amp; Write Script</>}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">We scan the page content and generate a voiceover script automatically — edit it below before generating your video.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {scan && (
        <>
          {/* Scan summary */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Globe className="w-4 h-4 text-fuchsia-400" /> {url.replace(/^https?:\/\//, "")}</h3>
            {screenshotUrl && (
              <img src={screenshotUrl} alt="" className="w-full max-h-64 object-cover rounded-xl border border-border bg-black"
                onError={e => { e.target.style.display = "none"; }} />
            )}
            {scan.services_found?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {scan.services_found.map(s => <span key={s} className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">{s}</span>)}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                placeholder="What does this site/product do? Edit this or add a few more points — it informs the script and visuals below."
                className="w-full rounded-xl border border-input bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              <button onClick={regenerateScript} disabled={scanning || !description.trim()}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted/20 disabled:opacity-60">
                {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Regenerate Script from Description
              </button>
            </div>
          </div>

          {/* Script */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground">2. Voiceover Script</h3>
            <textarea value={script} onChange={e => setScript(e.target.value)} rows={6}
              placeholder="Voiceover script for the demo video..."
              className="w-full rounded-xl border border-input bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

          {/* Mode tabs */}
          <div className="flex gap-2 max-w-lg">
            <button onClick={() => setMode("walkthrough")}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${mode === "walkthrough" ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
              <Wand2 className="w-5 h-5 mb-1" />
              <div className="text-sm font-semibold">AI Walkthrough</div>
              <div className="text-xs opacity-70 mt-0.5">Fully automatic — AI generates scene visuals + voiceover, no manual steps.</div>
            </button>
            <button onClick={() => setMode("recording")}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${mode === "recording" ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
              <Monitor className="w-5 h-5 mb-1" />
              <div className="text-sm font-semibold">Screen Recording</div>
              <div className="text-xs opacity-70 mt-0.5">Record your own screen showing the real site, narrated live by the AI voiceover.</div>
            </button>
            <button onClick={() => setMode("capture")}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${mode === "capture" ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
              <Video className="w-5 h-5 mb-1" />
              <div className="text-sm font-semibold">Server Capture</div>
              <div className="text-xs opacity-70 mt-0.5">A headless browser records the real site for you — no screen-share needed, works from any device.</div>
            </button>
          </div>

          {/* Mode A: AI Walkthrough */}
          {mode === "walkthrough" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground">3. Generate Walkthrough Video</h3>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Aspect Ratio</label>
                <div className="flex gap-2 flex-wrap">
                  {VIDEO_RATIOS.map(r => (
                    <button key={r} onClick={() => setRatio(r)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${ratio === r ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Resolution</label>
                <div className="flex gap-2">
                  {["1080p", "720p"].map(r => (
                    <button key={r} onClick={() => setResolution(r)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${resolution === r ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Audio</label>
                <div className="flex gap-2">
                  {AUDIO_MODES.map(m => (
                    <button key={m.id} onClick={() => setAudioMode(m.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-all ${audioMode === m.id ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                      <m.icon className="w-3.5 h-3.5" /> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {audioMode === "music" && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Music track (required — upload one, or ships silent)</label>
                  <label className="w-full flex items-center gap-3 p-3 rounded-xl border border-border text-left cursor-pointer hover:bg-muted/20 transition-all">
                    <Music className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm text-muted-foreground truncate">
                      {uploadingMusic ? "Uploading…" : musicName || "Upload a music track"}
                    </span>
                    {uploadingMusic ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : musicUrl ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : null}
                    <input type="file" accept="audio/*" className="hidden" disabled={uploadingMusic}
                      onChange={e => { handleMusicUpload(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
                </div>
              )}

              <button onClick={generateWalkthrough} disabled={generatingVideo}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 shadow-lg">
                {generatingVideo ? <><Loader2 className="w-4 h-4 animate-spin" /> {statusMsg || "Generating..."}</> : <><Wand2 className="w-4 h-4" /> Generate Video</>}
              </button>
              {generatingVideo && (
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
              {walkthroughResult && (
                <div className="space-y-3">
                  <video src={walkthroughResult.url} controls loop className="w-full rounded-xl border border-border bg-black" />
                  <div className="flex gap-2">
                    <a href={walkthroughResult.url} download target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20">
                      <Download className="w-4 h-4" /> Download
                    </a>
                    <button onClick={saveWalkthrough} disabled={walkthroughSaved}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                      {walkthroughSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode B: Screen Recording */}
          {mode === "recording" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground">3. Record Your Screen</h3>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Step 1 — generate the voiceover audio that will narrate your recording in real time.</p>
                <button onClick={generateVoiceoverOnly} disabled={generatingVoiceover}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                  {generatingVoiceover ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Mic className="w-4 h-4" /> Generate Voiceover</>}
                </button>
                {voiceoverUrl && <audio src={voiceoverUrl} controls className="w-full mt-2" />}
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5"><ExternalLink className="w-4 h-4" /> Step 2 — open the site you want to demo</p>
                <p>Open <a href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">{url}</a> in another tab or window, then come back here.</p>
                <p className="font-semibold pt-1">Step 3 — record</p>
                <p>Click <strong>Start Recording</strong>, then choose that tab/window in the screen-share picker. Recording starts immediately and plays the voiceover in sync — narrate live or let the AI voiceover guide you. Click <strong>Stop Recording</strong> when you're done.</p>
              </div>

              <div className="flex gap-2">
                {!recording ? (
                  <button onClick={startRecording}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 shadow-lg">
                    <Play className="w-4 h-4" /> Start Recording
                  </button>
                ) : (
                  <button onClick={stopRecording}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:opacity-90 shadow-lg animate-pulse">
                    <Square className="w-4 h-4" /> Stop Recording
                  </button>
                )}
              </div>

              {recordedUrl && (
                <div className="space-y-3">
                  <video src={recordedUrl} controls className="w-full rounded-xl border border-border bg-black" />
                  <div className="flex gap-2">
                    <a href={recordedUrl} download target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20">
                      <Download className="w-4 h-4" /> Download
                    </a>
                    <button onClick={saveRecording} disabled={recordingSaved || savingRecording}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                      {savingRecording ? <Loader2 className="w-4 h-4 animate-spin" /> : recordingSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode C: Server Capture */}
          {mode === "capture" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground">3. Capture the Real Site</h3>
              <p className="text-sm text-muted-foreground">A headless browser records a walkthrough of <strong>{url}</strong> server-side — nothing to share or record on your own screen.</p>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer w-fit">
                <input type="checkbox" checked={captureAuthenticated}
                  onChange={e => setCaptureAuthenticated(e.target.checked)}
                  disabled={capturing}
                  className="accent-fuchsia-500" />
                <Lock className="w-3.5 h-3.5" /> This page requires login (optional — default is public-only)
              </label>

              {captureAuthenticated && (
                <div className="p-3 rounded-xl bg-background border border-border space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    By continuing, you authorize this app to automatically sign in to the target site on your behalf
                    using the credentials below, and to browse pages behind that login as part of an automated
                    recording. You confirm that you are the account holder, or are otherwise authorized by the account
                    holder, to access this site with these credentials. Your password is used only for this one
                    capture: it's sent over an encrypted connection, is encrypted at rest for the brief time (if any)
                    the job is queued, is never written to a log or a permanent record, and is never shown back to you
                    or anyone else.
                  </p>

                  <input value={captureLoginUrl} onChange={e => setCaptureLoginUrl(e.target.value)}
                    placeholder="Login page URL (optional — defaults to the URL above)"
                    disabled={capturing}
                    className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={captureUsername} onChange={e => setCaptureUsername(e.target.value)}
                      placeholder="Username / email" autoComplete="off" disabled={capturing}
                      className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
                    <input value={capturePassword} onChange={e => setCapturePassword(e.target.value)}
                      placeholder="Password" type="password" autoComplete="off" autoCorrect="off" spellCheck={false}
                      disabled={capturing}
                      className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
                  </div>

                  <button type="button" onClick={() => setCaptureShowAdvanced(v => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline">
                    {captureShowAdvanced ? "Hide" : "Show"} advanced (field selectors)
                  </button>
                  {captureShowAdvanced && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input value={captureUsernameField} onChange={e => setCaptureUsernameField(e.target.value)}
                        placeholder="Username field CSS selector (auto-detected if blank)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring" />
                      <input value={capturePasswordField} onChange={e => setCapturePasswordField(e.target.value)}
                        placeholder="Password field CSS selector (auto-detected if blank)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring" />
                      <input value={captureSubmitSelector} onChange={e => setCaptureSubmitSelector(e.target.value)}
                        placeholder="Submit button selector (defaults to Enter key)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring" />
                      <input value={captureSuccessSelector} onChange={e => setCaptureSuccessSelector(e.target.value)}
                        placeholder="Post-login success selector (optional)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  )}

                  <label className="flex items-start gap-1.5 text-[11px] text-foreground cursor-pointer">
                    <input type="checkbox" checked={captureConsent} onChange={e => setCaptureConsent(e.target.checked)}
                      disabled={capturing}
                      className="accent-fuchsia-500 mt-0.5" />
                    I confirm I'm authorized to log into this site with these credentials, and I accept responsibility
                    for this automated login.
                  </label>
                </div>
              )}

              <button onClick={startServerCapture} disabled={capturing || !url.trim() || (captureAuthenticated && (!capturePassword || !captureConsent))}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 shadow-lg">
                {capturing ? <><Loader2 className="w-4 h-4 animate-spin" /> {captureStepLabel || "Capturing…"}</> : <><Video className="w-4 h-4" /> Start Capture</>}
              </button>
              {capturing && (
                <div className="space-y-1.5">
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(capturePercent * 100)}%` }} />
                  </div>
                  <button onClick={cancelCapture} className="text-[11px] text-muted-foreground hover:text-foreground underline">Cancel</button>
                </div>
              )}

              {captureResult && (
                <div className="space-y-3">
                  <video src={captureResult.url} controls className="w-full rounded-xl border border-border bg-black" />
                  <div className="flex gap-2">
                    <a href={captureResult.url} download target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20">
                      <Download className="w-4 h-4" /> Download
                    </a>
                    <button onClick={saveCapture} disabled={captureSaved}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                      {captureSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
