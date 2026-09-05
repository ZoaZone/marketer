import { useState, useRef, useEffect } from "react";
import { useOutletContext, Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { useMovieProjectPersistence } from "@/hooks/use-movie-project-persistence";
import { useAutoDemoFromUrl } from "@/hooks/use-auto-demo-from-url";
import PageHeader from "@/components/ui/PageHeader";
import {
  Film, Sparkles, Lock, Plus, Trash2, Loader2, ChevronRight,
  ChevronLeft, Mic, Music, Globe, Upload, Check, AlertCircle,
  X, Download, Save, Wand2, Languages, Image as ImageIcon,
  Type, Play, Volume2, FilePlus2, CloudOff,
} from "lucide-react";
// Lane 2 (Movie Maker Pro) page — imports only from @/utils/lane2, never
// @/utils/lane1 directly (enforced by eslint.config.js's lane guard). Lane
// 2 is the only lane allowed to reach the paid Replicate/ElevenLabs
// generation endpoints (generateSceneVideo/Kling, generateMusic/ElevenLabs Music,
// dubAudioFile/dubVideoFile/ElevenLabs) alongside the shared FFmpeg
// assembly route (submitRender/getRenderStatus).
import { generateText, generateVoiceover, generateMusic, MAX_MUSIC_SECONDS, uploadFile, generateImage, splitScriptIntoScenes, submitRender, getRenderStatus, generateSceneVideo, dubAudioFile, dubVideoFile as dubVideoJob } from "@/utils/lane2";
// dubVideoFile (the aiClient job function) is imported as dubVideoJob — the
// Dubbing Studio already has a dubVideoFile *state variable* holding the
// raw uploaded File object for the manual translate+voiceover flow below,
// and the two would otherwise collide.
// videoAssembler.js's assembleVideo (client-side Canvas+MediaRecorder render)
// is kept in the repo as a fallback but is no longer called here — Export
// now renders server-side via the standalone render worker (submitRender/
// getRenderStatus), which supports real per-scene audio, longer films, and
// doesn't depend on the browser staying open for the whole render.

const LANGUAGES = [
  "English", "Spanish", "French", "German", "Portuguese", "Hindi", "Arabic",
  "Japanese", "Korean", "Chinese (Mandarin)", "Italian", "Russian", "Tamil",
  "Telugu", "Bengali", "Turkish", "Dutch", "Polish", "Vietnamese", "Thai",
];

const GENRES = ["Drama", "Documentary", "Comedy", "Action", "Romance", "Horror", "Thriller", "Animation", "Educational", "Corporate"];

const STEPS = [
  { id: "story",     label: "Script",         icon: Wand2 },
  { id: "reference", label: "Reference Lock", icon: ImageIcon },
  { id: "scenes",    label: "Scenes",         icon: Film },
  { id: "voiceover", label: "Voiceover",      icon: Mic },
  { id: "music",     label: "Music",          icon: Music },
  { id: "export",    label: "Export",         icon: Download },
  { id: "dubbing",   label: "Dubbing",        icon: Languages },
];

const DUBBING_STEPS = ["upload", "script", "translate", "preview", "download"];

// ISO 639-1 codes for the ElevenLabs Dubbing API's target_lang/source_lang
// fields — distinct from LANGUAGES above (full names used for the
// script-generation/translation prompts, which take a language name, not a
// code).
const DUB_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Mandarin)" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
];

// Configurable scene cap — was implicitly 3 (the initial scenes state below
// used to be exactly 3 hard-coded newScene() calls with nothing anywhere
// stopping "Add Scene" from going further); raised to a real, explicit
// limit so long-form films are possible without becoming unbounded.
const MAX_SCENES = 12;

function newScene(n) {
  return {
    id: Date.now() + n, text: "", caption: "", imageUrl: "", videoUrl: "", voiceBlob: null, voiceUrl: "",
    // Starts matching the default AI-clip chip (5s) so a fresh scene's
    // "Scene duration" label/slider isn't visibly out of sync with the
    // highlighted chip before the user touches either control.
    duration: 5, clipDuration: 5,
    // Multi-shot chaining: 1-3 clips generated back-to-back for this one
    // scene. Empty by default — see sceneHasVisual/sceneDuration below for
    // the backward-compatible fallback to the single videoUrl/duration.
    clips: [], shotsPerScene: 1,
  };
}

// A scene is ready to assemble once it has a visual — a chained set of
// video clips, a single generated video clip, or a still image. Used
// everywhere the assemble/export flow needs to know which scenes actually
// have something to render.
const sceneHasVisual = (s) => Boolean((s.clips && s.clips.length) || s.videoUrl || s.imageUrl);

// A scene's duration in the final timeline: the sum of its chained clips'
// own durations when it has any (each clip contributes its actual length,
// so a 3-shot scene of 5s+10s+5s occupies 20s) — otherwise the free-range
// scene.duration, exactly as before. This is the single place that
// decision is made; every timing computation below (assembly payload,
// subtitles, duration estimates) goes through this instead of reading
// scene.duration directly, so they can't drift out of sync with each other.
const sceneDuration = (s) =>
  (s.clips && s.clips.length) ? s.clips.reduce((sum, c) => sum + (Number(c.duration) || 0), 0) : Math.max(5, s.duration);

// The AI video-clip model (Kling) only accepts specific discrete durations —
// this is separate from scene.duration, which is how long the scene occupies
// in the final assembled timeline (free-range, still governs the Ken-Burns
// still-image path and any clip's time-clamped placement) and stays
// unconstrained. Only the text-to-video generation request itself is limited
// to these values.
const VALID_CLIP_DURATIONS = [5, 10];
const clampToValidClipDuration = (value) =>
  VALID_CLIP_DURATIONS.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest
  );

// How many chained clips generateSceneVideoClip generates for one scene.
const SHOT_COUNTS = [1, 2, 3];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Strip markdown/symbols, scene/shot labels, timecodes, and stage
// directions before TTS, leaving only spoken dialogue/narration.
function toSpeakable(text) {
  return (text || "")
    .replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[[^\]]+\]/g, "") // bracketed asides/timecodes, e.g. "[00:12]", "[Timecode]"
    .replace(/^\s*(?:scene|shot)\s*\d+\s*[:\-]?\s*/gim, "") // scene/shot labels, e.g. "SCENE 1:", "Shot 2 -"
    .replace(/^\s*\([^)]*\)\s*$/gm, "") // whole-line stage directions, e.g. "(smiling warmly)"
    .replace(/^\s*[-•]\s/gm, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\n{2,}/g, "\n") // collapse blank lines left behind by the removals above
    .trim();
}

function toSrtTimestamp(totalSeconds) {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hh = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const mmm = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

// entries: [{ start, end, text }] with start/end in seconds.
function buildSrt(entries) {
  return entries
    .map((e, i) => `${i + 1}\n${toSrtTimestamp(e.start)} --> ${toSrtTimestamp(e.end)}\n${e.text}\n`)
    .join("\n");
}

export default function MovieMaker() {
  const { user, userTier, isAdmin } = useOutletContext();
  const musicInputRef = useRef();
  const dubVideoRef = useRef();
  const fileInputRefs = useRef({});

  // Auto Demo from URL — a self-contained pipeline (capture -> script ->
  // voice -> music -> assemble -> save) independent of the manual
  // script/scenes wizard state below; see use-auto-demo-from-url.js.
  const autoDemo = useAutoDemoFromUrl(user);
  const [demoUrl, setDemoUrl] = useState("");
  const AUTO_DEMO_IDLE_PHASES = ["idle", "done", "error", "login_required", "login_failed"];
  // Phase 2: optional authenticated capture. showDemoLogin gates whether
  // any of this is even sent — off by default, and demoPassword is cleared
  // immediately after a generate() call fires (see handleGenerateDemo)
  // rather than lingering in state for the rest of the session.
  const [showDemoLogin, setShowDemoLogin] = useState(false);
  const [useDemoSessionToken, setUseDemoSessionToken] = useState(false);
  const [showDemoLoginAdvanced, setShowDemoLoginAdvanced] = useState(false);
  const [demoLoginUrl, setDemoLoginUrl] = useState("");
  const [demoUsername, setDemoUsername] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [demoUsernameField, setDemoUsernameField] = useState("");
  const [demoPasswordField, setDemoPasswordField] = useState("");
  const [demoSubmitSelector, setDemoSubmitSelector] = useState("");
  const [demoSuccessSelector, setDemoSuccessSelector] = useState("");
  const [demoLoginConsent, setDemoLoginConsent] = useState(false);

  const handleGenerateDemo = () => {
    const credentials = showDemoLogin
      ? {
          loginUrl: demoLoginUrl.trim() || undefined,
          usernameField: demoUsernameField.trim() || undefined,
          passwordField: demoPasswordField.trim() || undefined,
          submitSelector: demoSubmitSelector.trim() || undefined,
          successSelector: demoSuccessSelector.trim() || undefined,
          username: demoUsername,
          password: demoPassword,
        }
      : undefined;
    autoDemo.generate(demoUrl, { credentials, consented: demoLoginConsent, useSessionToken: useDemoSessionToken || undefined });
    // The password (and username) only ever need to exist in state for
    // this one submit — clear them immediately rather than leaving them
    // sitting in memory/React DevTools for the rest of the session.
    setDemoPassword("");
    setDemoUsername("");
  };

  // Core state
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [titleCard, setTitleCard] = useState(true);
  const [genre, setGenre] = useState("Drama");
  const [storyPrompt, setStoryPrompt] = useState("");
  const [script, setScript] = useState("");
  const [scenes, setScenes] = useState([newScene(0), newScene(1), newScene(2)]);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicFile, setMusicFile] = useState(null);
  const [musicLoading, setMusicLoading] = useState(false);
  const [language, setLanguage] = useState("English");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState({});
  const [imgLoading, setImgLoading] = useState({});
  const [sceneVideoLoading, setSceneVideoLoading] = useState({});
  const [uploadLoading, setUploadLoading] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState(0);
  // Which scene the render worker is currently on, for long films where a
  // single overall percent doesn't say much — null until the first status
  // response with scene info comes back (short-lived job kinds, or an early
  // poll before renderProject reaches its per-scene stage, never set these).
  const [renderSceneIndex, setRenderSceneIndex] = useState(null);
  const [renderSceneTotal, setRenderSceneTotal] = useState(null);
  const [warnings, setWarnings] = useState([]);

  // ── Project persistence (MovieProject entity) ─────────────────────────
  // Everything above lived only in this component's React state — a reload
  // wiped the script, scenes, generated clip/voiceover/music URLs, all of
  // it. This hook debounce-saves a snapshot on every meaningful change and
  // reloads the most recent (or ?projectId=-specified) project on mount.
  const movieProject = useMovieProjectPersistence(user);
  const [projectHydrated, setProjectHydrated] = useState(false);
  const location = useLocation();

  // Strip voiceBlob (a browser-only, non-serializable Blob — only the
  // durable voiceUrl it uploads to is ever worth persisting) before a
  // scene goes into the saved snapshot.
  function scenesForSave(list) {
    return list.map(({ voiceBlob: _voiceBlob, ...rest }) => rest);
  }

  // Load once on mount — an explicit ?projectId= wins, otherwise the most
  // recently saved project for this user, otherwise this stays a blank,
  // unsaved session (first scheduleSave() below creates the row).
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      const explicitId = new URLSearchParams(location.search).get("projectId");
      const loaded = await movieProject.load(explicitId);
      if (cancelled) return;
      if (loaded) {
        setTitle(loaded.title);
        setGenre(loaded.genre);
        setLanguage(loaded.language);
        setStoryPrompt(loaded.storyPrompt);
        setScript(loaded.script);
        setStep(loaded.step);
        if (loaded.scenes?.length) setScenes(loaded.scenes);
        setMusicUrl(loaded.musicUrl);
        if (loaded.musicUrl) setMusicFile({ name: "Saved track" }); // display-only placeholder — matches the AI-generated-score pattern elsewhere in this file
        setTitleCard(loaded.titleCard);
        setVideoUrl(loaded.videoUrl);
      }
      setProjectHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  // Debounced autosave — fires on any meaningful change once the initial
  // load (above) has settled, so this never overwrites a real saved
  // project with the blank pre-hydration state, or races it into creating
  // a duplicate row. Best-effort: scheduleSave never throws (see the hook).
  useEffect(() => {
    if (!projectHydrated) return;
    movieProject.scheduleSave({
      title,
      genre,
      language,
      story_outline: storyPrompt,
      script,
      step,
      scenes: JSON.stringify(scenesForSave(scenes)),
      music_url: musicUrl,
      title_card_enabled: titleCard,
      final_video_url: videoUrl,
    });
  }, [projectHydrated, title, genre, language, storyPrompt, script, step, scenes, musicUrl, titleCard, videoUrl]);

  // "New project" — detaches from the current saved record (dropping any
  // pending debounced save for it) and resets every stage back to blank,
  // without deleting the record that's still sitting in the database.
  const startNewProject = () => {
    if (!confirm("Start a new project? Your current one stays saved — you can find it again later.")) return;
    movieProject.newProject();
    setTitle(""); setGenre("Drama"); setLanguage("English"); setStoryPrompt(""); setScript("");
    setStep(0); setScenes([newScene(0), newScene(1), newScene(2)]);
    setMusicUrl(""); setMusicFile(null); setTitleCard(true); setVideoUrl("");
    setWarnings([]); setError("");
  };

  // Reference Library — project-wide character/style/image/video references
  // carried into every scene's image + video generation, so a chosen
  // character/style stays consistent across the whole film instead of each
  // scene being generated independently. Replaces the old shallow
  // useReferenceFromFirst heuristic (reference = whichever scene happened
  // to already have an image).
  const [references, setReferences] = useState([]);
  const [primaryCharacterRefId, setPrimaryCharacterRefId] = useState(null);
  const [pendingReferenceLabel, setPendingReferenceLabel] = useState("");
  const [pendingReferenceKind, setPendingReferenceKind] = useState("character");
  const [referenceUploading, setReferenceUploading] = useState(false);
  const referenceFileInputRef = useRef();

  // Media Library's "Use as reference" affordance hands off a media URL via
  // navigation state ({ incomingReference: { url, label, kind } }) rather
  // than a query param, so it never leaks into the URL bar. Add it once on
  // arrival, then clear the state so navigating back/forward or reloading
  // doesn't re-add it.
  useEffect(() => {
    const incoming = location.state?.incomingReference;
    if (!incoming?.url) return;
    setReferences(prev => [...prev, {
      id: crypto.randomUUID(),
      kind: incoming.kind || "image",
      label: incoming.label || "From Media Library",
      url: incoming.url,
      thumbUrl: incoming.url,
      included: true,
    }]);
    window.history.replaceState({}, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dubbing studio state
  const [dubStep, setDubStep] = useState(0);
  const [dubVideoFile, setDubVideoFile] = useState(null);
  const [dubVideoUrl, setDubVideoUrl] = useState("");
  const [dubOriginalScript, setDubOriginalScript] = useState("");
  const [dubSourceLang, setDubSourceLang] = useState("English");
  const [dubTargetLang, setDubTargetLang] = useState("Spanish");
  const [dubWithCaptions, setDubWithCaptions] = useState(true);
  const [dubCaptionLang, setDubCaptionLang] = useState("English");
  const [dubTranslatedScript, setDubTranslatedScript] = useState("");
  const [dubAudioBlob, setDubAudioBlob] = useState(null);
  const [dubAudioUrl, setDubAudioUrl] = useState("");
  const [dubLoading, setDubLoading] = useState(false);

  // AI Dubbing (ElevenLabs Dubbing API) — two separate, self-contained
  // paths from the manual translate + regenerate-voiceover flow above.
  // Audio dubbing:
  const [aiDubAudioSourceUrl, setAiDubAudioSourceUrl] = useState("");
  const [aiDubAudioFileName, setAiDubAudioFileName] = useState("");
  const [aiDubAudioTargetLang, setAiDubAudioTargetLang] = useState("es");
  const [aiDubAudioSourceLang, setAiDubAudioSourceLang] = useState("");
  const [aiDubAudioNumSpeakers, setAiDubAudioNumSpeakers] = useState(0);
  const [aiDubAudioDropBackground, setAiDubAudioDropBackground] = useState(false);
  const [aiDubAudioDisableCloning, setAiDubAudioDisableCloning] = useState(false);
  const [aiDubAudioLoading, setAiDubAudioLoading] = useState(false);
  const [aiDubAudioResultUrl, setAiDubAudioResultUrl] = useState("");
  // Video dubbing:
  const [aiDubVideoSourceUrl, setAiDubVideoSourceUrl] = useState("");
  const [aiDubVideoFileName, setAiDubVideoFileName] = useState("");
  const [aiDubVideoTargetLang, setAiDubVideoTargetLang] = useState("es");
  const [aiDubVideoSourceLang, setAiDubVideoSourceLang] = useState("");
  const [aiDubVideoNumSpeakers, setAiDubVideoNumSpeakers] = useState(0);
  const [aiDubVideoDropBackground, setAiDubVideoDropBackground] = useState(false);
  const [aiDubVideoDisableCloning, setAiDubVideoDisableCloning] = useState(false);
  const [aiDubVideoWatermark, setAiDubVideoWatermark] = useState(false);
  const [aiDubVideoHighestRes, setAiDubVideoHighestRes] = useState(false);
  const [aiDubVideoStartTime, setAiDubVideoStartTime] = useState("");
  const [aiDubVideoEndTime, setAiDubVideoEndTime] = useState("");
  const [aiDubVideoLipSync, setAiDubVideoLipSync] = useState(false);
  const [aiDubVideoBurnCaptions, setAiDubVideoBurnCaptions] = useState(false);
  const [aiDubVideoLoading, setAiDubVideoLoading] = useState(false);
  const [aiDubVideoResultUrl, setAiDubVideoResultUrl] = useState("");
  const [aiDubVideoCaptionsUrl, setAiDubVideoCaptionsUrl] = useState("");

  if (userTier < 4 && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-foreground">Movie Maker</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Create multi-scene films with AI script, voiceover, music timeline, language dubbing — exclusive to Enterprise.
          </p>
          <Link to="/billing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg hover:opacity-90 transition-opacity">
            <Sparkles className="w-4 h-4" /> Upgrade to Enterprise
          </Link>
        </div>
      </div>
    );
  }

  // ── Helpers ──────────────────────────────────────────────

  const generateScript = async () => {
    if (!storyPrompt.trim()) return setError("Enter a story idea first.");
    setLoading(true); setError("");
    try {
      const result = await generateText({
        type: "video_script",
                prompt: `Write ENTIRELY in ${language}. The complete film script - every scene and every line of narration and dialogue - MUST be written in ${language} and in no other language. Write a ${genre.toLowerCase()} film script. Create ${scenes.length} clearly-separated scenes, each 2-3 sentences of narration/dialogue. No markdown, no asterisks, no headers - plain prose only. Label each scene as "SCENE 1:", "SCENE 2:" etc. Title: "${title || "Untitled"}". Story: ${storyPrompt}`,
        tone: "Cinematic",
      });
      setScript(result);
      const parsed = splitScriptIntoScenes(result, scenes.length);
      setScenes(prev => prev.map((s, i) => ({ ...s, text: parsed[i]?.text || s.text })));
    } catch (e) { setError(e?.message || "Script generation failed."); }
    setLoading(false);
  };

  const addScene = () => setScenes(prev => prev.length >= MAX_SCENES ? prev : [...prev, newScene(prev.length)]);
  const removeScene = (id) => setScenes(prev => prev.filter(s => s.id !== id));
  const updateScene = (id, patch) => setScenes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  // ── Reference Library ───────────────────────────────────────
  // Project-wide references (uploaded once, reused across every scene) —
  // see the `references`/`primaryCharacterRefId` state declaration above.

  const handleAddReference = async (file) => {
    if (!file) return;
    setReferenceUploading(true); setError("");
    try {
      const url = await uploadFile(file);
      const id = crypto.randomUUID();
      const label = pendingReferenceLabel.trim() || file.name;
      setReferences(prev => [...prev, { id, kind: pendingReferenceKind, label, url, thumbUrl: url, included: true }]);
      // Auto-select the first character reference as primary so a single
      // upload is enough to get consistency working with no extra click.
      if (pendingReferenceKind === "character" && !primaryCharacterRefId) setPrimaryCharacterRefId(id);
      setPendingReferenceLabel("");
    } catch { setError("Reference upload failed."); }
    setReferenceUploading(false);
  };

  // Removes a reference from state only — the uploaded file itself is left
  // in Base44 storage untouched (uploadFile doesn't create anything that
  // needs explicit cleanup here).
  const removeReference = (id) => {
    setReferences(prev => prev.filter(r => r.id !== id));
    if (primaryCharacterRefId === id) setPrimaryCharacterRefId(null);
  };

  const toggleReferenceIncluded = (id) => {
    setReferences(prev => prev.map(r => r.id === id ? { ...r, included: r.included === false } : r));
  };

  // Character/style/image references are what generateImage's
  // referenceImageUrls actually accepts (a video can't be fed to the image
  // model) — video references are guidance-only, surfaced via the prompt
  // hint below instead.
  const getActiveReferenceUrls = () =>
    references.filter(r => (r.kind === "character" || r.kind === "style" || r.kind === "image") && r.included !== false).map(r => r.url);

  // Prepended to every scene's image/video generation prompt so the model
  // is nudged toward the same established look even before it sees the
  // reference images themselves — and, for a video reference (which can't
  // be fed to Kling directly), this text hint is the only way its
  // style/motion note reaches generation at all.
  const getReferenceHint = () => {
    const primary = references.find(r => r.id === primaryCharacterRefId);
    const videoRef = references.find(r => r.kind === "video" && r.included !== false);
    let hint = "";
    if (primary) hint += "Consistent with the established lead character and visual style. ";
    if (videoRef) hint += `Match the motion and style established in the reference video "${videoRef.label}". `;
    return hint;
  };

  const generateSceneImage = async (scene) => {
    if (!scene.text.trim()) return setError("Add dialogue/description to this scene first.");
    setImgLoading(p => ({ ...p, [scene.id]: true }));
    setError("");
    try {
      const url = await generateImage({
        prompt: `Cinematic film frame. ${genre} genre. ${getReferenceHint()}${scene.text}`,
        dimensions: "1792x1024",
        referenceImageUrls: getActiveReferenceUrls(),
      });
      if (url) updateScene(scene.id, { imageUrl: url });
      else setError("Image generation failed.");
    } catch (e) { setError(e?.message || "Image generation failed."); }
    setImgLoading(p => ({ ...p, [scene.id]: false }));
  };

  const generateAllImages = async () => {
    setError("");
    const activeRefUrls = getActiveReferenceUrls();
    const hint = getReferenceHint();
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (!s.text.trim() || s.imageUrl) continue;
      setImgLoading(p => ({ ...p, [s.id]: true }));
      try {
        const url = await generateImage({
          prompt: `Cinematic film frame. ${genre} genre. ${hint}${s.text}`,
          dimensions: "1792x1024",
          referenceImageUrls: activeRefUrls,
        });
        if (url) updateScene(s.id, { imageUrl: url });
      } catch { /* continue */ }
      setImgLoading(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleSceneFileUpload = async (scene, file) => {
    if (!file) return;
    setUploadLoading(p => ({ ...p, [scene.id]: true }));
    try {
      const url = await uploadFile(file);
      updateScene(scene.id, { imageUrl: url });
    } catch { setError("Upload failed."); }
    setUploadLoading(p => ({ ...p, [scene.id]: false }));
  };

  // AI-generates scene.shotsPerScene (1-3) short animated video clips for a
  // scene (Kling primary, MiniMax fallback on the render worker), chained
  // back-to-back into scene.clips = [{videoUrl, duration}]. Each shot starts
  // from the same scene.imageUrl — there's no per-shot continuity seeding
  // (using the previous shot's last frame as the next one's start frame),
  // just multiple independent takes of the same source image concatenated
  // in the timeline. Shots are generated sequentially with a short pause
  // between them, same rate-limiting rationale as generateAllVideoClips
  // below. Non-fatal on a per-shot failure — whatever shots did succeed are
  // still kept; if none did, the scene's still image is left intact so the
  // film can still be assembled without it. scene.videoUrl is kept mirrored
  // to the first shot for any code path that still only reads the single
  // videoUrl field (the scene preview `<video>` tag, mainly).
  const generateSceneVideoClip = async (scene) => {
    if (!scene.text.trim() && !scene.imageUrl) return setError("Add dialogue/description or an image to this scene first.");
    const shotCount = Math.max(1, Math.min(3, scene.shotsPerScene || 1));
    const clipSeconds = clampToValidClipDuration(scene.clipDuration || 5);
    setSceneVideoLoading(p => ({ ...p, [scene.id]: true }));
    setError("");
    const newClips = [];
    for (let shot = 0; shot < shotCount; shot++) {
      try {
        // scene.imageUrl was already generated with the Reference Library
        // applied (it's the video model's start frame), so every shot
        // inherits that consistent look automatically — the hint here is
        // additional guidance for the motion/style itself.
        const url = await generateSceneVideo({
          prompt: `${getReferenceHint()}${toSpeakable(scene.text) || scene.text}`,
          imageUrl: scene.imageUrl,
          durationSeconds: clipSeconds,
        });
        if (url) newClips.push({ videoUrl: url, duration: clipSeconds });
      } catch (e) {
        const msg = shotCount > 1
          ? `Shot ${shot + 1} of ${shotCount} failed for this scene: ${e?.message || "unknown error"}`
          : (e?.message || "Video clip generation failed. The still image will be used instead.");
        setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
      }
      if (shot < shotCount - 1) await sleep(1500);
    }
    if (newClips.length) {
      updateScene(scene.id, { clips: newClips, videoUrl: newClips[0].videoUrl });
    } else {
      const msg = "No video clip was generated for this scene. The still image will be used instead.";
      setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
    }
    setSceneVideoLoading(p => ({ ...p, [scene.id]: false }));
  };

  // Generates every eligible scene's video clip(s) one scene at a time
  // (never in parallel) — the render worker fans each request out to
  // Replicate, and firing all of them at once risks tripping Replicate's
  // rate limits across an entire batch simultaneously. A short pause
  // between scenes gives the API room to breathe on top of that. Per-scene
  // progress is already visible via sceneVideoLoading, which
  // generateSceneVideoClip sets/clears itself — awaiting each call in turn
  // naturally lights up one scene's spinner at a time instead of all of
  // them at once.
  const generateAllVideoClips = async () => {
    setError("");
    const eligible = scenes.filter(s => (s.text.trim() || s.imageUrl) && !(s.clips && s.clips.length) && !s.videoUrl);
    for (let i = 0; i < eligible.length; i++) {
      await generateSceneVideoClip(eligible[i]);
      if (i < eligible.length - 1) await sleep(1500);
    }
  };

  // Rewrites a scene's raw text into natural spoken dialogue/narration only
  // (no scene labels, visual directions, parentheticals, or stage
  // directions) in the film's genre and language, so the voiceover speaks
  // like narration, not a screenplay. Only used to prepare text for TTS —
  // never touches scene.text, which stays the original written text for
  // the subtitle/SRT builder and the export payload. Falls back to the
  // toSpeakable-cleaned text on an empty or failed rewrite.
  const toSpokenDialogue = async (rawText) => {
    const cleaned = toSpeakable(rawText);
    if (!cleaned) return cleaned;
    try {
      const rewritten = await generateText({
        type: "script",
                prompt: `Write ENTIRELY in ${language}. Rewrite the following as natural spoken dialogue/narration only, in ${language} and in no other language, ${genre.toLowerCase()} tone. Remove any scene labels, visual directions, parentheticals, or stage directions - return plain spoken text only, nothing else.\n\n${cleaned}`,
        tone: genre,
      });
      return rewritten?.trim() || cleaned;
    } catch (_e) {
      return cleaned;
    }
  };

  const generateSceneVoiceover = async (scene) => {
    if (!scene.text.trim()) return setError("Add dialogue text first.");
    setVoiceLoading(p => ({ ...p, [scene.id]: true })); setError("");
    try {
      const spoken = await toSpokenDialogue(scene.text);
      const blob = await generateVoiceover(spoken);
      if (blob) {
        const url = URL.createObjectURL(blob);
        updateScene(scene.id, { voiceBlob: blob, voiceUrl: url });
      } else setError("No voiceover was produced. If this persists, verify the ElevenLabs API key is configured.");
    } catch (e) { setError(e?.message || "Voiceover failed."); }
    setVoiceLoading(p => ({ ...p, [scene.id]: false }));
  };

  const generateAllVoiceovers = async () => {
    setError("");
    for (const s of scenes) {
      if (!s.text.trim() || s.voiceUrl) continue;
      await generateSceneVoiceover(s);
    }
  };

  const handleMusicUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    try { const url = await uploadFile(file); setMusicUrl(url); setMusicFile(file); }
    catch { setError("Music upload failed."); }
    setLoading(false);
  };

  // Same duration math as the Export step's "Est. duration" summary and
  // assembleMovie's sceneDurations, so the generated track is scored to the
  // film's actual length.
  const getTotalFilmSeconds = () => {
    const readyScenes = scenes.filter(sceneHasVisual);
    return (titleCard && title ? 4 : 0) + readyScenes.reduce((a, s) => a + sceneDuration(s), 0);
  };

  const generateBackgroundMusic = async () => {
    setMusicLoading(true); setError("");
    try {
      // generateMusic runs as an async job on the render worker and returns
      // { url, vocals } with an already-persistent URL (the worker uploads
      // the result to Base44 storage itself) — no separate uploadFile step
      // needed here.
      //
      // Cap what a single generation run is asked for. getTotalFilmSeconds()
      // is unbounded — a ten-scene film asks for minutes of audio, which no
      // provider returns quickly and which the MusicGen path could not
      // produce at all, so "Generate AI background music" reliably timed out
      // on exactly the long films that most wanted a score. A shorter track
      // is not a shorter film: the render worker extends the music with
      // crossfaded repetitions to cover the full runtime (see
      // buildVariedMusicTrack in server-render/render.js).
      const music = await generateMusic({
        prompt: `${genre} film score, cinematic, matching: ${storyPrompt}`,
        instrumental: true,
        durationSeconds: Math.min(MAX_MUSIC_SECONDS, Math.max(15, getTotalFilmSeconds())),
      });
      if (music?.url) {
        setMusicUrl(music.url);
        setMusicFile({ name: "AI-generated score" }); // display-only placeholder, not a real File — reuses the existing "track set" UI
      } else {
        const msg = "No background music was generated. Try again or upload a track instead.";
        setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
      }
    } catch (e) {
      // Music generation failing or timing out is never fatal to the film
      // itself — warn and let the user proceed without it (or try again /
      // upload a track manually).
      const msg = e?.message || "Background music generation failed.";
      setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
    }
    setMusicLoading(false);
  };

  const RENDER_POLL_MS = 3000;
  const RENDER_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

  const assembleMovie = async () => {
    const readyScenes = scenes.filter(sceneHasVisual);
    if (!readyScenes.length) return setError("Add at least one image or video to a scene before assembling.");
    setLoading(true); setError(""); setWarnings([]); setProgress(0);
    setRenderSceneIndex(null); setRenderSceneTotal(null);

    try {
      // Each scene's own voiceover (generated per-scene in the Voiceover
      // step) only ever has a blob: URL, which only resolves in this
      // browser tab — the render worker fetches every asset over the
      // network, so any scene with unpersisted audio needs a real, durable
      // URL uploaded first. Scenes with no voiceBlob (never generated a
      // voiceover) are left as-is and simply render silently.
      const scenesWithPersistedVoice = await Promise.all(readyScenes.map(async (s) => {
        if (!s.voiceBlob) return s;
        try {
          const url = await uploadFile(new File([s.voiceBlob], `scene-${s.id}.mp3`, { type: s.voiceBlob.type || "audio/mpeg" }));
          return url ? { ...s, voiceUrl: url } : { ...s, voiceUrl: undefined };
        } catch (_e) {
          const msg = "Couldn't upload one scene's voiceover — that scene will render without narration.";
          setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
          return { ...s, voiceUrl: undefined };
        }
      }));

      const payload = {
        title,
        ratio: "16:9",
        titleCard: { enabled: titleCard && !!title, text: title, seconds: 4 },
        scenes: scenesWithPersistedVoice.map(s => ({
          imageUrl: s.imageUrl,
          videoUrl: s.videoUrl || undefined,
          // The full chained-shot list — the render worker renders every
          // shot in order and concatenates them per scene (see
          // resolveSceneShots/buildSceneClip in server-render/render.js).
          clips: (s.clips && s.clips.length) ? s.clips.map(c => ({ videoUrl: c.videoUrl, seconds: c.duration })) : undefined,
          // Still sent (used as the burned-in text *if* burnSubtitles is
          // ever turned on for this project, and as the source for the
          // separate downloadSubtitles() .srt export below) — just not
          // rendered into the picture by default anymore.
          subtitle: s.text || "",
          seconds: sceneDuration(s),
          voiceUrl: s.voiceUrl || undefined,
        })),
        musicUrl: musicUrl || undefined,
        // Subtitles are already offered as a separate downloadable .srt
        // (see downloadSubtitles below) — don't also hardcode them into
        // the exported video by default.
        burnSubtitles: false,
      };

      const jobId = await submitRender(payload);

      const startedAt = Date.now();
      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            if (Date.now() - startedAt > RENDER_TIMEOUT_MS) {
              clearInterval(interval);
              reject(new Error("Render timed out after 20 minutes. Please try again."));
              return;
            }
            const job = await getRenderStatus(jobId);
            if (typeof job?.progress === "number") setProgress(job.progress);
            if (typeof job?.sceneIndex === "number") setRenderSceneIndex(job.sceneIndex);
            if (typeof job?.sceneTotal === "number") setRenderSceneTotal(job.sceneTotal);
            if (job?.status === "done") {
              clearInterval(interval);
              setVideoUrl(job.url);
              resolve();
            } else if (job?.status === "error") {
              clearInterval(interval);
              reject(new Error(job.error || "Render failed."));
            }
            // else "queued"/"processing" — keep polling
          } catch (e) {
            clearInterval(interval);
            reject(e);
          }
        }, RENDER_POLL_MS);
      });
    } catch (e) { setError(e?.message || "Video assembly failed."); }
    setLoading(false); setProgress(0);
    setRenderSceneIndex(null); setRenderSceneTotal(null);
  };

  // Builds an .srt using the exact same title-card + per-scene duration
  // timing assembleMovie sends the render worker (seconds: Math.max(5,
  // s.duration), a 4s title card), so subtitles line up with the actual
  // exported video regardless of whether it's been assembled yet.
  const downloadSubtitles = () => {
    const readyScenes = scenes.filter(sceneHasVisual);
    if (!readyScenes.length) return setError("Add at least one image or video to a scene before exporting subtitles.");

    const entries = [];
    let t = 0;
    if (titleCard && title) {
      entries.push({ start: t, end: t + 4, text: title });
      t += 4;
    }
    for (const s of readyScenes) {
      const duration = sceneDuration(s);
      const text = toSpeakable(s.text);
      if (text) entries.push({ start: t, end: t + duration, text });
      t += duration;
    }
    if (!entries.length) return setError("No narration text available to export as subtitles.");

    const blob = new Blob([buildSrt(entries)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "movie").trim().replace(/[^\w\-]+/g, "_") || "movie"}.srt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveToLibrary = async () => {
    if (!videoUrl) return;
    setLoading(true);
    try {
      await base44.entities.ContentAsset.create({
        ...mine(), title: title || `Movie — ${new Date().toLocaleDateString()}`,
        type: "video", file_url: videoUrl, ai_generated: true, prompt_used: storyPrompt, status: "ready",
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { setError("Save failed."); }
    setLoading(false);
  };

  // ── Dubbing Studio ────────────────────────────────────────

  const handleDubVideoUpload = async (file) => {
    if (!file) return;
    setDubLoading(true);
    try {
      const url = await uploadFile(file);
      setDubVideoFile(file); setDubVideoUrl(url);
      // Auto-populate script from current scenes if available
      if (!dubOriginalScript && scenes.some(s => s.text)) {
        setDubOriginalScript(scenes.map(s => s.text).filter(Boolean).join("\n\n"));
      }
      setDubStep(1);
    } catch { setError("Video upload failed."); }
    setDubLoading(false);
  };

  const useCurrentMovieForDubbing = () => {
    if (videoUrl) { setDubVideoUrl(videoUrl); setDubVideoFile(null); }
    if (scenes.some(s => s.text)) setDubOriginalScript(scenes.map(s => s.text).filter(Boolean).join("\n\n"));
    setDubStep(1);
  };

  const translateForDubbing = async () => {
    if (!dubOriginalScript.trim()) return setError("Enter the original script first.");
    setDubLoading(true); setError("");
    try {
      const translated = await generateText({
        type: "script",
        prompt: `Translate this film script from ${dubSourceLang} to ${dubTargetLang}. Preserve the meaning, emotion, and pacing. Keep the same paragraph/scene breaks. Plain text only, no markdown:\n\n${dubOriginalScript}`,
        tone: "Cinematic",
      });
      setDubTranslatedScript(translated);
      setDubStep(2);
    } catch (e) { setError(e?.message || "Translation failed."); }
    setDubLoading(false);
  };

  const generateDubbedAudio = async () => {
    if (!dubTranslatedScript.trim()) return setError("Translate the script first.");
    setDubLoading(true); setError("");
    try {
      // 20000 matches generateVoiceover's real cap (ElevenLabs TTS) — see
      // the same note in assembleMovie above.
      const blob = await generateVoiceover(toSpeakable(dubTranslatedScript).slice(0, 20000));
      if (blob) {
        const url = URL.createObjectURL(blob);
        setDubAudioBlob(blob); setDubAudioUrl(url);
        setDubStep(3);
      } else setError("Dubbed audio generation failed.");
    } catch (e) { setError(e?.message || "Dubbed audio failed."); }
    setDubLoading(false);
  };

  // ── AI Dubbing (ElevenLabs Dubbing API) ────────────────────
  // Two separate, self-contained flows from the manual translate +
  // regenerate-voiceover steps above — no script editing, just pick a
  // target language (and, for video, lip-sync/caption options) and go.
  // Both are non-fatal on failure — warn and leave the original untouched,
  // same as generateSceneVideoClip/generateBackgroundMusic.

  const handleAiDubAudioUpload = async (file) => {
    if (!file) return;
    setAiDubAudioLoading(true); setError("");
    try {
      const url = await uploadFile(file);
      setAiDubAudioSourceUrl(url); setAiDubAudioFileName(file.name);
    } catch { setError("Audio upload failed."); }
    setAiDubAudioLoading(false);
  };

  const runAiDubAudio = async () => {
    if (!aiDubAudioSourceUrl) return setError("Upload an audio file first.");
    setAiDubAudioLoading(true); setError(""); setAiDubAudioResultUrl("");
    try {
      const url = await dubAudioFile({
        sourceUrl: aiDubAudioSourceUrl,
        targetLang: aiDubAudioTargetLang,
        sourceLang: aiDubAudioSourceLang || undefined,
        numSpeakers: aiDubAudioNumSpeakers || undefined,
        dropBackgroundAudio: aiDubAudioDropBackground,
        disableVoiceCloning: aiDubAudioDisableCloning,
      });
      if (url) setAiDubAudioResultUrl(url);
      else {
        const msg = "Audio dubbing did not produce a result. Please try again.";
        setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
      }
    } catch (e) {
      const msg = e?.message || "Audio dubbing failed. The original audio is unaffected.";
      setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
    }
    setAiDubAudioLoading(false);
  };

  const handleAiDubVideoUpload = async (file) => {
    if (!file) return;
    setAiDubVideoLoading(true); setError("");
    try {
      const url = await uploadFile(file);
      setAiDubVideoSourceUrl(url); setAiDubVideoFileName(file.name);
    } catch { setError("Video upload failed."); }
    setAiDubVideoLoading(false);
  };

  const useAssembledMovieForAiDub = () => {
    if (!videoUrl) return;
    setAiDubVideoSourceUrl(videoUrl); setAiDubVideoFileName("Assembled movie");
  };

  // Builds {start,end,text} entries from the current scenes, using the same
  // title-card + per-scene duration timing as downloadSubtitles/assembleMovie,
  // so caption overrides line up with the assembled movie's actual timeline.
  // Only meaningful when dubbing the assembled movie itself (aiDubVideoSourceUrl
  // === videoUrl) — an arbitrary uploaded video has no relation to these scenes.
  const buildCaptionOverridesFromScenes = () => {
    const readyScenes = scenes.filter(sceneHasVisual);
    const entries = [];
    let t = 0;
    if (titleCard && title) t += 4;
    for (const s of readyScenes) {
      const duration = sceneDuration(s);
      const text = (s.caption?.trim()) || toSpeakable(s.text);
      if (text) entries.push({ start: t, end: t + duration, text });
      t += duration;
    }
    return entries;
  };

  const runAiDubVideo = async () => {
    if (!aiDubVideoSourceUrl) return setError("Upload a video or select the assembled movie first.");
    setAiDubVideoLoading(true); setError(""); setAiDubVideoResultUrl(""); setAiDubVideoCaptionsUrl("");
    try {
      const isAssembledMovie = aiDubVideoSourceUrl === videoUrl;
      const captionOverrides = aiDubVideoBurnCaptions && isAssembledMovie ? buildCaptionOverridesFromScenes() : undefined;
      const result = await dubVideoJob({
        sourceUrl: aiDubVideoSourceUrl,
        targetLang: aiDubVideoTargetLang,
        sourceLang: aiDubVideoSourceLang || undefined,
        numSpeakers: aiDubVideoNumSpeakers || undefined,
        dropBackgroundAudio: aiDubVideoDropBackground,
        disableVoiceCloning: aiDubVideoDisableCloning,
        watermark: aiDubVideoWatermark,
        highestResolution: aiDubVideoHighestRes,
        startTime: aiDubVideoStartTime !== "" ? Number(aiDubVideoStartTime) : undefined,
        endTime: aiDubVideoEndTime !== "" ? Number(aiDubVideoEndTime) : undefined,
        lipSync: aiDubVideoLipSync,
        burnCaptions: aiDubVideoBurnCaptions,
        captionOverrides: captionOverrides?.length ? captionOverrides : undefined,
      });
      if (result?.url) {
        setAiDubVideoResultUrl(result.url);
        setAiDubVideoCaptionsUrl(result.captionsUrl || "");
      } else {
        const msg = "Video dubbing did not produce a result. Please try again.";
        setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
      }
    } catch (e) {
      const msg = e?.message || "Video dubbing failed. The original video is unaffected.";
      setWarnings(prev => prev.includes(msg) ? prev : [...prev, msg]);
    }
    setAiDubVideoLoading(false);
  };

  const currentStep = STEPS[step];
  const isDubbing = step === 6;

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        <PageHeader
          icon={Film}
          iconGradient="from-cyan-500 to-blue-600"
          title="Movie Maker"
          subtitle="Multi-scene films · AI script · Voiceover · Music · Dubbing"
          actions={
            <div className="flex items-center gap-2">
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Film title…"
                className="px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-cyan-500/50 transition-colors" />
              <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap" title="Autosaves 1.5s after your last change">
                {movieProject.status === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
                {movieProject.status === "saved" && <><Check className="w-3 h-3 text-emerald-400" /> Saved</>}
                {movieProject.status === "error" && <><CloudOff className="w-3 h-3 text-amber-400" /> Save failed</>}
              </span>
              <button onClick={startNewProject} title="Start a new project — keeps this one saved"
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-border bg-background text-xs text-muted-foreground hover:text-foreground transition-colors">
                <FilePlus2 className="w-3.5 h-3.5" /> New
              </button>
            </div>
          }
        />

        {/* Step tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                i === step ? "bg-cyan-500 text-white shadow-sm"
                : i < step ? "bg-cyan-500/20 text-cyan-400"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}>
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            <button onClick={() => setError("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
            <button onClick={() => setWarnings([])} className="shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ── Step 0: Script ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-cyan-400" /> Auto Demo from URL
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Paste a public page's URL — we'll record a walkthrough, write a narration script, generate voiceover and music, and save a finished demo video straight to your Media Library. No manual editing needed.</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input value={demoUrl} onChange={e => setDemoUrl(e.target.value)}
                  placeholder="https://example.com"
                  disabled={!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase)}
                  className="flex-1 min-w-[220px] px-3 py-2 rounded-xl bg-background border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50" />
                <button onClick={handleGenerateDemo}
                  disabled={!demoUrl.trim() || !AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase) || (showDemoLogin && (!demoPassword || !demoLoginConsent))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-semibold shadow-lg hover:opacity-90 disabled:opacity-50">
                  {AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase)
                    ? <><Sparkles className="w-3.5 h-3.5" /> Generate Demo</>
                    : <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</>}
                </button>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer w-fit">
                  <input type="checkbox" checked={showDemoLogin}
                    onChange={e => setShowDemoLogin(e.target.checked)}
                    disabled={!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase) || useDemoSessionToken}
                    className="accent-cyan-500" />
                  <Lock className="w-3 h-3" /> This page requires login (optional)
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer w-fit" title="Uses your current login session — works for Base44 apps that use email-OTP auth (no password needed)">
                  <input type="checkbox" checked={useDemoSessionToken}
                    onChange={e => setUseDemoSessionToken(e.target.checked)}
                    disabled={!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase) || showDemoLogin}
                    className="accent-cyan-500" />
                  <Sparkles className="w-3 h-3" /> Use my current session (Base44 apps)
                </label>
              </div>

              {showDemoLogin && (
                <div className="p-3 rounded-xl bg-background border border-border space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    By continuing, you authorize this app to automatically sign in to the target website on your behalf
                    using the credentials below, and to browse pages behind that login as part of an automated
                    recording. You confirm that you are the account holder, or are otherwise authorized by the account
                    holder, to access this website with these credentials. Your password is used only for this one
                    capture: it's sent over an encrypted connection, is encrypted at rest for the brief time (if any)
                    the job is queued, is never written to a log or a permanent record, and is never shown back to you
                    or anyone else.
                  </p>

                  <input value={demoLoginUrl} onChange={e => setDemoLoginUrl(e.target.value)}
                    placeholder="Login page URL (optional — defaults to the URL above)"
                    disabled={!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase)}
                    className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50" />
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input value={demoUsername} onChange={e => setDemoUsername(e.target.value)}
                      placeholder="Username / email"
                      autoComplete="off"
                      disabled={!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase)}
                      className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50" />
                    <input value={demoPassword} onChange={e => setDemoPassword(e.target.value)}
                      placeholder="Password" type="password"
                      autoComplete="off" autoCorrect="off" spellCheck={false}
                      disabled={!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase)}
                      className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50" />
                  </div>

                  <button type="button" onClick={() => setShowDemoLoginAdvanced(v => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline">
                    {showDemoLoginAdvanced ? "Hide" : "Show"} advanced (field selectors)
                  </button>
                  {showDemoLoginAdvanced && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input value={demoUsernameField} onChange={e => setDemoUsernameField(e.target.value)}
                        placeholder="Username field CSS selector (auto-detected if blank)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50" />
                      <input value={demoPasswordField} onChange={e => setDemoPasswordField(e.target.value)}
                        placeholder="Password field CSS selector (auto-detected if blank)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50" />
                      <input value={demoSubmitSelector} onChange={e => setDemoSubmitSelector(e.target.value)}
                        placeholder="Submit button selector (defaults to Enter key)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50" />
                      <input value={demoSuccessSelector} onChange={e => setDemoSuccessSelector(e.target.value)}
                        placeholder="Post-login success selector (optional)"
                        className="px-3 py-2 rounded-xl bg-card border border-border text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50" />
                    </div>
                  )}

                  <label className="flex items-start gap-1.5 text-[11px] text-foreground cursor-pointer">
                    <input type="checkbox" checked={demoLoginConsent}
                      onChange={e => setDemoLoginConsent(e.target.checked)}
                      className="accent-cyan-500 mt-0.5" />
                    I confirm I'm authorized to log into this website with these credentials, and I accept responsibility
                    for this automated login.
                  </label>
                </div>
              )}

              {!AUTO_DEMO_IDLE_PHASES.includes(autoDemo.phase) && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{autoDemo.stepLabel}</p>
                  <div className="h-1.5 rounded-full bg-background overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all"
                      style={{ width: `${Math.round((autoDemo.percent || 0) * 100)}%` }} />
                  </div>
                  <button onClick={autoDemo.cancel} className="text-[11px] text-muted-foreground hover:text-foreground underline">Cancel</button>
                </div>
              )}

              {(autoDemo.phase === "login_required" || autoDemo.phase === "login_failed" || autoDemo.phase === "error") && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {autoDemo.error}
                </p>
              )}
              {autoDemo.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-400">{w}</p>
              ))}
              {autoDemo.phase === "done" && autoDemo.result && (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0" /> Saved — <Link to="/media-library" className="underline hover:text-emerald-300">view in Media Library</Link>
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <div className="flex-1 h-px bg-border" /> or write your own story <div className="flex-1 h-px bg-border" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Genre</label>
                <select value={genre} onChange={e => setGenre(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-cyan-500/50">
                  {GENRES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-cyan-500/50">
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Story idea / outline</label>
              <textarea value={storyPrompt} onChange={e => setStoryPrompt(e.target.value)}
                placeholder="Describe your story, characters, setting, plot arc…"
                rows={5}
                className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 resize-none" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={generateScript} disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg hover:opacity-90 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "Generating script…" : "Generate AI Script"}
              </button>
              <span className="text-xs text-muted-foreground">for {scenes.length} scenes</span>
            </div>
            {script && (
              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Generated script (editable)</p>
                <textarea value={script} onChange={e => setScript(e.target.value)} rows={10}
                  className="w-full text-sm text-foreground bg-transparent focus:outline-none resize-none leading-relaxed" />
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Reference Lock ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-cyan-400" /> Reference Library
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Upload character/style/image references and lock one as primary — they're carried into every remaining step (scenes, per-scene video, dubbing) to keep the look consistent across the whole film.</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input value={pendingReferenceLabel} onChange={e => setPendingReferenceLabel(e.target.value)}
                  placeholder="Label (e.g. Lead character – Maya)"
                  className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-background border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50" />
                <select value={pendingReferenceKind} onChange={e => setPendingReferenceKind(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-cyan-500/50">
                  <option value="character">Character</option>
                  <option value="style">Style</option>
                  <option value="image">Image</option>
                  <option value="video">Video (motion/style note)</option>
                </select>
                <button onClick={() => referenceFileInputRef.current?.click()} disabled={referenceUploading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 disabled:opacity-50 transition-colors">
                  <input ref={referenceFileInputRef} type="file" accept="image/*,video/*" className="hidden"
                    onChange={e => { handleAddReference(e.target.files?.[0]); e.target.value = ""; }} />
                  {referenceUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add reference
                </button>
              </div>

              {references.length > 0 && (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {references.map(ref => (
                    <div key={ref.id} className="flex items-center gap-2 p-2 rounded-xl bg-background border border-border">
                      {ref.kind === "video" ? (
                        <video src={ref.thumbUrl} muted className="w-12 h-12 object-cover rounded-lg border border-border shrink-0" />
                      ) : (
                        <img src={ref.thumbUrl} alt={ref.label} className="w-12 h-12 object-cover rounded-lg border border-border shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{ref.label}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{ref.kind}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={ref.included !== false} onChange={() => toggleReferenceIncluded(ref.id)}
                              className="accent-cyan-500 w-3.5 h-3.5" />
                            <span className="text-[10px] text-muted-foreground">Include</span>
                          </label>
                          {ref.kind === "character" && (
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name="primary-character-ref" checked={primaryCharacterRefId === ref.id}
                                onChange={() => setPrimaryCharacterRefId(ref.id)}
                                className="accent-violet-500 w-3.5 h-3.5" />
                              <span className="text-[10px] text-muted-foreground">Primary (locked)</span>
                            </label>
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeReference(ref.id)} className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {primaryCharacterRefId && (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5 pt-1">
                  <Check className="w-3.5 h-3.5" /> Primary character locked — carried forward through Scenes, per-scene video, and Dubbing.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Scenes ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{scenes.length} / {MAX_SCENES} scenes</p>
              <div className="flex gap-2">
                <button onClick={generateAllImages} disabled={Object.values(imgLoading).some(Boolean)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-colors disabled:opacity-50">
                  <Sparkles className="w-3.5 h-3.5" /> Generate All Images
                </button>
                <button onClick={generateAllVideoClips} disabled={Object.values(sceneVideoLoading).some(Boolean)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-colors disabled:opacity-50">
                  <Play className="w-3.5 h-3.5" /> Generate All Clips
                </button>
                <button onClick={addScene} disabled={scenes.length >= MAX_SCENES}
                  title={scenes.length >= MAX_SCENES ? `Scene limit reached (max ${MAX_SCENES})` : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors disabled:opacity-50 disabled:hover:text-muted-foreground">
                  <Plus className="w-3.5 h-3.5" /> Add Scene
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3">
              <strong className="text-foreground">Character consistency:</strong> AI image and video generation use the references in the Reference Library above — add a character/style reference there to keep characters and style consistent throughout.
            </p>

            {scenes.map((scene, i) => (
              <div key={scene.id} className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Scene {i + 1}</span>
                  {scenes.length > 1 && (
                    <button onClick={() => removeScene(scene.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <textarea value={scene.text} onChange={e => updateScene(scene.id, { text: e.target.value })}
                  placeholder="Dialogue / narration / scene description…"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 resize-none" />

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Caption text (optional — overrides the auto-transcript when burning captions into a dubbed video)</label>
                  <input value={scene.caption} onChange={e => updateScene(scene.id, { caption: e.target.value })}
                    placeholder="Defaults to the dialogue above if left blank…"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50" />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Scene duration — free-range, governs the scene's placement
                      in the final timeline (Ken-Burns still-image pacing, or
                      the time-clamped window a video clip is shown within).
                      The 5s/10s chip below is the source of truth for AI clip
                      length and, on click, also seeds this value so the two
                      controls start in agreement — but this slider stays
                      independently free-range-draggable afterward, since a
                      still-image scene with no AI clip legitimately needs a
                      duration outside {"{5,10}"} (e.g. a 20s Ken-Burns pan).
                      generateSceneVideoClip never reads this field — it only
                      ever sends clampToValidClipDuration(scene.clipDuration),
                      so the AI request is always exactly 5 or 10 regardless
                      of where this slider sits. */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Scene duration: {scene.duration}s</label>
                    <input type="range" min={3} max={60} value={scene.duration}
                      onChange={e => updateScene(scene.id, { duration: +e.target.value })}
                      className="w-full accent-cyan-500" />
                  </div>
                  {/* AI Image */}
                  <button onClick={() => generateSceneImage(scene)}
                    disabled={!scene.text || imgLoading[scene.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 disabled:opacity-50 transition-colors">
                    {imgLoading[scene.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    {scene.imageUrl ? "Regenerate" : "AI Image"}
                  </button>
                  {/* Upload */}
                  <button onClick={() => fileInputRefs.current[scene.id]?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <input type="file" accept="image/*,video/*" className="hidden"
                      ref={el => (fileInputRefs.current[scene.id] = el)}
                      onChange={e => handleSceneFileUpload(scene, e.target.files?.[0])} />
                    {uploadLoading[scene.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload
                  </button>
                  {/* AI Video clip — clip length is a discrete model-valid
                      choice (Kling only accepts specific durations), separate
                      from the free-range scene duration above. Shots chains
                      multiple independent takes (each its own clip-length
                      request) back-to-back into this one scene. */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center rounded-lg border border-border bg-background p-0.5" role="group" aria-label="AI video clip length">
                      {VALID_CLIP_DURATIONS.map(d => (
                        <button key={d} type="button" onClick={() => updateScene(scene.id, { clipDuration: d, duration: d })}
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            (scene.clipDuration ?? 5) === d ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground"
                          }`}>
                          {d}s
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Shots per scene" title="Chain multiple clips back-to-back within this scene">
                      {SHOT_COUNTS.map(n => (
                        <button key={n} type="button" onClick={() => updateScene(scene.id, { shotsPerScene: n })}
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            (scene.shotsPerScene ?? 1) === n ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-foreground"
                          }`}>
                          {n} shot{n > 1 ? "s" : ""}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => generateSceneVideoClip(scene)}
                      disabled={(!scene.text && !scene.imageUrl) || sceneVideoLoading[scene.id]}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 disabled:opacity-50 transition-colors">
                      {sceneVideoLoading[scene.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      {scene.clips?.length ? "Regenerate clips" : "Generate video clip"}
                    </button>
                  </div>
                </div>

                {/* Scene preview — shows the first shot only; all clips play
                    in order at assembly time. */}
                {scene.videoUrl ? (
                  <div className="relative">
                    <video src={scene.videoUrl} controls className="w-full h-32 object-cover rounded-xl border border-border" />
                    {scene.clips?.length > 1 && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-semibold text-white">
                        {scene.clips.length} shots · {sceneDuration(scene)}s
                      </span>
                    )}
                  </div>
                ) : scene.imageUrl && (
                  <img src={scene.imageUrl} alt={`Scene ${i+1}`}
                    className="w-full h-32 object-cover rounded-xl border border-border" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Voiceover ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Generate AI voiceover per scene. On export, all text is combined into a single narration track.</p>
              <button onClick={generateAllVoiceovers}
                disabled={Object.values(voiceLoading).some(Boolean)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 disabled:opacity-50 transition-colors">
                <Mic className="w-3.5 h-3.5" /> Generate All
              </button>
            </div>
            {scenes.map((scene, i) => (
              <div key={scene.id} className="p-4 rounded-xl bg-card border border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Scene {i + 1}</p>
                <p className="text-sm text-foreground line-clamp-2">{scene.text || <span className="text-muted-foreground/50 italic">No dialogue yet</span>}</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => generateSceneVoiceover(scene)}
                    disabled={!scene.text || voiceLoading[scene.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 disabled:opacity-50 transition-colors">
                    {voiceLoading[scene.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                    {scene.voiceUrl ? "Redo" : "Generate"}
                  </button>
                  {scene.voiceUrl && <audio controls src={scene.voiceUrl} className="flex-1 h-8" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 4: Music ── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Upload a background music track. It will be mixed under the voiceover narration during export.</p>
            <div onClick={() => musicInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group">
              <input ref={musicInputRef} type="file" accept="audio/*" className="hidden"
                onChange={e => handleMusicUpload(e.target.files?.[0])} />
              {loading ? <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              : musicFile ? (
                <div className="space-y-1">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">{musicFile.name}</p>
                  <p className="text-xs text-muted-foreground">Click to replace</p>
                </div>
              ) : (
                <>
                  <Music className="w-10 h-10 text-muted-foreground group-hover:text-cyan-400 mx-auto mb-3 transition-colors" />
                  <p className="text-sm font-semibold text-foreground">Upload background music</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, AAC</p>
                </>
              )}
            </div>

            <button onClick={generateBackgroundMusic} disabled={musicLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20 transition-all disabled:opacity-50">
              {musicLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {musicLoading ? "Composing score…" : "Generate AI background music"}
            </button>

            {musicUrl && <audio controls src={musicUrl} className="w-full rounded-xl" />}
          </div>
        )}

        {/* ── Step 5: Export ── */}
        {step === 5 && (
          <div className="space-y-4">
            {/* Title card option */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <p className="text-sm font-semibold text-foreground">Title Card</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setTitleCard(v => !v)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${titleCard ? "bg-cyan-500" : "bg-muted"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${titleCard ? "translate-x-4" : ""}`} />
                </div>
                <span className="text-sm text-muted-foreground">Show movie title as opening card</span>
              </label>
              {titleCard && !title && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Enter a film title in the header above to use the title card.
                </p>
              )}
            </div>

            {/* Summary */}
            <div className="p-4 rounded-xl bg-card border border-border text-xs text-muted-foreground space-y-1">
              <p className="text-sm font-semibold text-foreground mb-2">Film summary</p>
              <p><span className="text-foreground font-medium">Title:</span> {title || "Untitled"}</p>
              <p><span className="text-foreground font-medium">Genre / Language:</span> {genre} — {language}</p>
              <p><span className="text-foreground font-medium">Scenes ready:</span> {scenes.filter(sceneHasVisual).length} / {scenes.length}</p>
              <p><span className="text-foreground font-medium">Est. duration:</span> {(titleCard && title ? 4 : 0) + scenes.filter(sceneHasVisual).reduce((a, s) => a + sceneDuration(s), 0)}s</p>
              <p><span className="text-foreground font-medium">Background music:</span> {musicFile?.name || "None"}</p>
            </div>

            <button onClick={assembleMovie} disabled={loading || !scenes.some(sceneHasVisual)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg hover:opacity-90 disabled:opacity-50">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {
                    typeof renderSceneIndex === "number" && typeof renderSceneTotal === "number" && renderSceneTotal > 0
                      ? `Rendering scene ${Math.min(renderSceneIndex + 1, renderSceneTotal)} of ${renderSceneTotal} (${Math.round(progress * 100)}%)…`
                      : `Assembling (${Math.round(progress * 100)}%)…`
                  }</>
                : <><Film className="w-4 h-4" /> Assemble Film</>}
            </button>

            <button onClick={downloadSubtitles}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <Type className="w-4 h-4" /> Download subtitles (.srt)
            </button>

            {videoUrl && (
              <div className="space-y-3">
                <video src={videoUrl} controls className="w-full rounded-2xl border border-border" />
                <div className="flex gap-3">
                  <a href={videoUrl} download target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    <Download className="w-4 h-4" /> Download
                  </a>
                  <button onClick={handleSaveToLibrary} disabled={loading || saved}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? "Saved!" : "Save to Library"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 6: Dubbing Studio ── */}
        {step === 6 && (
          <div className="space-y-4">
            {/* Progress tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {["1. Input", "2. Script", "3. Translate", "4. Preview", "5. Download"].map((label, i) => (
                <div key={i} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  i === dubStep ? "bg-violet-500 text-white"
                  : i < dubStep ? "bg-violet-500/20 text-violet-400"
                  : "bg-card border border-border text-muted-foreground"
                }`}>
                  {i < dubStep && <Check className="w-3 h-3" />} {label}
                </div>
              ))}
            </div>

            {/* Dub step 0: Input */}
            {dubStep === 0 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Upload an existing video file to dub, or use the movie you assembled in the Export step.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => document.getElementById("dub-video-input")?.click()}
                    className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all group">
                    <input id="dub-video-input" type="file" accept="video/*,audio/*" className="hidden"
                      onChange={e => handleDubVideoUpload(e.target.files?.[0])} />
                    {dubLoading ? <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto" /> : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground group-hover:text-violet-400 mx-auto mb-2 transition-colors" />
                        <p className="text-sm font-semibold text-foreground">Upload video / audio file</p>
                        <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM, MP3, WAV</p>
                      </>
                    )}
                  </div>
                  {videoUrl && (
                    <button onClick={useCurrentMovieForDubbing}
                      className="border-2 border-dashed border-cyan-500/30 rounded-2xl p-8 text-center hover:bg-cyan-500/5 transition-all group">
                      <Film className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-foreground">Use assembled movie</p>
                      <p className="text-xs text-muted-foreground mt-1">Continue from Export step</p>
                    </button>
                  )}
                </div>

                {/* AI Audio Dubbing (ElevenLabs) — a separate flow from the
                    manual translate + regenerate-voiceover flow below: no
                    script editing, just pick a target language and go. */}
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-cyan-400" /> AI Audio Dubbing
                  </p>
                  <p className="text-xs text-muted-foreground">Dub a standalone audio file (e.g. a podcast or voiceover track) into another language with AI voice cloning.</p>
                  <div
                    onClick={() => document.getElementById("ai-dub-audio-input")?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group">
                    <input id="ai-dub-audio-input" type="file" accept="audio/*" className="hidden"
                      onChange={e => handleAiDubAudioUpload(e.target.files?.[0])} />
                    {aiDubAudioFileName
                      ? <p className="text-sm font-semibold text-foreground">{aiDubAudioFileName}</p>
                      : <p className="text-sm text-muted-foreground group-hover:text-cyan-400">Click to upload an audio file</p>}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Target language</label>
                      <select value={aiDubAudioTargetLang} onChange={e => setAiDubAudioTargetLang(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-cyan-500/50">
                        {DUB_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Source language</label>
                      <select value={aiDubAudioSourceLang} onChange={e => setAiDubAudioSourceLang(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-cyan-500/50">
                        <option value="">Auto-detect</option>
                        {DUB_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Speakers</label>
                      <input type="number" min={0} max={20} value={aiDubAudioNumSpeakers}
                        onChange={e => setAiDubAudioNumSpeakers(+e.target.value)}
                        placeholder="Auto"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-cyan-500/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aiDubAudioDropBackground} onChange={e => setAiDubAudioDropBackground(e.target.checked)} className="accent-cyan-500 w-4 h-4" />
                      <span className="text-xs text-muted-foreground">Drop background audio</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aiDubAudioDisableCloning} onChange={e => setAiDubAudioDisableCloning(e.target.checked)} className="accent-cyan-500 w-4 h-4" />
                      <span className="text-xs text-muted-foreground">Disable voice cloning</span>
                    </label>
                  </div>
                  <button onClick={runAiDubAudio} disabled={!aiDubAudioSourceUrl || aiDubAudioLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {aiDubAudioLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                    {aiDubAudioLoading ? "Dubbing… this can take a few minutes" : "Dub Audio"}
                  </button>
                  {aiDubAudioResultUrl && (
                    <div className="space-y-2 pt-2">
                      <audio controls src={aiDubAudioResultUrl} className="w-full" />
                      <a href={aiDubAudioResultUrl} download target="_blank" rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                        <Download className="w-4 h-4" /> Download dubbed audio
                      </a>
                    </div>
                  )}
                </div>

                {/* AI Video Dubbing (ElevenLabs) — with optional lip-sync
                    (Replicate) and burned-in captions (ffmpeg). */}
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Languages className="w-4 h-4 text-violet-400" /> AI Video Dubbing
                  </p>
                  <p className="text-xs text-muted-foreground">Dub a video into another language with AI voice cloning, with optional lip-sync and burned-in captions.</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => document.getElementById("ai-dub-video-input")?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all group">
                      <input id="ai-dub-video-input" type="file" accept="video/*" className="hidden"
                        onChange={e => handleAiDubVideoUpload(e.target.files?.[0])} />
                      {aiDubVideoFileName && aiDubVideoFileName !== "Assembled movie"
                        ? <p className="text-sm font-semibold text-foreground">{aiDubVideoFileName}</p>
                        : <p className="text-sm text-muted-foreground group-hover:text-violet-400">Click to upload a video</p>}
                    </div>
                    {videoUrl && (
                      <button onClick={useAssembledMovieForAiDub}
                        className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${aiDubVideoFileName === "Assembled movie" ? "border-cyan-500/60 bg-cyan-500/5" : "border-cyan-500/30 hover:bg-cyan-500/5"}`}>
                        <p className="text-sm font-semibold text-foreground">Use assembled movie</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Continue from Export step</p>
                      </button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Target language</label>
                      <select value={aiDubVideoTargetLang} onChange={e => setAiDubVideoTargetLang(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-violet-500/50">
                        {DUB_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Source language</label>
                      <select value={aiDubVideoSourceLang} onChange={e => setAiDubVideoSourceLang(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-violet-500/50">
                        <option value="">Auto-detect</option>
                        {DUB_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Speakers</label>
                      <input type="number" min={0} max={20} value={aiDubVideoNumSpeakers}
                        onChange={e => setAiDubVideoNumSpeakers(+e.target.value)}
                        placeholder="Auto"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Start time (s)</label>
                      <input type="number" min={0} value={aiDubVideoStartTime}
                        onChange={e => setAiDubVideoStartTime(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">End time (s)</label>
                      <input type="number" min={0} value={aiDubVideoEndTime}
                        onChange={e => setAiDubVideoEndTime(e.target.value)}
                        placeholder="Full length"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aiDubVideoDropBackground} onChange={e => setAiDubVideoDropBackground(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                      <span className="text-xs text-muted-foreground">Drop background audio</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aiDubVideoDisableCloning} onChange={e => setAiDubVideoDisableCloning(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                      <span className="text-xs text-muted-foreground">Disable voice cloning</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aiDubVideoWatermark} onChange={e => setAiDubVideoWatermark(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                      <span className="text-xs text-muted-foreground">Watermark</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aiDubVideoHighestRes} onChange={e => setAiDubVideoHighestRes(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                      <span className="text-xs text-muted-foreground">Highest resolution</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap pt-1 border-t border-border">
                    <label className="flex items-center gap-2 cursor-pointer pt-2">
                      <input type="checkbox" checked={aiDubVideoLipSync} onChange={e => setAiDubVideoLipSync(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                      <span className="text-xs font-semibold text-foreground">Lip-sync (beta)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer pt-2">
                      <input type="checkbox" checked={aiDubVideoBurnCaptions} onChange={e => setAiDubVideoBurnCaptions(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                      <span className="text-xs font-semibold text-foreground">Burn in captions</span>
                    </label>
                  </div>
                  {aiDubVideoBurnCaptions && aiDubVideoFileName === "Assembled movie" && (
                    <p className="text-[11px] text-muted-foreground">Using your edited per-scene caption text (Scenes step) in place of the auto-transcript, where provided.</p>
                  )}
                  <button onClick={runAiDubVideo} disabled={!aiDubVideoSourceUrl || aiDubVideoLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {aiDubVideoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    {aiDubVideoLoading ? "Dubbing… this can take several minutes" : "Dub Video"}
                  </button>
                  {aiDubVideoResultUrl && (
                    <div className="space-y-2 pt-2">
                      <video src={aiDubVideoResultUrl} controls className="w-full max-h-64 rounded-xl border border-border" />
                      <div className="flex gap-2">
                        <a href={aiDubVideoResultUrl} download target="_blank" rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                          <Download className="w-4 h-4" /> Download video
                        </a>
                        {aiDubVideoCaptionsUrl && (
                          <a href={aiDubVideoCaptionsUrl} download target="_blank" rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                            <Type className="w-4 h-4" /> Download captions (.srt)
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dub step 1: Script */}
            {dubStep === 1 && (
              <div className="space-y-4">
                {dubVideoUrl && (
                  <div className="rounded-xl overflow-hidden border border-border">
                    <video src={dubVideoUrl} controls className="w-full max-h-48" />
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Original language</label>
                    <select value={dubSourceLang} onChange={e => setDubSourceLang(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-violet-500/50">
                      {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Dub into language</label>
                    <select value={dubTargetLang} onChange={e => setDubTargetLang(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-violet-500/50">
                      {LANGUAGES.filter(l => l !== dubSourceLang).map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Original script / transcript</label>
                  <textarea value={dubOriginalScript} onChange={e => setDubOriginalScript(e.target.value)}
                    placeholder="Paste or type the original dialogue/narration for the video. This is what will be translated and dubbed."
                    rows={6}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/50 resize-none" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={dubWithCaptions} onChange={e => setDubWithCaptions(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                    <span className="text-sm text-muted-foreground">Include captions</span>
                  </label>
                  {dubWithCaptions && (
                    <select value={dubCaptionLang} onChange={e => setDubCaptionLang(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-card border border-border text-xs focus:outline-none focus:border-violet-500/50">
                      <option value="original">Original language ({dubSourceLang})</option>
                      <option value="dubbed">Dubbed language ({dubTargetLang})</option>
                      <option value="both">Both languages</option>
                    </select>
                  )}
                </div>
                <button onClick={translateForDubbing} disabled={dubLoading || !dubOriginalScript.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {dubLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                  {dubLoading ? "Translating…" : `Translate to ${dubTargetLang}`}
                </button>
              </div>
            )}

            {/* Dub step 2: Review & Generate audio */}
            {dubStep === 2 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-card border border-border max-h-56 overflow-y-auto">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Original — {dubSourceLang}</p>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{dubOriginalScript}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-violet-500/20 max-h-56 overflow-y-auto">
                    <p className="text-xs font-semibold text-violet-400 mb-2">Translated — {dubTargetLang}</p>
                    <textarea value={dubTranslatedScript} onChange={e => setDubTranslatedScript(e.target.value)}
                      className="w-full text-xs text-foreground bg-transparent focus:outline-none resize-none leading-relaxed" rows={8} />
                  </div>
                </div>
                <button onClick={generateDubbedAudio} disabled={dubLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {dubLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  {dubLoading ? "Generating dubbed audio…" : `Generate ${dubTargetLang} Voiceover`}
                </button>
              </div>
            )}

            {/* Dub step 3: Preview */}
            {dubStep === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Preview your video with the dubbed audio track playing simultaneously. Use the download button for the final export.</p>
                {dubVideoUrl && (
                  <div className="rounded-xl overflow-hidden border border-border">
                    <video src={dubVideoUrl} controls className="w-full max-h-64" />
                  </div>
                )}
                {dubAudioUrl && (
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> Dubbed audio — {dubTargetLang}
                    </p>
                    <audio controls src={dubAudioUrl} className="w-full" />
                    <p className="text-[11px] text-muted-foreground mt-2">Play the video and audio together to preview the dubbing. Click Download to get both files.</p>
                  </div>
                )}
                <button onClick={() => setDubStep(4)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-semibold hover:bg-violet-500/20 transition-colors">
                  <Download className="w-4 h-4" /> Go to Download →
                </button>
              </div>
            )}

            {/* Dub step 4: Download */}
            {dubStep === 4 && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <p className="text-sm font-semibold text-foreground">Download your dubbed content</p>
                  <div className="space-y-2">
                    {dubVideoUrl && (
                      <a href={dubVideoUrl} download target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                        <Download className="w-4 h-4" /> Download Original Video
                      </a>
                    )}
                    {dubAudioUrl && (
                      <a href={dubAudioUrl} download={`dubbed-${dubTargetLang.toLowerCase()}.webm`}
                        className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-pink-500/10 border border-violet-500/20 text-sm font-semibold text-violet-400 hover:bg-violet-500/20 transition-colors">
                        <Download className="w-4 h-4" /> Download Dubbed Audio ({dubTargetLang})
                      </a>
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
                  <p className="font-semibold mb-1">Combining video + audio</p>
                  <p>To merge the dubbed audio with the original video, you can use a free tool like <strong>HandBrake</strong>, <strong>iMovie</strong>, <strong>DaVinci Resolve</strong>, or <strong>ffmpeg</strong>: replace the audio track with the dubbed file.</p>
                </div>
                {dubWithCaptions && dubTranslatedScript && (
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Caption text ({dubCaptionLang})</p>
                    <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {dubCaptionLang === "dubbed" || dubCaptionLang === "both" ? dubTranslatedScript : dubOriginalScript}
                    </pre>
                    <button onClick={() => {
                      const text = dubCaptionLang === "both"
                        ? `[${dubSourceLang}]\n${dubOriginalScript}\n\n[${dubTargetLang}]\n${dubTranslatedScript}`
                        : (dubCaptionLang === "dubbed" ? dubTranslatedScript : dubOriginalScript);
                      navigator.clipboard.writeText(text);
                    }} className="mt-2 text-xs text-fuchsia-400 hover:underline">
                      Copy captions
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {!isDubbing && (
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < 5 && (
              <button onClick={() => setStep(s => Math.min(5, s + 1))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20 transition-all">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}