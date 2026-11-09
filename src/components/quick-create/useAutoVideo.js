import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { generateText, generateImage, generateVoiceover, uploadFile, splitScriptIntoScenes, assembleLane1Video } from "@/utils/lane1";
import { renderPresetBlob } from "@/components/quick-create/musicPresets";
import { buildStoryBible, shotFor, framePrompt, clipPrompt } from "@/components/quick-create/sceneContinuity";
import { generateSceneVideo, generateMusic, submitRender, getRenderStatus, MAX_MUSIC_SECONDS } from "@/utils/lane2";

// Look applied to every shot so scenes share one grade, lens and realism.
const CINEMATIC = "Cinematic film still, shot on 35mm anamorphic lens, natural motivated lighting, realistic skin and textures, shallow depth of field, subtle film grain, consistent characters, wardrobe and colour grade across shots, no text, no watermark, no distortion.";
const CLEAN = "High quality, natural lighting, realistic, sharp detail, no text, no watermark.";

const CLIP_SECONDS = 5;

export default function useAutoVideo({ cinematic, canMotion, canMusic, ratio, resolution, referenceImageUrls, musicMode = "none", uploadedMusicUrl = "", musicPreset = "cinematic" }) {
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [result, setResult] = useState("");
  const [saved, setSaved] = useState(false);
  const [tracks, setTracks] = useState({});

  const run = async (prompt) => {
    setBusy(true); setError(""); setWarnings([]); setResult(""); setSaved(false); setProgress(0);
    const warn = (m) => setWarnings(prev => [...prev, m]);
    try {
      const sceneCount = cinematic ? 5 : 3;
      const useMotion = canMotion;
      const look = cinematic ? CINEMATIC : CLEAN;

      setStage("Writing your script"); setProgress(0.05);
      const script = (await generateText({
        type: "video_script",
        prompt: `Write a short, vivid, ${cinematic ? "cinematic, emotionally grounded" : "clear"} visual video script in plain prose (no scene labels, no markdown, no preamble) with a strong opening, a clear middle and a satisfying ending, for a video about: ${prompt}`,
        tone: "Professional",
      }) || prompt).trim();

      const sceneScripts = splitScriptIntoScenes(script, sceneCount);
      const scenes = [];
      const bible = await buildStoryBible(script, generateText);
      for (let i = 0; i < sceneScripts.length; i++) {
        setStage(`Creating scene ${i + 1} of ${sceneScripts.length}`);
        setProgress(0.1 + 0.3 * (i / sceneScripts.length));
        const base = sceneScripts[i].imagePrompt || sceneScripts[i].text || prompt;
        const shot = shotFor(i);
        const imageUrl = await generateImage({ prompt: `${framePrompt({ bible, shot, index: i, total: sceneScripts.length, text: base })} ${look}`, referenceImageUrls });
        scenes.push({ imageUrl, shot, text: sceneScripts[i].text, seconds: useMotion ? CLIP_SECONDS : 8 });
      }

      if (useMotion) {
        for (let i = 0; i < scenes.length; i++) {
          setStage(`Filming scene ${i + 1} of ${scenes.length} (1-3 min each)`);
          setProgress(0.4 + 0.3 * (i / scenes.length));
          try {
            const clip = await generateSceneVideo({
              prompt: `${clipPrompt({ bible, shot: scenes[i].shot, text: scenes[i].text || prompt })} ${look}`,
              imageUrl: scenes[i].imageUrl, durationSeconds: CLIP_SECONDS, aspectRatio: ratio,
            });
            if (clip) scenes[i] = { ...scenes[i], videoUrl: clip };
          } catch (e) {
            warn(`Scene ${i + 1} used a still image: ${e?.message || "clip failed"}`);
            if (e?.billing) break;
          }
        }
      }

      setStage("Recording the voice-over"); setProgress(0.72);
      let voiceoverUrl;
      try {
        const spoken = (await generateText({
          type: "script",
          prompt: `Rewrite this as natural, warm, conversational spoken narration only, no scene labels or directions. Plain spoken text only.\n\n${scenes.map(s => s.text).join(". ")}`,
          tone: "Professional",
        }) || scenes.map(s => s.text).join(". ")).trim();
        const blob = await generateVoiceover(spoken);
        if (blob) voiceoverUrl = await uploadFile(new File([blob], "auto-vo.mp3", { type: blob.type || "audio/mpeg" }));
      } catch (e) { warn(`No voice-over: ${e?.message || "failed"}`); }

      let musicUrl;
      if (musicMode === "upload" && uploadedMusicUrl) {
        musicUrl = uploadedMusicUrl;
      } else if (musicMode === "ai" && canMusic) {
        setStage("Composing the score"); setProgress(0.8);
        try {
          const total = scenes.reduce((a, s) => a + (Number(s.seconds) || 8), 0);
          const m = await generateMusic({
            prompt: `${cinematic ? "Cinematic" : "Uplifting"} background score for: ${prompt}`,
            durationSeconds: Math.min(MAX_MUSIC_SECONDS, Math.max(10, Math.round(total))),
            instrumental: true, mood: "cinematic",
          });
          musicUrl = m?.url;
        } catch (e) { warn(`AI music was unavailable (${e?.message || "failed"}), so a library track was used instead.`); }
      }
      // Library track: chosen directly, or the automatic fallback when AI music is unavailable.
      if (!musicUrl && (musicMode === "preset" || musicMode === "ai")) {
        try {
          const total = scenes.reduce((a, s) => a + (Number(s.seconds) || 8), 0);
          const blob = await renderPresetBlob(musicPreset, Math.round(total) + 8);
          musicUrl = await uploadFile(new File([blob], "library-music.wav", { type: "audio/wav" }));
        } catch (e) { warn(`No music: ${e?.message || "failed"}`); }
      }

      setStage("Putting it all together"); setProgress(0.88);
      const payload = { scenes, ratio, resolution, voiceoverUrl, musicUrl };
      let url;
      if (scenes.some(s => s.videoUrl)) {
        const jobId = await submitRender(payload);
        const started = Date.now();
        for (;;) {
          if (Date.now() - started > 20 * 60 * 1000) throw new Error("Assembly timed out. Please try again.");
          await new Promise(r => setTimeout(r, 4000));
          const job = await getRenderStatus(jobId);
          if (job?.status === "done") { url = job.url; break; }
          if (job?.status === "error") throw new Error(job.error || "Video assembly failed.");
        }
      } else {
        url = await assembleLane1Video(payload, { onProgress: p => setProgress(0.88 + 0.12 * p) });
      }
      if (!url) throw new Error("The video finished without a playable result.");
      setTracks({ voiceoverUrl, musicUrl });
      setResult(url); setProgress(1); setStage("");
    } catch (e) {
      setError(e?.message || "Something went wrong creating your video.");
      setStage("");
    }
    setBusy(false);
  };

  const save = async (prompt) => {
    await base44.entities.ContentAsset.create({
      type: "video", title: prompt.slice(0, 60) || "Quick Create", file_url: result, ai_generated: true, prompt_used: prompt.slice(0, 500),
      voiceover_url: tracks.voiceoverUrl, music_url: tracks.musicUrl,
    });
    setSaved(true);
  };

  return { run, save, stage, progress, busy, error, warnings, result, saved };
}