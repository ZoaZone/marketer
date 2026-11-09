// audio.js — per-step TTS voiceover + background music generation and
// muxing for the app-demo walkthrough's audio track.
//
// Reuses server-render's exact provider integrations rather than inventing
// new secret handling: ElevenLabs text-to-speech (same ELEVENLABS_API_KEY
// env var and `xi-api-key` auth header server-render/dub.js already uses
// for ElevenLabs dubbing — just a different, plain-TTS endpoint) and
// Replicate MusicGen (same REPLICATE_API_TOKEN/REPLICATE_MUSIC_MODEL env
// vars and model-by-name-vs-version-hash branching server-render/music.js
// already uses). Voiceover generation is required — a narrated demo with
// no narration defeats the point, so a failure here fails the whole job.
// Background music is best-effort: if it fails, the caller falls back to
// muxing voiceover-only rather than failing the whole recording over
// music specifically (see muxVoiceoverOnly).

import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function probeDuration(filePath) {
  const stdout = await run("ffprobe", [
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
  if (!res.body) throw new Error("download failed (empty response body)");
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

// ── Voiceover (ElevenLabs text-to-speech) ───────────────────────────────

// ElevenLabs' well-known "Rachel" sample voice — a reasonable default for
// narration; override per-deployment via ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

async function synthesizeNarration(text, destPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`ElevenLabs text-to-speech failed: ${detail}`);
  }
  if (!res.body) throw new Error("ElevenLabs text-to-speech returned an empty response body.");
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

/**
 * generateStepVoiceovers(narrations, workDir) — synthesizes each step's
 * narration to its own MP3, in order. Returns [{ path, durationSeconds }],
 * parallel to `narrations`.
 */
export async function generateStepVoiceovers(narrations, workDir) {
  const clips = [];
  for (let i = 0; i < narrations.length; i++) {
    const clipPath = path.join(workDir, `voice-${i}.mp3`);
    await synthesizeNarration(narrations[i], clipPath);
    const durationSeconds = await probeDuration(clipPath).catch(() => 0);
    clips.push({ path: clipPath, durationSeconds });
  }
  return clips;
}

/**
 * buildAlignedVoiceoverTrack(stepWindowSeconds, voiceClips, workDir) —
 * concatenates the per-step voiceover clips into one track, padding each
 * step's slot with trailing silence out to `stepWindowSeconds[i]` (the
 * *actual measured* on-screen time for that step in the recorded video —
 * goto + actions + dwell, not just the nominal dwellMs) so narration lines
 * up with when that step's screen is really on camera. A narration that
 * runs longer than its window simply extends that slot rather than being
 * cut off — the already-recorded video's own timing isn't retroactively
 * adjusted to match, so step boundaries can drift slightly late from that
 * point on for an unusually long piece of narration.
 */
export async function buildAlignedVoiceoverTrack(stepWindowSeconds, voiceClips, workDir) {
  const segments = [];
  for (let i = 0; i < voiceClips.length; i++) {
    const windowSeconds = stepWindowSeconds[i] ?? voiceClips[i].durationSeconds;
    const padSeconds = Math.max(0, windowSeconds - voiceClips[i].durationSeconds);
    const paddedPath = path.join(workDir, `voice-padded-${i}.mp3`);
    await run("ffmpeg", [
      "-y", "-i", voiceClips[i].path,
      "-af", `apad=pad_dur=${padSeconds}`,
      "-c:a", "libmp3lame",
      paddedPath,
    ]);
    segments.push(paddedPath);
  }

  const listPath = path.join(workDir, "voice-concat-list.txt");
  await fs.writeFile(listPath, segments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const trackPath = path.join(workDir, "voiceover-track.mp3");
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", trackPath]);
  return trackPath;
}

// ── Background music (Replicate MusicGen) ───────────────────────────────

const MUSICGEN_POLL_INTERVAL_MS = 2000;
const MUSICGEN_POLL_TIMEOUT_MS = 120_000;
const DEFAULT_MUSIC_MODEL = "meta/musicgen";
const DEFAULT_MUSIC_MODEL_VERSION = "stereo-large";
const MUSIC_PROMPT = "Warm, confident, tasteful corporate/tech background music — subtle and unobtrusive, no vocals";

// A single MusicGen generation isn't assumed to reliably cover an
// arbitrarily long recording — segments are generated at a conservative
// target length and crossfaded together instead of requesting one very
// long track outright (see buildBackgroundMusicTrack).
const MUSIC_SEGMENT_TARGET_SECONDS = 25;
const MUSIC_CROSSFADE_SECONDS = 2;
const MAX_MUSIC_SEGMENTS = 3;

// Same branching as music.js's createReplicatePrediction: "owner/model"
// (no version hash) uses the model-by-name endpoint; "owner/model:hash"
// uses the generic /v1/predictions endpoint with an explicit version.
async function createReplicateMusicPrediction(model, token, prompt, durationSeconds) {
  const input = {
    prompt,
    model_version: DEFAULT_MUSIC_MODEL_VERSION,
    duration: Math.round(durationSeconds),
    output_format: "mp3",
  };
  const versionHashIndex = model.indexOf(":");
  const hasVersionHash = versionHashIndex !== -1;
  const url = hasVersionHash
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${model}/predictions`;
  const body = hasVersionHash ? { version: model.slice(versionHashIndex + 1), input } : { input };

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Replicate music prediction creation failed: ${detail}`);
  }
  return res.json();
}

async function pollReplicateMusicPrediction(prediction, token) {
  const deadline = Date.now() + MUSICGEN_POLL_TIMEOUT_MS;
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (Date.now() > deadline) throw new Error("Timed out waiting for Replicate music generation to finish.");
    await sleep(MUSICGEN_POLL_INTERVAL_MS);
    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      const detail = await pollRes.text().catch(() => `${pollRes.status} ${pollRes.statusText}`);
      throw new Error(`Replicate polling failed: ${detail}`);
    }
    prediction = await pollRes.json();
  }
  if (prediction.status !== "succeeded") {
    const providerMessage = prediction.error ? String(prediction.error) : "no further detail from the provider";
    throw new Error(`Replicate music generation ${prediction.status}: ${providerMessage}`);
  }
  const output = prediction.output;
  const audioUrl = Array.isArray(output) ? output[0] : output;
  if (!audioUrl || typeof audioUrl !== "string") throw new Error("Replicate finished successfully but returned no audio URL.");
  return audioUrl;
}

async function generateMusicSegment(durationSeconds, workDir, index) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const model = process.env.REPLICATE_MUSIC_MODEL || DEFAULT_MUSIC_MODEL;

  const prediction = await createReplicateMusicPrediction(model, token, MUSIC_PROMPT, durationSeconds);
  const audioUrl = await pollReplicateMusicPrediction(prediction, token);
  const destPath = path.join(workDir, `music-segment-${index}.mp3`);
  await downloadTo(audioUrl, destPath);
  return destPath;
}

/**
 * buildBackgroundMusicTrack(totalSeconds, workDir) — a music bed at least
 * `totalSeconds` long, without looping a single short clip. Short
 * recordings get one segment generated directly at that length; longer
 * ones get 2-3 segments (capped at MAX_MUSIC_SEGMENTS), each generated
 * slightly longer than an even split, crossfaded together with ffmpeg's
 * acrossfade so the seams aren't audible jump-cuts.
 */
export async function buildBackgroundMusicTrack(totalSeconds, workDir) {
  if (totalSeconds <= MUSIC_SEGMENT_TARGET_SECONDS) {
    return generateMusicSegment(Math.ceil(totalSeconds) + 2, workDir, 0);
  }

  const segmentCount = Math.min(MAX_MUSIC_SEGMENTS, Math.max(2, Math.ceil(totalSeconds / MUSIC_SEGMENT_TARGET_SECONDS)));
  const rawSegmentSeconds = Math.ceil(totalSeconds / segmentCount) + MUSIC_CROSSFADE_SECONDS;

  const segmentPaths = [];
  for (let i = 0; i < segmentCount; i++) {
    segmentPaths.push(await generateMusicSegment(rawSegmentSeconds, workDir, i));
  }

  let trackPath = segmentPaths[0];
  for (let i = 1; i < segmentPaths.length; i++) {
    const mixedPath = path.join(workDir, `music-mix-${i}.mp3`);
    await run("ffmpeg", [
      "-y", "-i", trackPath, "-i", segmentPaths[i],
      "-filter_complex", `[0:a][1:a]acrossfade=d=${MUSIC_CROSSFADE_SECONDS}:c1=tri:c2=tri[a]`,
      "-map", "[a]",
      mixedPath,
    ]);
    trackPath = mixedPath;
  }
  return trackPath;
}

// ── Muxing ───────────────────────────────────────────────────────────────

// Fixed duck level rather than sidechain compression — same fixed-dB
// approach server-render/render.js already uses to duck background music
// under narration (there: volume=0.18 ≈ -14.9dB), chosen for
// predictability: a mistuned sidechain risks audible pumping, whereas a
// fixed bed within the requested -12..-15dB range is simple and reliable.
const MUSIC_DUCK_DB = -14;
const MUSIC_DUCK_LINEAR = Math.pow(10, MUSIC_DUCK_DB / 20);

/**
 * muxWalkthroughAudio(videoPath, voiceoverTrackPath, musicTrackPath,
 * totalSeconds, workDir) — mixes the voiceover (full volume) and music
 * (ducked to MUSIC_DUCK_DB) into one audio track and muxes it onto the
 * silent video. No text overlay of any kind — video stream is a pure
 * `-c:v copy` passthrough. Returns the finished MP4's path.
 */
export async function muxWalkthroughAudio(videoPath, voiceoverTrackPath, musicTrackPath, totalSeconds, workDir) {
  const finalPath = path.join(workDir, "app-demo-final.mp4");
  await run("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", voiceoverTrackPath,
    "-stream_loop", "-1", "-i", musicTrackPath,
    "-filter_complex",
    `[2:a]volume=${MUSIC_DUCK_LINEAR}[music];[1:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac",
    "-t", String(totalSeconds),
    "-shortest",
    finalPath,
  ]);
  return finalPath;
}

/** Same as muxWalkthroughAudio but voiceover-only — the fallback when background music generation fails. */
export async function muxVoiceoverOnly(videoPath, voiceoverTrackPath, totalSeconds, workDir) {
  const finalPath = path.join(workDir, "app-demo-final.mp4");
  await run("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", voiceoverTrackPath,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac",
    "-t", String(totalSeconds),
    "-shortest",
    finalPath,
  ]);
  return finalPath;
}
