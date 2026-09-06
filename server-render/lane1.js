// lane1.js — FFmpeg finishing pipeline for Lane 1 (Base44-native short
// video: Quick Create, Campaign Studio, Demo Video Maker). Lane 1 keeps
// generating its images/voiceover/music the Base44-native way (generateImage,
// generateVoiceover, generateMusic) — this module only replaces the final
// assembly step, which used to happen client-side via Canvas+MediaRecorder
// (src/utils/videoAssembler.js, WebM/VP9, no real encode control). No
// Replicate calls here — this is pure FFmpeg muxing/encoding, the same
// binary render.js (Lane 2) already uses, just a separate, simpler pipeline
// so Lane 2/Movie Maker's behavior is untouched.
//
// Structurally this mirrors render.js closely (Ken Burns per-scene clips ->
// concat demuxer -> upload), duplicated rather than imported — same
// small-helpers-per-module convention every file in this directory already
// follows. It's simpler than render.js in one way (no video-clip branching
// — every scene is a still) and adds one thing render.js doesn't have: a
// dedicated finishing pass (contrast/saturation normalize + loudnorm + the
// final high-quality encode).
//
// Two things it used to be simpler in, and no longer is, because both were
// defects rather than simplifications:
//
//   * Audio was one-of-three (voiceover XOR music XOR silent), so a short
//     with narration shipped with its generated music silently dropped —
//     "voice over without music" was the exact report. Narration and music
//     are now independent, and mix.
//   * Narration was a single track spanning the whole film, which plays over
//     the pictures like a documentary voice-over rather than landing on the
//     scene it belongs to. Scenes now take their own scene.voiceUrl — the
//     same field render.js has always understood — and a scene stretches to
//     fit its own line, which is what makes dialogue land in sync.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

// "1080p" is the default/recommended tier; "720p" is the lighter option —
// selectable per the resolution selector in Quick Create/Campaign
// Studio/Demo Video Maker.
const RESOLUTIONS = {
  "1080p": {
    "16:9": { w: 1920, h: 1080 },
    "9:16": { w: 1080, h: 1920 },
    "1:1": { w: 1080, h: 1080 },
    "4:5": { w: 1080, h: 1350 },
  },
  "720p": {
    "16:9": { w: 1280, h: 720 },
    "9:16": { w: 720, h: 1280 },
    "1:1": { w: 720, h: 720 },
    "4:5": { w: 720, h: 900 },
  },
};

const FPS = 30;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function probeDuration(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, bytes);
}

function assetPath(workDir, name) {
  return path.join(workDir, `${name}.bin`);
}

// Same fallback-to-solid-frame behavior as render.js's ensureSceneImage — a
// dead image URL must not kill the whole job.
async function ensureSceneImage(imageUrl, destPath, w, h) {
  try {
    await downloadTo(imageUrl, destPath);
    const stat = await fs.stat(destPath);
    if (!stat.size) throw new Error("downloaded file is empty");
  } catch (e) {
    console.error(`[lane1] scene image failed (${imageUrl}): ${e.message} — using a solid dark placeholder frame.`);
    await run("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `color=c=0x0a0a0a:s=${w}x${h}`,
      "-frames:v", "1", "-vcodec", "png", "-f", "image2",
      destPath,
    ]);
  }
}

// Same Ken Burns technique as render.js's buildKenBurnsAndCover.
function buildKenBurnsAndCover(w, h, frames) {
  const perFrame = (0.06 / Math.max(1, frames)).toFixed(6);
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='min(zoom+${perFrame},1.06)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
}

/**
 * One scene: still image, cover-fit + Ken Burns zoom.
 *
 * With no voicePath the clip is silent and runs for exactly its requested
 * seconds — the original behaviour, unchanged.
 *
 * With a voicePath the scene carries its OWN line, and its duration becomes
 * at least as long as that line (apad holds the track out to the full clip
 * so a short line does not truncate the picture). This is the same rule
 * render.js applies per scene, and it is the whole mechanism behind
 * synchronised dialogue: a scene cannot end before the words spoken over it
 * do, so line and picture stay together without anyone computing timings.
 *
 * Audio is normalised to stereo 44.1kHz in both branches, so a film mixing
 * voiced and silent scenes concatenates cleanly.
 */
async function buildSceneClip(scene, index, imagePath, voicePath, workDir, w, h) {
  const requestedSeconds = Math.max(0.5, Number(scene.seconds) || 5);
  const voiceSeconds = voicePath ? await probeDuration(voicePath).catch(() => 0) : 0;
  const clipSeconds = Math.max(requestedSeconds, voiceSeconds);
  const frames = Math.max(1, Math.round(clipSeconds * FPS));
  const vf = buildKenBurnsAndCover(w, h, frames);
  const outPath = path.join(workDir, `scene-${index}.mp4`);

  const args = ["-y", "-loop", "1", "-i", imagePath];
  if (voicePath) {
    args.push(
      "-i", voicePath,
      "-filter_complex", `[0:v]${vf}[v];[1:a]apad=whole_dur=${clipSeconds}[a]`,
      "-map", "[v]", "-map", "[a]",
    );
  } else {
    args.push(
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex", `[0:v]${vf}[v]`,
      "-map", "[v]", "-map", "1:a",
    );
  }
  args.push(
    "-t", String(clipSeconds),
    "-r", String(FPS),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac", "-ar", "44100", "-ac", "2",
    outPath,
  );

  await run("ffmpeg", args);
  return outPath;
}

async function concatScenes(clipPaths, workDir) {
  const listPath = path.join(workDir, "concat-list.txt");
  const listContents = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, listContents);

  const concatPath = path.join(workDir, "concat.mp4");
  await run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac",
    concatPath,
  ]);
  return concatPath;
}

// The "produced" feel: a light auto contrast/saturation lift, plus loudnorm
// on whatever audio the mix below produces.
const FINISHING_VF = "eq=contrast=1.05:saturation=1.12";

// How loud the music sits. Under narration it is a bed, not a co-lead —
// 0.18 is the same figure render.js uses for exactly this mix. With nothing
// to sit under, it IS the track.
const MUSIC_UNDER_NARRATION_VOLUME = 0.18;
const MUSIC_ALONE_VOLUME = 0.9;

/**
 * planAudioMix — the audio half of the finishing pass, as data.
 *
 * Returns { filters, extraInputs } where `filters` are the -filter_complex
 * clauses that produce a single [aout], and `extraInputs` names the inputs
 * to append after the concat, in order. Split out from finishAndEncode
 * because the ordering rules here are exactly what went wrong before and
 * are worth testing without spawning ffmpeg:
 *
 *   - input indices must follow the order inputs are appended;
 *   - amix's duration=first must resolve to the FILM, so anything that can
 *     outlast it (a looped music track) has to be the second input, and
 *     anything shorter has to be apad'd out to the full runtime first;
 *   - music ducks only when there is narration to duck under.
 *
 * The concat's own audio track (index 0) already carries per-scene dialogue,
 * so scene voice needs a label but no input.
 */
export function planAudioMix({ hasSceneVoice, hasVoiceover, hasMusic, videoDuration }) {
  const filters = [];
  const extraInputs = [];
  let inputIndex = 1;
  let narrationLabel = null;

  if (hasSceneVoice) {
    filters.push(`[0:a]apad=whole_dur=${videoDuration}[scenevo]`);
    narrationLabel = "scenevo";
  }

  if (hasVoiceover) {
    extraInputs.push("voiceover");
    filters.push(`[${inputIndex}:a]apad=whole_dur=${videoDuration}[projvo]`);
    if (narrationLabel) {
      filters.push(`[${narrationLabel}][projvo]amix=inputs=2:duration=first:dropout_transition=0[narr]`);
      narrationLabel = "narr";
    } else {
      narrationLabel = "projvo";
    }
    inputIndex += 1;
  }

  let mixLabel = narrationLabel;
  if (hasMusic) {
    extraInputs.push("music");
    const volume = narrationLabel ? MUSIC_UNDER_NARRATION_VOLUME : MUSIC_ALONE_VOLUME;
    filters.push(`[${inputIndex}:a]volume=${volume}[music]`);
    if (narrationLabel) {
      filters.push(`[${narrationLabel}][music]amix=inputs=2:duration=first:dropout_transition=0[mixed]`);
      mixLabel = "mixed";
    } else {
      mixLabel = "music";
    }
    inputIndex += 1;
  }

  if (!mixLabel) return { filters: [], extraInputs: [], silent: true };

  filters.push(`[${mixLabel}]loudnorm[aout]`);
  return { filters, extraInputs, silent: false };
}

/**
 * Final assembly: builds the audio mix, applies the finishing pass, and
 * re-encodes at the target quality (-preset slow -crf 20 -pix_fmt yuv420p,
 * capped toward ~8-10 Mbps via -maxrate/-bufsize, +faststart for immediate
 * web playback).
 *
 * The mix used to be a three-way either/or — voiceover XOR music XOR silent
 * — which is why a Quick Create short that had generated BOTH a voiceover
 * and a music track shipped with only the voiceover. There is no reason
 * these compete: the graph below layers whatever exists.
 *
 *   scene voice (already inside the concat's own audio track)
 *   + project-wide narration, held out to the film's length
 *   + music, ducked under whatever narration is present
 *   -> loudnorm
 *
 * Any subset is valid, including none of it, which is the silent case.
 */
async function finishAndEncode({ concatPath, hasSceneVoice, voiceoverPath, musicPath, workDir }) {
  const outPath = path.join(workDir, "out.mp4");
  const encodeArgs = [
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-maxrate", "10M", "-bufsize", "20M",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
  ];

  if (!hasSceneVoice && !voiceoverPath && !musicPath) {
    // Silent — keep the concat step's existing silent audio track, just
    // apply the video finishing pass and re-encode at final quality.
    await run("ffmpeg", [
      "-y", "-i", concatPath,
      "-vf", FINISHING_VF,
      ...encodeArgs,
      outPath,
    ]);
    return outPath;
  }

  const videoDuration = await probeDuration(concatPath);
  const plan = planAudioMix({
    hasSceneVoice,
    hasVoiceover: !!voiceoverPath,
    hasMusic: !!musicPath,
    videoDuration,
  });

  const inputArgs = ["-i", concatPath];
  for (const source of plan.extraInputs) {
    if (source === "voiceover") inputArgs.push("-i", voiceoverPath);
    // -stream_loop -1 belongs to the input that FOLLOWS it, so a track
    // shorter than the film repeats instead of dropping out halfway.
    else if (source === "music") inputArgs.push("-stream_loop", "-1", "-i", musicPath);
  }

  await run("ffmpeg", [
    "-y", ...inputArgs,
    "-filter_complex", [`[0:v]${FINISHING_VF}[v]`, ...plan.filters].join(";"),
    "-map", "[v]", "-map", "[aout]",
    ...encodeArgs, "-shortest",
    outPath,
  ]);
  return outPath;
}

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as every other
// server-render module's uploadToBase44/uploadResult.
async function uploadToBase44(filePath) {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "video/mp4" }), "lane1-video.mp4");

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${uploadToken}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Upload to Base44 failed: ${detail}`);
  }
  const data = await res.json();
  if (!data?.file_url) throw new Error("Upload succeeded but the response had no file_url.");
  return data.file_url;
}

/**
 * assembleLane1Video(project, onProgress) — project = { scenes: [{
 * imageUrl, seconds, voiceUrl? }], ratio ("16:9"|"9:16"|"1:1"|"4:5"),
 * resolution ("1080p"|"720p", default "1080p"), voiceoverUrl?, musicUrl?,
 * audioMode? }. Downloads scene images, builds a Ken Burns clip per scene
 * (2-4 scenes concatenate into one continuous 16-32s short — no special
 * "stitch" mode needed, concatenation already handles any scene count),
 * mixes the audio, applies a contrast/saturation + loudnorm finishing pass,
 * encodes at -preset slow -crf 20 -pix_fmt yuv420p capped toward ~8-10 Mbps
 * with +faststart, uploads to Base44, and returns the persistent file_url.
 *
 * AUDIO. Each of the three sources is independent and any combination is
 * valid:
 *
 *   scene.voiceUrl  per-scene dialogue — the scene stretches to fit its own
 *                   line, which is what keeps speech in sync with picture
 *   voiceoverUrl    one narration track spanning the whole short
 *   musicUrl        background music, ducked under any narration
 *
 * `audioMode` is the LEGACY field ("voiceover"|"music"|"silent"), kept only
 * so already-deployed callers behave exactly as before: it gated which of
 * voiceoverUrl/musicUrl was allowed to be used, and — being a single choice
 * — silently discarded the other one. A caller that sends no audioMode gets
 * everything it supplied, which is the current behaviour and the fix for
 * "the music was generated but the video came back with only the voiceover".
 */
export async function assembleLane1Video(project, onProgress = () => {}) {
  const resolutionTier = RESOLUTIONS[project.resolution] ? project.resolution : "1080p";
  const { w, h } = RESOLUTIONS[resolutionTier][project.ratio] || RESOLUTIONS[resolutionTier]["9:16"];
  // Legacy gate — see the audioMode note in this function's docblock. With
  // no audioMode at all, nothing is gated and every supplied track is used.
  const legacyMode = ["voiceover", "music", "silent"].includes(project.audioMode) ? project.audioMode : null;
  const wantVoiceover = legacyMode ? legacyMode === "voiceover" : true;
  const wantMusic = legacyMode ? legacyMode === "music" : true;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "lane1-"));

  try {
    onProgress(0);

    const scenes = Array.isArray(project.scenes) ? project.scenes.filter((s) => s?.imageUrl) : [];
    if (!scenes.length) {
      throw new Error("project.scenes must include at least one scene with an imageUrl");
    }

    // ── Download stage (0 -> 0.1) ──
    const sceneImagePaths = [];
    for (let i = 0; i < scenes.length; i++) {
      const imgPath = assetPath(workDir, `scene-${i}-image`);
      await ensureSceneImage(scenes[i].imageUrl, imgPath, w, h);
      sceneImagePaths.push(imgPath);
    }

    // Per-scene dialogue. Every download here is best-effort and per scene:
    // one unreachable line renders that scene silently rather than failing
    // the film, matching how render.js treats the same field (and how a
    // `blob:` URL persisted from another browser tab used to kill an entire
    // Movie Maker render before that guard existed).
    const sceneVoicePaths = [];
    for (let i = 0; i < scenes.length; i++) {
      let voicePath = null;
      if (scenes[i].voiceUrl && !/^blob:/i.test(scenes[i].voiceUrl)) {
        const candidate = assetPath(workDir, `scene-${i}-voice`);
        try {
          await downloadTo(scenes[i].voiceUrl, candidate);
          voicePath = ((await probeDuration(candidate).catch(() => 0)) > 0) ? candidate : null;
          if (!voicePath) {
            console.error(`[lane1] scene ${i} voice track has no readable audio (${scenes[i].voiceUrl}) — rendering this scene without dialogue.`);
          }
        } catch (e) {
          console.error(`[lane1] scene ${i} voice download failed (${scenes[i].voiceUrl}): ${e.message} — rendering this scene without dialogue.`);
        }
      }
      sceneVoicePaths.push(voicePath);
    }
    const hasSceneVoice = sceneVoicePaths.some(Boolean);

    let voiceoverPath = null;
    if (wantVoiceover && project.voiceoverUrl) {
      voiceoverPath = assetPath(workDir, "voiceover");
      try {
        await downloadTo(project.voiceoverUrl, voiceoverPath);
      } catch (e) {
        console.error(`[lane1] voiceover download failed (${project.voiceoverUrl}): ${e.message} — continuing without the project narration.`);
        voiceoverPath = null;
      }
    }

    let musicPath = null;
    if (wantMusic && project.musicUrl) {
      musicPath = assetPath(workDir, "music");
      try {
        await downloadTo(project.musicUrl, musicPath);
      } catch (e) {
        console.error(`[lane1] music download failed (${project.musicUrl}): ${e.message} — continuing without background music.`);
        musicPath = null;
      }
    }
    onProgress(0.1);

    // ── Per-scene clips (0.1 -> 0.6) ──
    const clipPaths = [];
    for (let i = 0; i < scenes.length; i++) {
      clipPaths.push(await buildSceneClip(scenes[i], i, sceneImagePaths[i], sceneVoicePaths[i], workDir, w, h));
      onProgress(0.1 + ((i + 1) / scenes.length) * 0.5);
    }

    // ── Concat (0.6 -> 0.7) ──
    const concatPath = await concatScenes(clipPaths, workDir);
    onProgress(0.7);

    // ── Finishing pass + final encode (0.7 -> 0.95) ──
    const finalPath = await finishAndEncode({ concatPath, hasSceneVoice, voiceoverPath, musicPath, workDir });
    onProgress(0.95);

    // ── Upload (0.95 -> 1.0) ──
    const url = await uploadToBase44(finalPath);
    onProgress(1.0);
    return url;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
