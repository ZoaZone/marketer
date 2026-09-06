import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { generateText, generateImage, generateVoiceover, uploadFile, splitScriptIntoScenes, assembleLane1Video, probeMediaDuration } from "@/utils/lane1";
// Tier-gated Lane 2 access — see the amended lane guard in eslint.config.js.
// Entitlement is enforced server-side in base44/functions/submitVideo (403);
// the client check below is UX, so an unentitled user gets an upgrade prompt
// instead of a failed request.
import { generateSceneVideo, generateMusic, submitRender, getRenderStatus, MAX_MUSIC_SECONDS } from "@/utils/lane2";
import { VIDEO_RATIOS } from "@/utils/videoAssembler";
import {
  Wand2, Image as ImageIcon, Video, Loader2, Download, Save, CheckCircle2,
  AlertTriangle, Mic, Sparkles, Paperclip, X, Music, VolumeX, ChevronRight,
  ChevronLeft, Check, Film, Lightbulb, MessageSquare, Clapperboard, Briefcase,
  Lock, Upload,
} from "lucide-react";

// Quick Create uses Lane 1 for standard generation and assembly, plus
// server-gated Lane 2 calls for entitled AI video clips and AI music.
// Short-video assembly
// happens server-side via lane1.js's assembleLane1Video (the shared
// FFmpeg-assembly worker route — 1080p, real H.264 with audio,
// loudnorm/contrast finishing pass), not the old client-side
// Canvas+MediaRecorder path (src/utils/videoAssembler.js's assembleVideo,
// still in the repo but no longer called here). Paid clip and music calls
// remain protected by their backend subscription and usage gates.
//
// The video path is a linear, gated stepper (Work Package G): each step's
// "Next" stays disabled until that step's own artifact exists (script
// written, storyboard images generated, audio resolved, video assembled).
// The image path stays a single quick action — the stepper only applies to
// video, which is the pipeline the mux/audio/publish steps describe.
//
// AUDIO. Speech and music are independent, and per-scene dialogue is the
// default shape of speech. Both were previously a single three-way choice
// (voiceover XOR music XOR silent), which produced two distinct faults from
// one cause: a generated music track was silently discarded whenever a
// voiceover was selected, and the only speech on offer was one continuous
// narration track laid over the whole video — no lines, no timing, nothing
// tied to a scene. See NARRATION_MODES and assembleStep.

const STEPS = [
  { id: "idea", label: "Prompt/Idea", icon: Lightbulb },
  { id: "script", label: "Script", icon: Wand2 },
  { id: "storyboard", label: "Storyboard/Images", icon: ImageIcon },
  { id: "video", label: "Short Video", icon: Film },
  { id: "audio", label: "Dialogue & Audio", icon: MessageSquare },
  { id: "mux", label: "FFmpeg Mux", icon: Sparkles },
  { id: "export", label: "Publish/Export", icon: Download },
];

// How the video speaks. This used to be a single AUDIO_MODES choice of
// voiceover XOR music XOR silent, which caused both of the reported audio
// faults at once: picking "Voiceover" silently discarded a music track that
// had already been generated, and the only speech available was one
// continuous narration over the whole video — "like a documentary", with
// "no feeling of characters talking".
//
// Speech and music are now independent (music is its own toggle below), and
// speech itself has two shapes. Dialogue is the default because it is what a
// short video usually wants.
const NARRATION_MODES = [
  {
    id: "dialogue", label: "Dialogue", icon: MessageSquare,
    hint: "One spoken line per scene, cut to that scene. Characters speak; the scene waits for the line to finish.",
  },
  {
    id: "narration", label: "Narration", icon: Mic,
    hint: "A single voice reading over the whole video. Documentary style.",
  },
  {
    id: "none", label: "No speech", icon: VolumeX,
    hint: "Music only, or silent.",
  },
];

// Pixel-dimension hints passed to the image generator per aspect ratio.
const RATIO_DIMENSIONS = { "1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792", "4:5": "1024x1280" };

// Tier at which real generative video unlocks. Mirrors AppLayout's TIER_MAP
// (3 = agency, 4 = any Lane 2 tier or BYOK) and must stay in step with
// GENERATION_ENTITLED_TIERS in base44/functions/submitVideo/entry.ts, which is
// the check that actually enforces it.
const MOTION_MIN_TIER = 3;

// Tier at which Movie Maker Pro itself unlocks. Mirrors the sidebar's own
// /movie-maker entry (minTier 4).
const MOVIE_MAKER_MIN_TIER = 4;

// Per-scene clip length for real video. Kling bills per clip, so Quick Create
// generates exactly one short clip per scene — Movie Maker is where multi-shot
// scenes and longer durations live.
const MOTION_CLIP_SECONDS = 5;


/**
 * Splits a model's dialogue answer into one line per scene.
 *
 * The model is asked for "1| line" per scene, but LLM output is not a
 * protocol: numbering drifts between "1|", "1.", "1)" and "Scene 1:", lines
 * wrap, and sometimes the numbering is dropped entirely. Anything that
 * survives here is what the user sees in the editor, so it is worth being
 * generous — an unparsed answer means the whole step silently produced
 * nothing.
 *
 * Speaker labels are DELIBERATELY kept ("MAYA: we're not done yet"): they
 * are what makes the lines read as characters talking in the editor.
 * toSpokenLine strips them at the point of synthesis, so the voice does not
 * read the name aloud.
 */
export function parseDialogueLines(raw, sceneCount) {
  const lines = new Array(Math.max(0, sceneCount)).fill("");
  if (!raw || !sceneCount) return lines;

  const numbered = /^\s*(?:scene\s*)?(\d{1,2})\s*[|.):\-]\s*(.+)$/i;
  let lastIndex = -1;

  for (const rawLine of String(raw).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(numbered);
    if (match) {
      const index = Number(match[1]) - 1;
      if (index >= 0 && index < sceneCount) {
        lines[index] = cleanDialogueLine(match[2]);
        lastIndex = index;
      }
      continue;
    }
    // A wrapped continuation of the line before it, not a new scene.
    if (lastIndex >= 0) {
      lines[lastIndex] = `${lines[lastIndex]} ${cleanDialogueLine(line)}`.trim();
    }
  }

  // Unnumbered output: fall back to taking the lines in order.
  if (!lines.some(Boolean)) {
    const plain = String(raw).split(/\r?\n/).map(cleanDialogueLine).filter(Boolean);
    for (let i = 0; i < sceneCount && i < plain.length; i++) lines[i] = plain[i];
  }
  return lines;
}

/** Markdown, stage directions and wrapping quotes — never spoken, never shown. */
function cleanDialogueLine(text) {
  return stripSpokenQuotes(
    String(text || "")
      .replace(/\*\*/g, "").replace(/\*/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/\([^)]*\)/g, "")            // (smiling warmly)
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Unwraps a quoted line, whether or not a speaker label sits in front of the
 * opening quote — models return both `"we're not done yet."` and
 * `MAYA: "we're not done yet."`, and a stray quote character is something a
 * voice will happily pause around.
 *
 * The closing quote is only removed when an opening one was found, so an
 * apostrophe that happens to end a line (a possessive, say) survives.
 */
function stripSpokenQuotes(text) {
  const match = text.match(/^((?:[A-Za-z][A-Za-z0-9 .'\-]{0,24}:\s*)?)["\u201c\u2018']\s*([\s\S]*)$/);
  if (!match) return text;
  const [, speaker, body] = match;
  return `${speaker}${body.replace(/["\u201d\u2019']\s*$/, "").trim()}`;
}

/**
 * The text actually handed to text-to-speech.
 *
 * Strips a leading speaker label — "MAYA:", "Dr. Ellis:" — which the editor
 * shows on purpose but which a voice would otherwise read out as part of the
 * line ("emm ay wye ay, we're not done yet").
 */
export function toSpokenLine(text) {
  return cleanDialogueLine(
    String(text || "").replace(/^\s*[A-Za-z][A-Za-z0-9 .'\-]{0,24}:\s*/, "")
  );
}

/**
 * How long a scene will actually run once assembled.
 *
 * Both assemblers size a scene to max(visual, its own voice track) — see
 * buildSceneClip in server-render/lane1.js and render.js — so a scene with a
 * six-second line does not end after five seconds of picture. Every duration
 * the page quotes or derives (the runtime estimate, the length of music it
 * asks for) has to use the same rule or it will describe a different video
 * from the one that gets rendered.
 */
export function sceneRuntimeSeconds(scene) {
  return Math.max(Number(scene?.seconds) || 0, Number(scene?.voiceSeconds) || 0);
}

export default function QuickCreate() {
  const qc = useQueryClient();
  // AppLayout supplies this via <Outlet context>. Defaults keep the page
  // usable if it is ever rendered outside that shell.
  const { userTier = 0, isAdmin = false } = useOutletContext() || {};
  const canMotion = isAdmin || userTier >= MOTION_MIN_TIER;
  // Movie Maker Pro is a paid-tier page — same gate the sidebar applies to
  // its own /movie-maker entry, admins exempt.
  const canMovieMaker = isAdmin || userTier >= MOVIE_MAKER_MIN_TIER;

  // "motion" = real generative video (Kling, one clip per scene).
  // "slideshow" = Studio visuals — the FFmpeg Ken Burns pan over stills
  // generated on Base44 credits.
  //
  // Studio visuals are the DEFAULT for everyone, including entitled users.
  // A real AI clip costs two to three minutes per scene on top of paid
  // credits, so defaulting to it made the primary path in Quick Create both
  // the slowest and the most expensive one — a three-scene short spent the
  // better part of ten minutes generating before it could be assembled.
  // Real AI video is one click away at the storyboard step and clearly
  // labelled there; it is a choice rather than the toll on the front door.
  const [motionMode, setMotionMode] = useState("slideshow");
  const useMotion = canMotion && motionMode === "motion";
  const [motionProgress, setMotionProgress] = useState(0);
  const [clipGenerating, setClipGenerating] = useState({});
  // Live status of the clip currently generating: { status, elapsedMs,
  // index, total }. A clip takes two to three minutes on a worker that runs
  // one job at a time, so without this a healthy multi-scene run looks
  // exactly like a hang.
  const [clipStatus, setClipStatus] = useState(null);
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
  // [{ imageUrl, text, seconds, videoUrl?, dialogue?, voiceUrl?, voiceSeconds? }]
  const [scenes, setScenes] = useState([]);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [storyboardProgress, setStoryboardProgress] = useState(0);
  // Speech shape and music are independent — see NARRATION_MODES. The old
  // single audioMode is gone; it is what made "Voiceover" mean "and throw
  // the music away".
  const [narrationMode, setNarrationMode] = useState("dialogue");
  const [musicEnabled, setMusicEnabled] = useState(true);
  // Optional reference the user pastes or uploads: their own dialogue,
  // character names, a script fragment. Fed to the dialogue writer as the
  // source of truth rather than merely as inspiration.
  const [dialogueReference, setDialogueReference] = useState("");
  const [dialogueReferenceName, setDialogueReferenceName] = useState("");
  const [writingDialogue, setWritingDialogue] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState({}); // scene index -> bool
  const [voiceBatch, setVoiceBatch] = useState(null);   // { done, total } | null
  const [voiceoverUrl, setVoiceoverUrl] = useState("");
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [muxProgress, setMuxProgress] = useState(0);
  const [videoResult, setVideoResult] = useState("");
  const [videoSaved, setVideoSaved] = useState(false);

  const resetVideoPipeline = () => {
    setStep(0); setScript(""); setScenes([]); setVoiceoverUrl("");
    setMusicUrl(""); setMusicName(""); setGeneratingMusic(false); setVideoResult(""); setVideoSaved(false);
    setVoiceLoading({}); setVoiceBatch(null);
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
              aspectRatio: videoRatio,
              onProgress: ({ status, elapsedMs }) => setClipStatus({
                status, elapsedMs, index: i + 1, total: built.length,
              }),
            });
            if (clipUrl) {
              built[i] = { ...built[i], videoUrl: clipUrl };
              setScenes([...built]);
            }
          } catch (clipError) {
            // A provider billing failure will hit every remaining scene
            // identically, so stop rather than issuing one warning per scene.
            // It is also the one failure here an operator can actually fix,
            // which is why it gets the error slot instead of the warning list.
            if (clipError?.billing) {
              setError(`${clipError.message} Finishing as a cinematic slideshow — real AI video resumes once the provider account is funded.`);
              setMotionMode("slideshow");
              break;
            }
            // Any other failed clip is not fatal — the scene keeps its still
            // image and the assembler pans it instead, so the render still
            // completes.
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

  // ── Step 4 (Dialogue & Audio) ──

  // Total runtime the assembler will actually produce. Not the sum of clip
  // lengths: a scene stretches to fit its own dialogue line.
  const totalRuntimeSeconds = () => scenes.reduce((sum, scene) => sum + sceneRuntimeSeconds(scene), 0);

  const handleDialogueReferenceUpload = async (file) => {
    if (!file) return;
    setError("");
    try {
      // Read in the browser rather than uploading: this text is a prompt
      // input, not an asset, and nothing downstream needs a URL for it.
      const text = await file.text();
      if (!text.trim()) throw new Error("That file is empty.");
      setDialogueReference(text.slice(0, 20000));
      setDialogueReferenceName(file.name);
    } catch (e) {
      setError(e?.message || "Could not read that file — plain text (.txt) works best.");
    }
  };

  /**
   * Writes one spoken line per scene.
   *
   * Runs on Base44's own AI credits (generateText -> InvokeLLM, with the
   * platform's OpenAI fallback behind it), so this costs nothing extra on
   * top of the plan.
   *
   * The scene text it is given describes what is on screen; the job here is
   * to turn that into something a person in the shot would SAY. That
   * distinction is the whole of the "no feeling of characters talking"
   * complaint — the previous step fed the scene descriptions to
   * text-to-speech more or less verbatim, which can only ever sound like
   * narration about the picture.
   */
  const writeDialogue = async () => {
    if (!scenes.length) { setError("Generate the storyboard first."); return; }
    setError(""); setWritingDialogue(true);
    try {
      const numbered = scenes.map((scene, i) => `${i + 1}. ${scene.text || ""}`).join("\n");
      const reference = dialogueReference.trim()
        ? `\n\nThe user supplied their own dialogue reference. Treat it as the source of truth for the characters, their names, their voice, and any lines that fit — do not invent a different cast:\n"""\n${dialogueReference.trim().slice(0, 6000)}\n"""`
        : "";
      const result = await generateText({
        type: "script",
        prompt:
          `Write the spoken DIALOGUE for a ${scenes.length}-scene short video about: ${prompt || script}.\n\n` +
          `Speak AS the people on screen, in their own words. Do not describe them, do not narrate the picture, ` +
          `and do not write in the third person. Exactly one line per scene, short enough to say aloud in about ` +
          `${MOTION_CLIP_SECONDS} seconds. Where a character has a name, prefix their line with it, like "MAYA: ...". ` +
          `Prefix every line with its scene number and a pipe: "1| MAYA: ...". ` +
          `No scene labels, no stage directions, no parentheticals, no quotation marks around the line.\n\n` +
          `Scenes (what is on screen):\n${numbered}${reference}`,
        tone: "Conversational",
      });
      const lines = parseDialogueLines(result, scenes.length);
      if (!lines.some(Boolean)) {
        throw new Error("The dialogue came back empty. Try again, or type the lines in yourself.");
      }
      // A rewritten line invalidates the audio already generated for it.
      setScenes(prev => prev.map((scene, i) => (
        lines[i] ? { ...scene, dialogue: lines[i], voiceUrl: "", voiceSeconds: 0 } : scene
      )));
    } catch (e) {
      setError(e?.message || "Dialogue generation failed.");
      if (e?.upgradeRequired) setUpgradeRequired(true);
    }
    setWritingDialogue(false);
  };

  /**
   * Speaks one scene's line and attaches it to that scene.
   *
   * The result is UPLOADED, not kept as an object URL: a `blob:` URL is
   * valid only inside the tab that created it, and the render worker has to
   * fetch this over the network. (A persisted blob: URL is exactly what used
   * to make a Movie Maker render fail outright.)
   */
  const generateSceneVoice = async (index) => {
    const scene = scenes[index];
    const line = (scene?.dialogue || "").trim();
    if (!line) { setError(`Scene ${index + 1} has no dialogue yet.`); return false; }
    setVoiceLoading(prev => ({ ...prev, [index]: true }));
    setError("");
    let ok = false;
    try {
      const blob = await generateVoiceover(toSpokenLine(line));
      if (!blob) throw new Error("No audio was produced for this line.");
      const url = await uploadFile(new File([blob], `scene-${index + 1}-line.mp3`, { type: blob.type || "audio/mpeg" }));
      if (!url) throw new Error("Uploading the line's audio failed.");
      // Measure it while the audio is in hand — the runtime estimate and the
      // length of music we ask for both depend on it.
      const objectUrl = URL.createObjectURL(blob);
      const voiceSeconds = (await probeMediaDuration(objectUrl, "audio")) || 0;
      URL.revokeObjectURL(objectUrl);
      setScenes(prev => prev.map((item, i) => i === index ? { ...item, voiceUrl: url, voiceSeconds } : item));
      ok = true;
    } catch (e) {
      setError(e?.message || `Scene ${index + 1}: voice generation failed.`);
      if (e?.upgradeRequired) setUpgradeRequired(true);
    }
    setVoiceLoading(prev => ({ ...prev, [index]: false }));
    return ok;
  };

  // Sequential on purpose: text-to-speech returns in seconds, and one line
  // at a time keeps the per-scene spinners meaningful.
  const generateAllSceneVoices = async () => {
    const pending = scenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => (scene.dialogue || "").trim() && !scene.voiceUrl);
    if (!pending.length) return;
    setVoiceBatch({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      const ok = await generateSceneVoice(pending[i].index);
      setVoiceBatch({ done: i + 1, total: pending.length });
      if (!ok) break; // a refusal (plan, allowance, consent) will refuse the rest identically
    }
    setVoiceBatch(null);
  };

  const generateVoiceoverStep = async () => {
    if (!scenes.length) { setError("Generate the storyboard first."); return; }
    setError(""); setGeneratingVoiceover(true);
    try {
      // Rewrite the storyboard's written text into natural spoken narration
      // first, the same idea as Movie Maker's toSpokenDialogue — feeding the
      // raw scene descriptions to TTS verbatim is what made the voiceover
      // read as flat description rather than a voice actually speaking the
      // script. Best-effort: the verbatim text is the fallback.
      const raw = scenes.map(s => s.text).join(". ");
      let spoken = raw;
      try {
        const rewritten = await generateText({
          type: "script",
          prompt: `Rewrite the following as natural, conversational spoken narration only — remove any scene labels, visual directions, parentheticals, or stage directions, and phrase it the way a narrator would actually say it aloud. Return plain spoken text only, nothing else.\n\n${raw}`,
          tone: "Professional",
        });
        if (rewritten?.trim()) spoken = rewritten.trim();
      } catch { /* verbatim fallback */ }
      const blob = await generateVoiceover(spoken);
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

  const generateAiMusic = async () => {
    if (!canMotion) {
      setError("Your plan does not include AI music generation.");
      setUpgradeRequired(true);
      return;
    }
    setGeneratingMusic(true); setError(""); setUpgradeRequired(false);
    try {
      // Scored to the runtime the assembler will actually produce, which
      // includes each scene's dialogue stretch — asking for the sum of clip
      // lengths writes a track that runs out before the video does. Capped
      // the same way Movie Maker caps it: a track shorter than the film is
      // not a problem (the worker extends it with crossfaded repeats), but a
      // request for minutes of audio in one run reliably times out.
      const durationSeconds = Math.min(
        MAX_MUSIC_SECONDS,
        Math.max(10, Math.round(totalRuntimeSeconds()) || 30),
      );
      const result = await generateMusic({
        prompt: `Cinematic background score matching this short video: ${prompt}`,
        durationSeconds,
        instrumental: true,
        mood: "cinematic",
      });
      if (!result?.url) throw new Error("No music track was produced.");
      setMusicUrl(result.url);
      setMusicName("AI-generated background music");
    } catch (e) {
      const message = e?.response?.data?.error || e?.message || "AI music generation failed.";
      setError(message);
      if (/plan|subscription|upgrade|403/i.test(message)) setUpgradeRequired(true);
    }
    setGeneratingMusic(false);
  };

  const generateSingleClip = async (scene, index) => {
    if (!scene?.imageUrl) return setError("Generate the scene image first.");
    setError("");
    setMotionProgress(0);
    setClipGenerating(prev => ({ ...prev, [index]: true }));
    try {
      const clipUrl = await generateSceneVideo({
        prompt: scene.text || prompt,
        imageUrl: scene.imageUrl,
        durationSeconds: MOTION_CLIP_SECONDS,
        aspectRatio: videoRatio,
        onProgress: ({ status, elapsedMs }) => setClipStatus({
          status, elapsedMs, index: index + 1, total: scenes.length,
        }),
      });
      if (!clipUrl) throw new Error("No video clip was produced.");
      setScenes(prev => prev.map((item, i) => i === index ? { ...item, videoUrl: clipUrl, seconds: MOTION_CLIP_SECONDS } : item));
      setMotionProgress(1);
    } catch (e) {
      const detail = e?.response?.data?.error || e?.message || `Scene ${index + 1} video generation failed.`;
      setError(e?.billing
        ? `${detail} Real AI video resumes once the provider account is funded.`
        : detail);
    }
    setClipGenerating(prev => ({ ...prev, [index]: false }));
    setClipStatus(null);
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
      // Every audio source is independent, and every one that exists is
      // sent. This is the fix for "the music was generated but the video came
      // back with only the voiceover": the old single audioMode could name
      // exactly one, and quietly dropped the other.
      const wantsDialogue = narrationMode === "dialogue";
      const wantsNarration = narrationMode === "narration";

      // Only URLs the worker can actually fetch. A `blob:` URL is valid only
      // in the tab that created it and would 404 on the worker.
      const payloadScenes = scenes.map(scene => ({
        ...scene,
        voiceUrl: wantsDialogue && scene.voiceUrl && !/^blob:/i.test(scene.voiceUrl)
          ? scene.voiceUrl
          : undefined,
      }));

      const projectVoiceoverUrl = wantsNarration && voiceoverUrl && !/^blob:/i.test(voiceoverUrl)
        ? voiceoverUrl
        : undefined;
      const projectMusicUrl = musicEnabled && musicUrl && !/^blob:/i.test(musicUrl) ? musicUrl : undefined;

      const spokenScenes = payloadScenes.filter(scene => scene.voiceUrl).length;
      const scenesWithDialogue = scenes.filter(scene => (scene.dialogue || "").trim()).length;

      if (wantsDialogue && scenesWithDialogue && !spokenScenes) {
        setWarnings(prev => [...prev, "Dialogue was written but none of it has been spoken yet — the video will render without speech. Use \u201cSpeak all lines\u201d first."]);
      } else if (wantsDialogue && spokenScenes && spokenScenes < scenesWithDialogue) {
        setWarnings(prev => [...prev, `${scenesWithDialogue - spokenScenes} scene(s) still have unspoken dialogue — those scenes will render silent.`]);
      }
      if (wantsNarration && !projectVoiceoverUrl) {
        setWarnings(prev => [...prev, "No narration was generated — the video will render without it."]);
      }
      if (musicEnabled && !projectMusicUrl) {
        setWarnings(prev => [...prev, "No music track was generated or uploaded — the video will render without music."]);
      }

      // Two assemblers, picked by what the scenes actually contain. The Lane 2
      // render worker understands scene.videoUrl and stitches real clips;
      // assembleLane1Video only knows how to Ken Burns a still. Routing on the
      // scenes rather than on the toggle means a partial failure above (some
      // clips generated, some not) still assembles correctly — render.js
      // already falls back to the still for any scene lacking a videoUrl.
      const hasClips = payloadScenes.some(scene => scene.videoUrl);
      let url;

      if (hasClips) {
        const jobId = await submitRender({
          scenes: payloadScenes, ratio: videoRatio, resolution,
          voiceoverUrl: projectVoiceoverUrl,
          musicUrl: projectMusicUrl,
        });
        const renderStartedAt = Date.now();
        for (;;) {
          if (Date.now() - renderStartedAt > 20 * 60 * 1000) {
            throw new Error("Video assembly timed out after 20 minutes. Please try again.");
          }
          await new Promise(r => setTimeout(r, 4000));
          const job = await getRenderStatus(jobId);
          if (typeof job?.progress === "number") setMuxProgress(job.progress);
          if (job?.status === "done") { url = job.url; break; }
          if (job?.status === "error") throw new Error(job.error || "Video assembly failed.");
        }
      } else {
        // No audioMode: that field is the legacy one-of-three gate, and
        // omitting it is what lets narration, per-scene dialogue and music
        // all reach the mix (see assembleLane1Video's docblock).
        url = await assembleLane1Video({
          scenes: payloadScenes, ratio: videoRatio, resolution,
          voiceoverUrl: projectVoiceoverUrl,
          musicUrl: projectMusicUrl,
        }, { onProgress: setMuxProgress });
      }

      if (!url) throw new Error("Video assembly completed without a playable result.");
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
        <p className="text-muted-foreground text-sm mt-0.5">Generate a standalone image (one click) or a short video (guided steps) — script, dialogue, visuals and voices on your plan&apos;s built-in AI credits.</p>
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

      {/* Which maker builds this video. Quick Create IS the Studio path —
          Base44's own AI credits for script, dialogue, images and narration,
          then FFmpeg assembly — and Movie Maker Pro is the premium route,
          which is a separate page rather than a mode of this one. Naming both
          here means the choice is visible at the point it's made instead of
          being something you had to already know about. */}
      {outputType === "video" && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl border-2 border-fuchsia-500/50 bg-fuchsia-500/5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Create with Studio</p>
                <p className="text-[10px] font-bold tracking-widest text-fuchsia-400 uppercase">You are here</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
              Script, dialogue, images and voices on your plan&apos;s built-in AI credits, assembled here.
              Fast, and the primary way to make a video. Real AI motion clips are an option at the storyboard step.
            </p>
          </div>

          {canMovieMaker ? (
            <Link to="/movie-maker"
              className="group p-4 rounded-2xl border border-border bg-card hover:border-cyan-500/40 transition-all">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                  <Clapperboard className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    Movie Maker Pro
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
                  </p>
                  <p className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">Premium</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                Multi-shot scenes, reference locking for character consistency, dubbing, lip-sync and captions.
                For films rather than shorts.
              </p>
            </Link>
          ) : (
            <div className="p-4 rounded-2xl border border-border bg-card opacity-80">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Movie Maker Pro</p>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Paid tiers only</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                Multi-shot scenes, reference locking, dubbing, lip-sync and captions.{" "}
                <Link to="/pricing" className="text-fuchsia-400 hover:underline font-semibold">See plans</Link>
              </p>
            </div>
          )}
        </div>
      )}

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

                {/* Motion mode. This step once always produced stills that
                    were later panned by FFmpeg, so "Short Video" returned what
                    reads as a slideshow with no way to say otherwise. Both
                    options are explicit, and both costs — credits AND minutes —
                    are stated rather than discovered. Studio visuals are the
                    default: see the motionMode initialiser. */}
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
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-1">
                        A genuinely moving clip per scene. Costs premium credits and takes about 2-3 minutes per scene.
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
                        <ImageIcon className="w-3.5 h-3.5" /> Studio visuals
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-1">
                        Generated stills with a slow cinematic pan and zoom, on your plan&apos;s AI credits. Ready in seconds. The default.
                      </span>
                    </button>
                  </div>
                  {!canMotion && (
                    <p className="text-[11px] text-muted-foreground">
                      <Link to="/pricing" className="text-fuchsia-400 hover:underline font-semibold">Upgrade</Link>
                      {" "}to generate real motion clips instead of Studio visuals.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Video format</label>
                  <div className="flex gap-2 flex-wrap">
                    {VIDEO_RATIOS.map(r => (
                      <button key={r} type="button" onClick={() => setVideoRatio(r)} disabled={generatingStoryboard}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${videoRatio === r ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
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
                {/* Live status for the clip currently generating. The
                    percentage on the button above only counts COMPLETED
                    clips, so during a single 2-3 minute generation it sits
                    frozen — this is the line that shows the run is alive.
                    "queued" matters too: the render worker runs one job at a
                    time, so a clip can legitimately be waiting its turn. */}
                {clipStatus && (
                  <p className="text-[11px] text-fuchsia-400/90 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    {clipStatus.status === "queued"
                      ? "Queued — the render worker is busy with another job"
                      : `Generating clip ${clipStatus.index} of ${clipStatus.total}`}
                    {` · ${Math.round((clipStatus.elapsedMs || 0) / 1000)}s elapsed`}
                    <span className="text-muted-foreground">· usually 2-3 min per clip</span>
                  </p>
                )}
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
                <p className="text-sm text-muted-foreground">{scenes.length} scenes · {scenes.reduce((a, s) => a + (Number(s.seconds) || 8), 0)}s total. Choose the format for the final short.</p>
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {scenes.map((s, i) => (
                    <div key={i} className="space-y-1.5">
                      {s.videoUrl ? (
                        <video src={s.videoUrl} controls muted playsInline className="w-full aspect-video object-cover rounded-lg border border-border" />
                      ) : (
                        <img src={s.imageUrl} alt="" className="w-full aspect-video object-cover rounded-lg border border-border" />
                      )}
                      {useMotion && (
                        <button type="button" onClick={() => generateSingleClip(s, i)} disabled={clipGenerating[i]}
                          className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-fuchsia-500/30 text-[10px] font-semibold text-fuchsia-400 hover:bg-fuchsia-500/10 disabled:opacity-50">
                          {clipGenerating[i] && <Loader2 className="w-3 h-3 animate-spin" />}
                          {clipGenerating[i] ? "Generating…" : s.videoUrl ? "Regenerate clip" : "Generate video clip"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Dialogue & Audio.
                Speech and music are separate controls now. Previously this
                step was a single three-way choice, so selecting a voiceover
                threw away a music track the user had already generated —
                which is exactly what "only voice over, no music" was. */}
            {step === 4 && (
              <div className="space-y-5">
                <h3 className="font-semibold text-foreground">Dialogue &amp; Audio</h3>

                {/* ── Speech ── */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide">Speech</label>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {NARRATION_MODES.map(m => (
                      <button key={m.id} type="button" onClick={() => setNarrationMode(m.id)}
                        aria-pressed={narrationMode === m.id}
                        className={`text-left p-3 rounded-lg border transition-all ${narrationMode === m.id ? "bg-fuchsia-500/15 border-fuchsia-500/50" : "border-border hover:bg-muted/20"}`}>
                        <span className={`flex items-center gap-1.5 text-sm font-bold ${narrationMode === m.id ? "text-fuchsia-400" : "text-foreground"}`}>
                          <m.icon className="w-3.5 h-3.5" /> {m.label}
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-1 leading-relaxed">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {narrationMode === "dialogue" && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    {/* Reference script. Optional, and the point of it is
                        that the user's own characters and lines win over
                        anything the model would invent. */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Reference dialogue (optional)</label>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" /> Upload .txt
                          <input type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden"
                            onChange={e => { handleDialogueReferenceUpload(e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                      </div>
                      <textarea value={dialogueReference} onChange={e => { setDialogueReference(e.target.value); setDialogueReferenceName(""); }}
                        rows={4} placeholder="Paste your own dialogue, character names, or a script fragment. Anything here is treated as the source of truth for who speaks and how."
                        className="w-full rounded-xl border border-input bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                      {dialogueReferenceName && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Loaded from {dialogueReferenceName}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={writeDialogue} disabled={writingDialogue || !scenes.length}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                        {writingDialogue ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                        {writingDialogue ? "Writing dialogue…" : scenes.some(sc => sc.dialogue) ? "Rewrite dialogue" : "Write dialogue"}
                      </button>
                      <button type="button" onClick={generateAllSceneVoices}
                        disabled={!!voiceBatch || !scenes.some(sc => (sc.dialogue || "").trim() && !sc.voiceUrl)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20 disabled:opacity-40">
                        {voiceBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                        {voiceBatch ? `Speaking line ${voiceBatch.done + 1} of ${voiceBatch.total}…` : "Speak all lines"}
                      </button>
                    </div>

                    {/* Per-scene lines. Editable, because a line the user
                        writes themselves should be no harder than one the
                        model wrote. */}
                    <div className="space-y-2">
                      {scenes.map((sc, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <img src={sc.imageUrl} alt="" className="w-16 aspect-video object-cover rounded-md border border-border shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <textarea
                              value={sc.dialogue || ""}
                              onChange={e => {
                                const value = e.target.value;
                                setScenes(prev => prev.map((item, idx) => idx === i ? { ...item, dialogue: value, voiceUrl: "", voiceSeconds: 0 } : item));
                              }}
                              rows={2}
                              placeholder={`Scene ${i + 1} line — e.g. "MAYA: we're not done yet."`}
                              className="w-full rounded-lg border border-input bg-background text-xs p-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                            <div className="flex items-center gap-2 flex-wrap">
                              <button type="button" onClick={() => generateSceneVoice(i)}
                                disabled={voiceLoading[i] || !(sc.dialogue || "").trim()}
                                className="flex items-center gap-1 px-2 py-1 rounded-md border border-fuchsia-500/30 text-[10px] font-semibold text-fuchsia-400 hover:bg-fuchsia-500/10 disabled:opacity-40">
                                {voiceLoading[i] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                                {voiceLoading[i] ? "Speaking…" : sc.voiceUrl ? "Re-speak" : "Speak line"}
                              </button>
                              {sc.voiceUrl && (
                                <>
                                  <audio src={sc.voiceUrl} controls className="h-7 max-w-[220px]" />
                                  <span className="text-[10px] text-muted-foreground">
                                    scene runs {Math.round(sceneRuntimeSeconds(sc))}s
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Each line is cut to its own scene, and a scene is held open until its line finishes — that is what keeps speech in sync with the picture.
                    </p>
                  </div>
                )}

                {narrationMode === "narration" && (
                  <div className="space-y-2">
                    <button onClick={generateVoiceoverStep} disabled={generatingVoiceover}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">
                      {generatingVoiceover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      {voiceoverUrl ? "Regenerate Narration" : "Generate Narration"}
                    </button>
                    {voiceoverUrl && <audio src={voiceoverUrl} controls className="w-full" />}
                  </div>
                )}

                {/* ── Music — independent of everything above ── */}
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Background music</label>
                    <button type="button" onClick={() => setMusicEnabled(v => !v)} aria-pressed={musicEnabled}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${musicEnabled ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
                      {musicEnabled ? <Music className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      {musicEnabled ? "On" : "Off"}
                    </button>
                  </div>
                  {musicEnabled && (
                    <div className="w-full max-w-md space-y-2">
                      <button type="button" onClick={generateAiMusic} disabled={generatingMusic || !canMotion}
                        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-50">
                        {generatingMusic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {generatingMusic ? "Generating AI music…" : musicUrl ? "Regenerate AI Music" : "Generate AI Music"}
                      </button>
                      {!canMotion && <p className="text-[11px] text-muted-foreground">AI music is available on Agency and Movie Maker Pro plans. You can still upload your own track.</p>}
                      <label className="w-full flex items-center gap-3 p-3 rounded-xl border border-border text-left cursor-pointer hover:bg-muted/20 transition-all">
                        <Music className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-sm text-muted-foreground truncate">{uploadingMusic ? "Uploading…" : musicName || "Or upload a music track"}</span>
                        {uploadingMusic ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : musicUrl ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : null}
                        <input type="file" accept="audio/*" className="hidden" disabled={uploadingMusic}
                          onChange={e => { handleMusicUpload(e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                      {musicUrl && <audio src={musicUrl} controls className="w-full" />}
                      <p className="text-[11px] text-muted-foreground">
                        Music plays underneath any speech, ducked so the words stay clear — it is no longer one or the other.
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Estimated runtime: ~{Math.round(totalRuntimeSeconds())}s
                </p>
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