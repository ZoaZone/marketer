// render.js — the FFmpeg pipeline for a single render job.
//
// Everything here runs one job at a time (index.js enforces that), inside a
// unique temp directory that this module owns end-to-end: it creates the
// directory, does all its work inside it, and always removes it before
// returning or throwing.
//
// "Has any visual" rule: a scene no longer needs an imageUrl specifically —
// it just needs *something* to show. A scene counts as valid if it has any
// of: a non-empty imageUrl, a non-empty videoUrl, or a non-empty clips[]
// array with at least one entry carrying its own videoUrl or imageUrl (see
// hasSceneVisual). A project is valid once every one of its scenes passes
// that test. This is what let Movie Maker's video-only scenes (a scene with
// an AI-generated clip but no still image at all) stop being rejected with
// "project.scenes must include at least one scene with an imageUrl" — the
// client and the Base44 assembler had already stopped requiring imageUrl;
// this worker was the one place still enforcing it.

import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RESOLUTIONS = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FPS = 30;

// A long film can involve dozens of scene assets (images, clips, voice
// tracks) downloaded one after another over the life of a single render —
// env-configurable so Railway can raise them without a redeploy, but with
// defaults generous enough for a genuine feature-length project.
export const MAX_SCENES = Number(process.env.MAX_SCENES) || 12;
export const MAX_TOTAL_DURATION_SECONDS = Number(process.env.MAX_TOTAL_DURATION_SECONDS) || 3600;

// When a scene's voiceover runs longer than its video clip, something has
// to fill the gap. SCENE_FILL controls what: "loop" (default) seamlessly
// re-plays the clip from the start; "slow" stretches its own playback
// speed (setpts) to fill the gap in place instead of repeating; "freeze"
// explicitly holds the last frame (the old, *implicit* behavior before
// this was configurable — the clip's video stream simply ran out early
// and most players hold the last frame while audio kept playing, which
// reads as the video getting stuck far more than looping or slowing does)
// — kept available for backward compatibility, but no longer the default.
const VALID_SCENE_FILL_STRATEGIES = new Set(["loop", "slow", "freeze"]);
const SCENE_FILL = (() => {
  const raw = (process.env.SCENE_FILL || "loop").toLowerCase();
  if (!VALID_SCENE_FILL_STRATEGIES.has(raw)) {
    console.error(`[render] SCENE_FILL="${process.env.SCENE_FILL}" is not one of loop|slow|freeze — defaulting to loop.`);
    return "loop";
  }
  return raw;
})();

// Whether a scene's narration/subtitle text gets burned into the video
// via drawtext at all. A per-project `burnSubtitles: true|false` in the
// request body always wins when present; BURN_SUBTITLES_DEFAULT is only
// the fallback for a request that omits the field entirely. Defaults to
// off — most callers (e.g. Movie Maker's "Assemble Film" export) already
// have subtitles as a separate downloadable .srt and don't want them
// hardcoded into the picture too.
const BURN_SUBTITLES_DEFAULT = String(process.env.BURN_SUBTITLES_DEFAULT || "false").toLowerCase() === "true";

// MUSIC_ENABLED is a global kill switch — when off, no project's music
// (regardless of whether it supplies a musicUrl) is mixed in at all.
const MUSIC_ENABLED = String(process.env.MUSIC_ENABLED ?? "true").toLowerCase() !== "false";

// MUSIC_MODE controls how a music track shorter than the film gets
// extended to cover its full length: "single" loops it end-to-end via
// -stream_loop — a hard cut at every loop point, and the only behavior
// this worker had before this was configurable. "varied" (default)
// instead builds the extended track by concatenating as many repetitions
// of the source as needed, each stitched to the next with a short
// crossfade (see buildVariedMusicTrack), so the loop points aren't
// audible hard cuts.
const VALID_MUSIC_MODES = new Set(["single", "varied"]);
const MUSIC_MODE = (() => {
  const raw = (process.env.MUSIC_MODE || "varied").toLowerCase();
  if (!VALID_MUSIC_MODES.has(raw)) {
    console.error(`[render] MUSIC_MODE="${process.env.MUSIC_MODE}" is not one of single|varied — defaulting to varied.`);
    return "varied";
  }
  return raw;
})();

const MUSIC_CROSSFADE_SECONDS = 2;

/**
 * Runs a child process with args passed as an array (never a shell string —
 * user-controlled text, e.g. prompts/subtitles, must never be interpolated
 * into a command line). Resolves with { stdout, stderr } on exit code 0,
 * rejects with an Error containing the last ~2000 chars of stderr otherwise.
 */
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SCENE_RETRY_MAX_ATTEMPTS = 3;
const SCENE_RETRY_BASE_DELAY_MS = 2000;

// A single scene's build is one FFmpeg/download pipeline (buildSceneClip) —
// a transient failure partway through (a flaky download, a momentary
// resource blip) shouldn't sink the entire film. Retries the whole scene
// build from scratch with exponential backoff (2s, then 4s) rather than
// trying to resume mid-pipeline.
async function withSceneRetry(buildFn, sceneIndex) {
  let lastErr;
  for (let attempt = 0; attempt < SCENE_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await buildFn();
    } catch (e) {
      lastErr = e;
      if (attempt === SCENE_RETRY_MAX_ATTEMPTS - 1) break;
      const delay = SCENE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.error(`[render] scene ${sceneIndex} build failed (attempt ${attempt + 1}/${SCENE_RETRY_MAX_ATTEMPTS}): ${lastErr.message} — retrying in ${delay}ms.`);
      await sleep(delay);
    }
  }
  throw lastErr;
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

/**
 * Given a video file whose real (`naturalSeconds`) duration is shorter
 * than the `targetSeconds` it needs to fill, returns the ffmpeg input
 * args and an optional video-filter fragment (no leading comma — callers
 * append it to an existing filter chain with `,${fill.vf}`, or use it
 * standalone when there's no other filter) implementing SCENE_FILL. Only
 * ever called when naturalSeconds < targetSeconds — a clip already at
 * least as long as its target needs no filling at all.
 */
function videoFillFor(videoPath, naturalSeconds, targetSeconds) {
  if (SCENE_FILL === "loop") {
    // -stream_loop must precede the -i it applies to — loops the raw file
    // at the demuxer level so there's always enough source video for the
    // filter graph; the caller's own "-t" then trims the output to the
    // exact target. A hard cut at each loop point, not a crossfade, but
    // seamless-looking for most clips and far less jarring than a static
    // freeze.
    return { inputArgs: ["-stream_loop", "-1", "-i", videoPath], vf: "" };
  }
  if (SCENE_FILL === "slow") {
    // Stretches the clip's own playback speed to exactly fill
    // targetSeconds instead of repeating it — motion continues at a
    // slower pace rather than restarting from frame 1.
    const ratio = targetSeconds / Math.max(0.1, naturalSeconds);
    return { inputArgs: ["-i", videoPath], vf: `setpts=${ratio.toFixed(6)}*PTS` };
  }
  // "freeze" — explicit backward-compat: hold the last decoded frame for
  // the remaining time via tpad, rather than relying on the video stream
  // simply ending early and a player's own behavior when that happens
  // (the old, implicit version of this same visual result).
  const padSeconds = Math.max(0, targetSeconds - naturalSeconds);
  return { inputArgs: ["-i", videoPath], vf: `tpad=stop_mode=clone:stop_duration=${padSeconds.toFixed(3)}` };
}

/**
 * buildVariedMusicTrack(musicPath, naturalSeconds, targetSeconds, workDir)
 * — MUSIC_MODE="varied"'s alternative to -stream_loop: extends musicPath
 * to at least targetSeconds by repeatedly crossfading another copy of the
 * *original* source onto the accumulated track (ffmpeg's acrossfade, same
 * technique server-capture/audio.js uses for its own background-music
 * segments) instead of a hard end-to-start loop cut. Only ever called when
 * naturalSeconds < targetSeconds — a track already long enough needs no
 * extending. Bounded by MAX_REPEATS so a very short source paired with a
 * very long film can't loop indefinitely.
 */
async function buildVariedMusicTrack(musicPath, naturalSeconds, targetSeconds, workDir) {
  const MAX_REPEATS = 20;
  let trackPath = musicPath;
  let currentDuration = naturalSeconds;
  let i = 0;
  while (currentDuration < targetSeconds && i < MAX_REPEATS) {
    i += 1;
    const mixedPath = path.join(workDir, `music-varied-${i}.mp3`);
    await run("ffmpeg", [
      "-y", "-i", trackPath, "-i", musicPath,
      "-filter_complex", `[0:a][1:a]acrossfade=d=${MUSIC_CROSSFADE_SECONDS}:c1=tri:c2=tri[a]`,
      "-map", "[a]",
      mixedPath,
    ]);
    trackPath = mixedPath;
    currentDuration = await probeDuration(trackPath).catch(() => currentDuration + naturalSeconds - MUSIC_CROSSFADE_SECONDS);
  }
  return trackPath;
}

// Streams the response body straight to disk rather than buffering the
// whole file in memory first (Buffer.from(await res.arrayBuffer())) — a
// long film downloads dozens of assets over one render's lifetime, and
// holding each one fully in memory just to immediately write it out was
// unnecessary peak-memory pressure that only gets worse as films get longer.
async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
  if (!res.body) throw new Error("download failed (empty response body)");
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

// Downloaded media is always saved with a generic .bin extension —
// ffmpeg/ffprobe probe file *content* (magic bytes) to detect format on
// input, so the extension doesn't need to match; this sidesteps having to
// guess/trust a real extension from an arbitrary URL.
function assetPath(workDir, name) {
  return path.join(workDir, `${name}.bin`);
}

// A scene image that fails to download (dead link, transient network
// error, etc.) must not kill the whole render — fall back to a solid dark
// frame at the target resolution instead. Explicit -vcodec/-f here because
// the destination path ends in .bin, which ffmpeg can't infer an output
// muxer from.
async function ensureSceneImage(imageUrl, destPath, w, h) {
  try {
    await downloadTo(imageUrl, destPath);
    const stat = await fs.stat(destPath);
    if (!stat.size) throw new Error("downloaded file is empty");
  } catch (e) {
    console.error(`[render] scene image failed (${imageUrl}): ${e.message} — using a solid dark placeholder frame.`);
    await run("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `color=c=0x0a0a0a:s=${w}x${h}`,
      "-frames:v", "1", "-vcodec", "png", "-f", "image2",
      destPath,
    ]);
  }
}

// drawtext has no built-in word-wrap — pre-wrap into lines ourselves and
// let the textfile carry literal newlines (drawtext renders multi-line
// textfile content as separate lines, spaced by line_spacing).
function wrapText(text, maxChars) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

// Writes wrapped text to its own temp file and returns the path, for use
// with drawtext's textfile= option. This is the reason burned-in text is
// safe here: textfile= reads the file's raw bytes as the string to draw,
// so arbitrary user text (quotes, colons, backslashes — all filtergraph
// metacharacters) never has to be escaped into a filter expression at all.
async function writeTextfile(workDir, name, text, maxChars) {
  const wrapped = wrapText(text, maxChars);
  const filePath = path.join(workDir, `${name}.txt`);
  await fs.writeFile(filePath, wrapped, "utf8");
  return filePath;
}

// Ken Burns: a slow, subtle zoom (up to 6% over the clip) via zoompan.
// zoompan needs the pre-scaled/cropped frame and an explicit frame count
// (`d`) matching the clip's actual length at FPS.
function buildKenBurnsAndCover(w, h, frames) {
  const perFrame = (0.06 / Math.max(1, frames)).toFixed(6);
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='min(zoom+${perFrame},1.06)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
}

function subtitleDrawtext(w, h, textfilePath) {
  const fontSize = Math.round(w * 0.035);
  const marginBottom = Math.round(h * 0.06);
  return `drawtext=fontfile=${FONT_PATH}:textfile=${textfilePath}:fontsize=${fontSize}:fontcolor=white:line_spacing=8:box=1:boxcolor=black@0.5:boxborderw=14:x=(w-text_w)/2:y=h-text_h-${marginBottom}`;
}

// A scene is valid — has "any visual" — if it carries an imageUrl, a
// videoUrl, or a clips[] array with at least one entry that itself has a
// videoUrl or imageUrl. Exported so index.js's /render route can run the
// exact same check before a job is even queued, instead of duplicating a
// second, potentially-drifting copy of this logic.
export function hasSceneVisual(scene) {
  if (!scene) return false;
  if (typeof scene.imageUrl === "string" && scene.imageUrl.trim()) return true;
  if (typeof scene.videoUrl === "string" && scene.videoUrl.trim()) return true;
  if (Array.isArray(scene.clips)) {
    return scene.clips.some((c) =>
      c && (
        (typeof c.videoUrl === "string" && c.videoUrl.trim()) ||
        (typeof c.imageUrl === "string" && c.imageUrl.trim())
      )
    );
  }
  return false;
}

/**
 * resolveSceneShots(scene) — returns the ordered list of shots to render for
 * one scene:
 *  - scene.clips, if it's a non-empty array: each entry is its own shot, in
 *    order, chained back-to-back within this one scene.
 *  - else scene.videoUrl: a single video shot for scene.seconds.
 *  - else scene.imageUrl: a single image shot for scene.seconds (Ken Burns).
 *  - else: no shots — callers should already have excluded any scene that
 *    fails hasSceneVisual before reaching this.
 * Every shot is normalized to { videoUrl, imageUrl, seconds }.
 */
function resolveSceneShots(scene) {
  const fallbackSeconds = Math.max(0.5, Number(scene.seconds) || 5);
  if (Array.isArray(scene.clips) && scene.clips.length) {
    return scene.clips.map((clip) => ({
      videoUrl: clip?.videoUrl || undefined,
      imageUrl: clip?.imageUrl || undefined,
      seconds: Math.max(0.5, Number(clip?.seconds) || fallbackSeconds),
    }));
  }
  if (scene.videoUrl) {
    return [{ videoUrl: scene.videoUrl, imageUrl: undefined, seconds: fallbackSeconds }];
  }
  if (scene.imageUrl) {
    return [{ videoUrl: undefined, imageUrl: scene.imageUrl, seconds: fallbackSeconds }];
  }
  return [];
}

/**
 * estimateProjectDurationSeconds(project) — sum of every scene's resolved
 * shot durations, plus the title card if enabled. Used to enforce
 * MAX_TOTAL_DURATION_SECONDS before a render is even queued (index.js) and
 * again inside renderProject itself, and to duration-weight per-scene
 * progress reporting (a 2-second scene and a 40-second scene shouldn't move
 * the progress bar by the same amount). Exported so index.js's /render
 * route can reuse the exact same estimate instead of a second, potentially
 * drifting copy of this math.
 */
export function estimateProjectDurationSeconds(project) {
  const scenes = Array.isArray(project?.scenes) ? project.scenes : [];
  const titleSeconds = project?.titleCard?.enabled ? Math.max(1, Number(project.titleCard.seconds) || 4) : 0;
  const scenesSeconds = scenes.reduce(
    (sum, s) => sum + resolveSceneShots(s).reduce((shotSum, shot) => shotSum + shot.seconds, 0),
    0
  );
  return titleSeconds + scenesSeconds;
}

/**
 * Builds one shot's SILENT (no audio stream) video-only clip, trimmed/
 * scaled to shot.seconds and, only when `burnSubtitles` is true, with the
 * scene's subtitle burned in via drawtext (same static text for every shot
 * in the scene, so this reads identically to burning it once on the
 * concatenated result): a video shot is a cover-fit passthrough (no Ken
 * Burns — it's already motion), an image shot is the existing cover-fit +
 * Ken Burns zoom. A shot with neither its own working video nor its own
 * image falls back to the scene's poster image (whatever image exists
 * anywhere in the project, if any — see findPosterImage) rather than
 * failing outright, mirroring ensureSceneImage's own download-failure
 * fallback.
 */
async function buildShotClip(shot, sceneIndex, shotIndex, posterImagePath, subtitle, workDir, w, h, burnSubtitles) {
  let videoPath = null;
  let videoNaturalSeconds = 0;
  if (shot.videoUrl) {
    const candidatePath = assetPath(workDir, `scene-${sceneIndex}-shot-${shotIndex}-clip`);
    try {
      await downloadTo(shot.videoUrl, candidatePath);
      videoPath = candidatePath;
      videoNaturalSeconds = await probeDuration(candidatePath).catch(() => 0);
    } catch (e) {
      console.error(`[render] shot video failed (${shot.videoUrl}): ${e.message} — using an image instead.`);
    }
  }

  let imagePath = null;
  if (!videoPath) {
    if (shot.imageUrl) {
      imagePath = assetPath(workDir, `scene-${sceneIndex}-shot-${shotIndex}-image`);
      await ensureSceneImage(shot.imageUrl, imagePath, w, h);
    } else {
      imagePath = posterImagePath;
    }
  }

  const frames = Math.max(1, Math.round(shot.seconds * FPS));
  let vf = videoPath
    ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
    : buildKenBurnsAndCover(w, h, frames);

  let inputArgs = videoPath ? ["-i", videoPath] : ["-loop", "1", "-i", imagePath];
  // A shot's video coming in shorter than its own requested seconds (a
  // model returning a slightly-off duration, etc.) is the same underlying
  // gap SCENE_FILL exists for, just at the per-shot level rather than the
  // whole-scene/voiceover level below.
  if (videoPath && videoNaturalSeconds > 0 && videoNaturalSeconds < shot.seconds) {
    const fill = videoFillFor(videoPath, videoNaturalSeconds, shot.seconds);
    inputArgs = fill.inputArgs;
    if (fill.vf) vf += `,${fill.vf}`;
  }

  if (burnSubtitles && subtitle && subtitle.trim()) {
    const textfilePath = await writeTextfile(workDir, `scene-${sceneIndex}-shot-${shotIndex}-subtitle`, subtitle, 40);
    vf += `,${subtitleDrawtext(w, h, textfilePath)}`;
  }

  const outPath = path.join(workDir, `scene-${sceneIndex}-shot-${shotIndex}.mp4`);
  const args = ["-y", ...inputArgs];
  args.push(
    "-filter_complex", `[0:v]${vf}[v]`,
    "-map", "[v]",
    "-t", String(shot.seconds),
    "-r", String(FPS),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    outPath
  );
  await run("ffmpeg", args);
  return outPath;
}

// Concatenates a scene's (silent) shot clips into one video-only reel, in
// order. A single-shot scene has nothing to concatenate — that one clip
// already is the reel.
async function concatShots(shotPaths, sceneIndex, workDir) {
  if (shotPaths.length === 1) return shotPaths[0];
  const listPath = path.join(workDir, `scene-${sceneIndex}-shots-list.txt`);
  const listContents = shotPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, listContents);
  const outPath = path.join(workDir, `scene-${sceneIndex}-shots-concat.mp4`);
  await run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    outPath,
  ]);
  return outPath;
}

/**
 * Builds one scene's final clip.
 *
 * Single-shot scenes (scene.clips empty/absent — every scene rendered by
 * this worker before multi-shot scenes existed) take the exact same path
 * as before, byte-for-byte: one ffmpeg call combining the visual (looped
 * image + Ken Burns, or a passthrough video) with the scene's voice audio
 * (or silence) in a single encode, `-t` stretched to at least the voice's
 * real duration so narration is never cut off. Nothing about this path
 * changed — it's the same code, just fed a resolved shot instead of
 * reading scene.videoUrl/imageUrl directly.
 *
 * Multi-shot scenes (scene.clips has 2+ entries) render each shot as its
 * own silent clip (buildShotClip), concatenate them in order (concatShots),
 * then attach the scene's voice audio to that concatenated reel the same
 * way — `apad=whole_dur=` stretched to at least the voice's duration. If
 * the voice runs longer than the reel's own real length, SCENE_FILL
 * (loop/slow/freeze — see videoFillFor) fills the gap on the video side
 * too, instead of the reel's video track just ending early.
 *
 * `burnSubtitles` (a per-project flag, see renderProject/BURN_SUBTITLES_DEFAULT)
 * gates every drawtext call in this function and in buildShotClip — when
 * false, scene.subtitle is never burned into the picture at all.
 */
async function buildSceneClip(scene, sceneIndex, posterImagePath, workDir, w, h, burnSubtitles) {
  const shots = resolveSceneShots(scene);

  let voicePath = null;
  let voiceDuration = 0;
  if (scene.voiceUrl) {
    voicePath = assetPath(workDir, `scene-${sceneIndex}-voice`);
    await downloadTo(scene.voiceUrl, voicePath);
    voiceDuration = await probeDuration(voicePath);
  }

  if (shots.length <= 1) {
    // Single-shot path — same overall shape as before multi-shot scenes
    // existed, but the video's visual duration is now driven by the
    // clip's own real (probed) length, not by voiceDuration: clipSeconds
    // is still at least as long as the voice so narration is never cut
    // off, but *reaching* that length when the clip itself is shorter is
    // now SCENE_FILL's job (loop/slow/explicit-freeze), not an implicit
    // freeze from the video stream simply running out early. shots can
    // only be empty here if hasSceneVisual let a visual-less scene slip
    // through upstream; falling back to the project poster image keeps
    // that defensive case from crashing instead of silently trusting it
    // can't happen.
    const shot = shots[0] || { videoUrl: undefined, imageUrl: undefined, seconds: Math.max(0.5, Number(scene.seconds) || 5) };

    let videoPath = null;
    let videoNaturalSeconds = 0;
    if (shot.videoUrl) {
      const candidatePath = assetPath(workDir, `scene-${sceneIndex}-clip`);
      try {
        await downloadTo(shot.videoUrl, candidatePath);
        videoPath = candidatePath;
        videoNaturalSeconds = await probeDuration(candidatePath).catch(() => 0);
      } catch (e) {
        console.error(`[render] scene video clip failed (${shot.videoUrl}): ${e.message} — using the still image instead.`);
      }
    }

    // The clip's own real length when there is one (falling back to the
    // requested shot.seconds if probing failed), else the requested
    // duration for an image scene — Ken Burns already generates exactly
    // that many frames procedurally, so images never need filling.
    const naturalVideoSeconds = videoPath ? (videoNaturalSeconds || shot.seconds) : shot.seconds;
    const clipSeconds = Math.max(0.5, naturalVideoSeconds, voiceDuration);

    let imagePath = null;
    if (!videoPath) {
      if (shot.imageUrl) {
        imagePath = assetPath(workDir, `scene-${sceneIndex}-image`);
        await ensureSceneImage(shot.imageUrl, imagePath, w, h);
      } else {
        imagePath = posterImagePath;
      }
    }

    const frames = Math.max(1, Math.round(clipSeconds * FPS));
    let vf = videoPath
      ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
      : buildKenBurnsAndCover(w, h, frames);

    let inputArgs = videoPath ? ["-i", videoPath] : ["-loop", "1", "-i", imagePath];
    if (videoPath && naturalVideoSeconds < clipSeconds) {
      const fill = videoFillFor(videoPath, naturalVideoSeconds, clipSeconds);
      inputArgs = fill.inputArgs;
      if (fill.vf) vf += `,${fill.vf}`;
    }

    if (burnSubtitles && scene.subtitle && scene.subtitle.trim()) {
      const textfilePath = await writeTextfile(workDir, `scene-${sceneIndex}-subtitle`, scene.subtitle, 40);
      vf += `,${subtitleDrawtext(w, h, textfilePath)}`;
    }

    const outPath = path.join(workDir, `scene-${sceneIndex}.mp4`);
    const args = ["-y", ...inputArgs];

    if (voicePath) {
      args.push("-i", voicePath);
      args.push(
        "-filter_complex", `[0:v]${vf}[v];[1:a]apad=whole_dur=${clipSeconds}[a]`,
        "-map", "[v]", "-map", "[a]"
      );
    } else {
      args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
      args.push(
        "-filter_complex", `[0:v]${vf}[v]`,
        "-map", "[v]", "-map", "1:a"
      );
    }

    args.push(
      "-t", String(clipSeconds),
      "-r", String(FPS),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
      "-c:a", "aac",
      outPath
    );

    await run("ffmpeg", args);
    return outPath;
  }

  // Multi-shot path. The reel's visual duration is driven by its own real
  // (probed) length, same principle as the single-shot path above —
  // clipSeconds is still at least the voice's length, but reaching it
  // when the reel is shorter goes through SCENE_FILL now instead of an
  // implicit freeze on the last shot.
  const shotPaths = [];
  for (let i = 0; i < shots.length; i++) {
    shotPaths.push(await buildShotClip(shots[i], sceneIndex, i, posterImagePath, scene.subtitle, workDir, w, h, burnSubtitles));
  }
  const reelPath = await concatShots(shotPaths, sceneIndex, workDir);
  const shotsSecondsSum = shots.reduce((sum, s) => sum + s.seconds, 0);
  const naturalReelSeconds = (await probeDuration(reelPath).catch(() => 0)) || shotsSecondsSum;
  const clipSeconds = Math.max(0.5, naturalReelSeconds, voiceDuration);

  let inputArgs = ["-i", reelPath];
  let reelVf = "";
  if (naturalReelSeconds < clipSeconds) {
    const fill = videoFillFor(reelPath, naturalReelSeconds, clipSeconds);
    inputArgs = fill.inputArgs;
    reelVf = fill.vf;
  }
  const videoFilterComplex = reelVf ? `[0:v]${reelVf}[v]` : null;
  const videoMap = reelVf ? "[v]" : "0:v";

  const outPath = path.join(workDir, `scene-${sceneIndex}.mp4`);
  const args = ["-y", ...inputArgs];
  if (voicePath) {
    args.push("-i", voicePath);
    const filterParts = [];
    if (videoFilterComplex) filterParts.push(videoFilterComplex);
    filterParts.push(`[1:a]apad=whole_dur=${clipSeconds}[a]`);
    args.push("-filter_complex", filterParts.join(";"), "-map", videoMap, "-map", "[a]");
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    if (videoFilterComplex) args.push("-filter_complex", videoFilterComplex);
    args.push("-map", videoMap, "-map", "1:a");
  }
  args.push(
    "-t", String(clipSeconds),
    "-r", String(FPS),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac",
    outPath
  );
  await run("ffmpeg", args);
  return outPath;
}

// Finds the first usable image anywhere in the project (scanning scenes in
// order, then each scene's own shots) — used as the title card's background
// and as a shot's last-resort fallback when it names neither a working
// video nor its own image. Falls back to a solid dark placeholder frame
// (same as ensureSceneImage's own download-failure fallback) if the whole
// project has no image anywhere at all — an all-video-project must still
// be able to render a title card.
async function findPosterImage(scenes, workDir, w, h) {
  for (let i = 0; i < scenes.length; i++) {
    const shots = resolveSceneShots(scenes[i]);
    for (const shot of shots) {
      if (shot.imageUrl) {
        const imgPath = assetPath(workDir, `poster-${i}`);
        await ensureSceneImage(shot.imageUrl, imgPath, w, h);
        return imgPath;
      }
    }
  }
  const blankPath = assetPath(workDir, "poster-blank");
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `color=c=0x0a0a0a:s=${w}x${h}`,
    "-frames:v", "1", "-vcodec", "png", "-f", "image2",
    blankPath,
  ]);
  return blankPath;
}

/** Title card: the first scene's image, dimmed, with the title centered. */
async function buildTitleClip(titleCard, firstImagePath, workDir, w, h) {
  const seconds = Math.max(1, Number(titleCard.seconds) || 4);
  const textfilePath = await writeTextfile(workDir, "title-card", titleCard.text, 30);
  const fontSize = Math.round(w * 0.06);
  const vf =
    `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
    `eq=brightness=-0.35,` +
    `drawtext=fontfile=${FONT_PATH}:textfile=${textfilePath}:fontsize=${fontSize}:fontcolor=white:line_spacing=10:x=(w-text_w)/2:y=(h-text_h)/2`;

  const outPath = path.join(workDir, "title-card.mp4");
  await run("ffmpeg", [
    "-y", "-loop", "1", "-i", firstImagePath,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex", `[0:v]${vf}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-t", String(seconds), "-r", String(FPS),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac",
    outPath,
  ]);
  return outPath;
}

/**
 * uploadResult — hands the finished MP4 off to Base44's uploadRenderResult
 * function (see Part B), which is the piece that actually knows how to
 * store it and register it in the app. This worker's only job is to POST
 * the raw file there and hand back whatever URL it gives us.
 */
async function uploadResult(filePath) {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "video/mp4" }), path.basename(filePath));

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
 * renderProject(project, onProgress) — the whole pipeline: download assets,
 * render each scene (+ optional title card) to its own clip, concatenate,
 * mix in optional background music, upload the result, and return its URL.
 * Always cleans up its own temp directory, whether it succeeds or throws.
 *
 * `project.burnSubtitles` (boolean, optional) controls whether each
 * scene's `subtitle` text gets burned into the picture via drawtext —
 * defaults to BURN_SUBTITLES_DEFAULT (off) when omitted. Movie Maker's
 * "Assemble Film" export sends `burnSubtitles: false` explicitly, since
 * it already offers subtitles as a separate downloadable .srt.
 *
 * Background music (project.musicUrl) is gated by MUSIC_ENABLED (env,
 * default on) and extended to cover the film's full length per MUSIC_MODE
 * (env, default "varied" — crossfaded repetitions instead of a hard
 * -stream_loop cut; see buildVariedMusicTrack). Always ducked under the
 * film's own audio (narration) at project.musicVolume (default 0.18).
 */
export async function renderProject(project, onProgress = () => {}) {
  const { w, h } = RESOLUTIONS[project.ratio] || RESOLUTIONS["16:9"];
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "render-"));

  try {
    onProgress(0);

    // Valid project = at least one scene, and *every* scene has a visual —
    // a scene missing one isn't silently dropped from the render, the whole
    // job is rejected so the caller finds out instead of getting a shorter
    // movie than it asked for.
    const scenes = Array.isArray(project.scenes) ? project.scenes : [];
    if (!scenes.length || scenes.some((s) => !hasSceneVisual(s))) {
      throw new Error("Each scene must have a visual (image, video, or at least one clip).");
    }
    if (scenes.length > MAX_SCENES) {
      throw new Error(`Project has ${scenes.length} scenes, which exceeds the ${MAX_SCENES}-scene limit.`);
    }
    const estimatedSeconds = estimateProjectDurationSeconds(project);
    if (estimatedSeconds > MAX_TOTAL_DURATION_SECONDS) {
      throw new Error(`Project's estimated duration (${Math.round(estimatedSeconds)}s) exceeds the ${MAX_TOTAL_DURATION_SECONDS}s limit.`);
    }
    // A caller that omits burnSubtitles entirely gets BURN_SUBTITLES_DEFAULT
    // (off unless explicitly configured); a caller that sends it explicitly
    // — true or false — always wins over that default.
    const burnSubtitles = typeof project.burnSubtitles === "boolean" ? project.burnSubtitles : BURN_SUBTITLES_DEFAULT;

    // ── Download stage (0 -> 0.2): project-level assets. The poster image
    // (title card background, and any shot's own last-resort fallback) is
    // the only image resolved up front — everything else a scene needs
    // (its own image/video/clips, voice) is downloaded inline while that
    // scene's clip is built, same as voice always was. Music is the other
    // project-level asset. ──
    const posterImagePath = await findPosterImage(scenes, workDir, w, h);

    let musicPath = null;
    if (MUSIC_ENABLED && project.musicUrl) {
      // Non-fatal, same as lane1.js: an unreachable music URL (an expired
      // provider link, a storage hiccup) must not destroy a film whose
      // scenes and narration all rendered fine. Every caller already treats
      // music as optional and best-effort — MovieMaker warns and carries on
      // when generation fails — so a download failure at render time should
      // cost the score, not the movie.
      try {
        const candidate = assetPath(workDir, "music");
        await downloadTo(project.musicUrl, candidate);
        musicPath = candidate;
      } catch (e) {
        console.error(`[render] music download failed (${project.musicUrl}): ${e.message} — rendering without background music.`);
      }
    }
    onProgress(0.2);

    // ── Per-scene clips (0.2 -> 0.7) ──
    const clipPaths = [];

    if (project.titleCard?.enabled) {
      clipPaths.push(await buildTitleClip(project.titleCard, posterImagePath, workDir, w, h));
    }

    // Progress within this stage (0.2 -> 0.7) is weighted by each scene's
    // own duration, not just its index — a 40-second scene moving the bar
    // as much as a 2-second scene would make "percent" a poor proxy for
    // "time remaining" on a long, unevenly-paced film.
    const sceneSeconds = scenes.map((s) => resolveSceneShots(s).reduce((sum, shot) => sum + shot.seconds, 0));
    const totalSceneSeconds = sceneSeconds.reduce((a, b) => a + b, 0) || 1;
    let completedSceneSeconds = 0;

    for (let i = 0; i < scenes.length; i++) {
      onProgress({
        fraction: 0.2 + (completedSceneSeconds / totalSceneSeconds) * 0.5,
        sceneIndex: i,
        sceneTotal: scenes.length,
      });
      clipPaths.push(await withSceneRetry(() => buildSceneClip(scenes[i], i, posterImagePath, workDir, w, h, burnSubtitles), i));
      completedSceneSeconds += sceneSeconds[i];
    }
    onProgress({ fraction: 0.7, sceneIndex: scenes.length, sceneTotal: scenes.length });

    // ── Concat + mux (0.7 -> 0.9) ──
    // Concat demuxer with an intermediate file list; re-encode (rather than
    // stream-copy) for a consistent, guaranteed-compatible final codec even
    // though every clip was already encoded the same way.
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

    let finalPath = concatPath;

    // ── Optional project-level narration ─────────────────────────────────
    // Quick Create sends ONE voiceover track for the whole film
    // (project.voiceoverUrl) rather than Movie Maker's per-scene voiceUrl
    // fields — and renderProject otherwise only mixes per-scene audio, so
    // Quick Create's "real AI video" path silently produced motion clips
    // with NO narration at all. Mix the track over the concatenated film
    // here. Non-fatal, same as music: an unreachable or corrupt narration
    // file must not sink a film whose scenes all rendered fine.
    if (project.voiceoverUrl) {
      try {
        const narrationPath = assetPath(workDir, "narration");
        await downloadTo(project.voiceoverUrl, narrationPath);
        const narrationSeconds = await probeDuration(narrationPath).catch(() => 0);
        if (narrationSeconds <= 0) {
          throw new Error("the downloaded narration file has no readable audio stream");
        }
        const voicedPath = path.join(workDir, "voiced.mp4");
        // apad holds the narration under the film's whole runtime; amix with
        // duration=first trims the mix to the video's own length.
        await run("ffmpeg", [
          "-y", "-i", concatPath, "-i", narrationPath,
          "-filter_complex", "[1:a]apad[nar];[0:a][nar]amix=inputs=2:duration=first:dropout_transition=0[aout]",
          "-map", "0:v", "-map", "[aout]",
          "-c:v", "copy", "-c:a", "aac",
          "-shortest",
          voicedPath,
        ]);
        finalPath = voicedPath;
      } catch (e) {
        console.error(`[render] narration mix failed (${project.voiceoverUrl}): ${e.message} — shipping without the project voiceover.`);
      }
    }

    if (musicPath) {
      // Non-fatal, same as the download above: by this point every scene
      // and the narration have already rendered — a corrupt/unreadable
      // music file (e.g. a provider error body saved as audio) or a failed
      // crossfade/mix must not sink the whole film after all that work.
      // Ship without the score rather than error the job; the user can
      // regenerate or upload a track and re-assemble.
      // The fallback on failure below must be this pre-music path, not the
      // raw concat — reverting to concat would also throw away the
      // narration mixed in just above.
      const preMusicPath = finalPath;
      try {
        const musicVolume = typeof project.musicVolume === "number" ? project.musicVolume : 0.18;
        // Probe the post-narration path (finalPath), not the raw concat — the
        // film the music has to cover includes the narration-mixed variant.
        const filmSeconds = (await probeDuration(finalPath).catch(() => 0)) || totalSceneSeconds;
        const musicNaturalSeconds = await probeDuration(musicPath).catch(() => 0);
        if (musicNaturalSeconds <= 0) {
          // ffprobe can read no duration at all — almost certainly a broken
          // or non-audio file that would only fail later inside amix.
          throw new Error("the downloaded music file has no readable audio stream");
        }

        let mixInputArgs;
        if (MUSIC_MODE === "single" || musicNaturalSeconds >= filmSeconds) {
          // Either explicitly configured for the old behavior, or the
          // source is already long enough to cover the film and there's
          // nothing to extend — -stream_loop is harmless (a no-op past the
          // first iteration) when the source already reaches filmSeconds.
          mixInputArgs = ["-stream_loop", "-1", "-i", musicPath];
        } else {
          // "varied" and the source is shorter than the film — build the
          // extended, crossfaded track once up front instead of looping the
          // raw file at mix time.
          const variedTrackPath = await buildVariedMusicTrack(musicPath, musicNaturalSeconds, filmSeconds, workDir);
          mixInputArgs = ["-i", variedTrackPath];
        }

        const mixedPath = path.join(workDir, "mixed.mp4");
        // Duck the (now already long-enough) music under the narration with
        // volume=, then amix with duration=first so the mixed track is
        // truncated to exactly the video's length regardless of how long
        // the music track technically is — -shortest on the output is
        // belt-and-suspenders for the same truncation.
        await run("ffmpeg", [
          "-y",
          "-i", finalPath,
          ...mixInputArgs,
          "-filter_complex", `[1:a]volume=${musicVolume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
          "-map", "0:v", "-map", "[aout]",
          "-c:v", "copy", "-c:a", "aac",
          "-shortest",
          mixedPath,
        ]);
        finalPath = mixedPath;
      } catch (e) {
        console.error(`[render] music mix failed: ${e.message} — shipping the film without background music.`);
        finalPath = preMusicPath;
      }
    }
    onProgress(0.9);

    // ── Upload (0.9 -> 1.0) ──
    const outPath = path.join(workDir, "out.mp4");
    if (finalPath !== outPath) await fs.copyFile(finalPath, outPath);
    const url = await uploadResult(outPath);
    onProgress(1.0);
    return url;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}