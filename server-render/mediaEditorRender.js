// mediaEditorRender.js — FFmpeg pipeline for the Media Editor's server-side
// export: a general multi-clip timeline with per-clip crop/zoom/pan/filter,
// overlay layers (text / logo / picture-in-picture / cover box / blur
// patch), an independently-timed voice track, a music track, and a
// bass/treble/fade/duck mixer. This is the server-side counterpart to
// src/components/media-editor/renderProject.js's browser Canvas +
// MediaRecorder pipeline — same math for crop/zoom/pan and the duck/fade
// automation, so a server export should look and sound like what the
// browser preview showed. The one place this can't be pixel-identical is
// the per-clip color filter: FFmpeg has no built-in equivalent of CSS's
// sepia()/hue-rotate(), so those are close visual approximations (see
// filterVf) rather than an exact match.
//
// Project shape (built client-side by serverExport.js — every url here is
// already a persistent https URL, never a blob: URL, since this worker has
// to download them):
// {
//   size: { w, h },
//   clips: [{ kind: 'video'|'image', url, trimStart, trimEnd, duration,
//              fit: 'cover'|'contain', zoom, panX, panY, filter }],
//   layers: [{ kind: 'text'|'logo'|'pip'|'box'|'blur', x, y, w, h, text,
//              color, bg, size, opacity, url, mediaKind: 'video'|'image' }],
//   clipVolume, music: { url, volume } | null,
//   voice: { url, start, volume, duration } | null,
//   mix: { bass, treble, fadeIn, fadeOut, duck },
// }

import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_TOTAL_DURATION_SECONDS } from "./render.js";

const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FPS = 30;

// Mirrors MAX_CLIPS in useEditorProject.js — checked again here so a
// malformed or bypassed client request can't queue an oversized job.
export const MAX_ME_CLIPS = 20;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "", stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
  if (!res.body) throw new Error("download failed (empty response body)");
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

function assetPath(workDir, name) {
  return path.join(workDir, `${name}.bin`);
}

async function probeDuration(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

async function probeDims(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=s=x:p=0",
    filePath,
  ]);
  const [w, h] = stdout.trim().split("x").map(Number);
  return { w: Number.isFinite(w) && w > 0 ? w : 0, h: Number.isFinite(h) && h > 0 ? h : 0 };
}

async function hasAudioStream(filePath) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=index", "-of", "csv=p=0",
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// drawtext has no built-in word-wrap — pre-wrap into lines ourselves, same
// approach as render.js's wrapText (kept as its own local copy here since
// render.js doesn't export it).
function wrapText(text, maxChars) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

// Mirrors editorModel.js's FILTERS. FFmpeg has no identical primitive for
// CSS's sepia()/hue-rotate() math, so warm/cool/bw are close visual
// approximations rather than a byte-for-byte match; vivid/fade (pure
// saturate/contrast/brightness) map onto eq= almost exactly.
function filterVf(filter) {
  switch (filter) {
    case "vivid": return "eq=saturation=1.6:contrast=1.1";
    case "warm": return "eq=brightness=0.04:saturation=1.3,colorbalance=rs=0.12:gs=0.02:bs=-0.12";
    case "cool": return "hue=h=-15:s=1.1,eq=brightness=0.02";
    case "fade": return "eq=contrast=0.85:brightness=0.08:saturation=0.8";
    case "bw": return "hue=s=0,eq=contrast=1.1";
    default: return null;
  }
}

// Reproduces drawFrame.js's cover/contain + zoom + pan placement exactly:
// scale to (dw,dh) at the same factor the canvas uses (s = (contain?min:max)
// (W/mw,H/mh)*zoom), pad up to the target on any dimension where the scaled
// image is smaller (centered — dw/dh < target only happens with 'contain'),
// then crop down to the target on any dimension where it's larger, offset
// by panX/panY — identical math to drawFrame.js's dx/dy.
function placementVf(mw, mh, W, H, fit, zoom, panX, panY) {
  const s = (fit === "contain" ? Math.min(W / mw, H / mh) : Math.max(W / mw, H / mh)) * Math.max(1, Number(zoom) || 1);
  const dw = Math.max(2, Math.round((mw * s) / 2) * 2);
  const dh = Math.max(2, Math.round((mh * s) / 2) * 2);
  const padX = dw < W ? Math.round((W - dw) / 2) : 0;
  const padY = dh < H ? Math.round((H - dh) / 2) : 0;
  const W2 = Math.max(dw, W), H2 = Math.max(dh, H);
  const cropX = dw >= W ? Math.round((dw - W) * clamp01(panX)) : 0;
  const cropY = dh >= H ? Math.round((dh - H) * clamp01(panY)) : 0;
  return `scale=${dw}:${dh},pad=${W2}:${H2}:${padX}:${padY}:black,crop=${W}:${H}:${cropX}:${cropY}`;
}

function clipDuration(clip) {
  return clip.kind === "image"
    ? Math.max(0.2, Number(clip.duration) || 3)
    : Math.max(0.2, Number(clip.trimEnd) - Number(clip.trimStart) || 0.2);
}

// Builds one clip into its own normalized segment: target WxH, target FPS,
// the clip's own crop/zoom/pan/filter baked in, and a guaranteed audio
// stream (the clip's own audio at clipVolume when it has one, silence
// otherwise) so every segment has identical streams for the concat step.
async function buildClipSegment(clip, index, workDir, W, H, clipVolume) {
  const isVideo = clip.kind === "video";
  const srcPath = assetPath(workDir, `clip-${index}-src`);
  await downloadTo(clip.url, srcPath);
  const { w: mw, h: mh } = await probeDims(srcPath);
  if (!mw || !mh) throw new Error(`Clip ${index + 1} could not be read (no readable video/image stream).`);

  const duration = clipDuration(clip);
  let vf = placementVf(mw, mh, W, H, clip.fit, clip.zoom, clip.panX, clip.panY);
  const fv = filterVf(clip.filter);
  if (fv) vf += `,${fv}`;
  vf += `,fps=${FPS},format=yuv420p`;

  const hasAudio = isVideo && (await hasAudioStream(srcPath));
  const inputArgs = isVideo
    ? ["-ss", String(Math.max(0, Number(clip.trimStart) || 0)), "-i", srcPath]
    : ["-loop", "1", "-i", srcPath];
  const extraInputArgs = hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
  const filterComplex = hasAudio
    ? `[0:v]${vf}[v];[0:a]volume=${clipVolume}[a]`
    : `[0:v]${vf}[v];[1:a]anull[a]`;

  const outPath = path.join(workDir, `clip-${index}.mp4`);
  await run("ffmpeg", [
    "-y", ...inputArgs, ...extraInputArgs,
    "-filter_complex", filterComplex,
    "-map", "[v]", "-map", "[a]",
    "-t", String(duration),
    "-r", String(FPS),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac",
    outPath,
  ]);
  return outPath;
}

// Overlay layers apply across the WHOLE video (the editor has no per-layer
// timing — see LayersPanel/drawFrame.js, which draw every layer on every
// frame), so this runs once over the full concatenated track rather than
// per clip.
async function applyLayers(basePath, layers, workDir, W, H) {
  const list = Array.isArray(layers) ? layers : [];
  if (!list.length) return basePath;

  const inputs = ["-i", basePath];
  const filterParts = [];
  let label = "0:v";
  let nextInput = 1;
  let n = 0;

  for (const l of list) {
    n += 1;
    if (l.kind === "text") {
      if (!l.text?.trim()) continue;
      const fontSize = Math.max(10, Math.round(((Number(l.size) || 5) / 100) * W));
      const maxChars = Math.max(4, Math.round((Number(l.w) * W) / (fontSize * 0.55)));
      const textfilePath = path.join(workDir, `layer-text-${n}.txt`);
      await fs.writeFile(textfilePath, wrapText(l.text, maxChars), "utf8");
      const boxOpt = l.bg ? `:box=1:boxcolor=black@0.65:boxborderw=${Math.round(fontSize * 0.35)}` : "";
      const color = l.color || "#ffffff";
      const outLabel = `t${n}`;
      filterParts.push(
        `[${label}]drawtext=fontfile=${FONT_PATH}:textfile=${textfilePath}:fontsize=${fontSize}:` +
        `fontcolor=${color}@${l.opacity ?? 1}:line_spacing=8${boxOpt}:` +
        `x=${Math.round(Number(l.x) * W)}-text_w/2:y=${Math.round(Number(l.y) * H)}-text_h/2[${outLabel}]`
      );
      label = outLabel;
    } else if (l.kind === "box") {
      const bx = Math.round((Number(l.x) - Number(l.w) / 2) * W), by = Math.round((Number(l.y) - Number(l.h) / 2) * H);
      const bw = Math.max(1, Math.round(Number(l.w) * W)), bh = Math.max(1, Math.round(Number(l.h) * H));
      const outLabel = `b${n}`;
      filterParts.push(`[${label}]drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=${l.color || "#000000"}@${l.opacity ?? 1}:t=fill[${outLabel}]`);
      label = outLabel;
    } else if (l.kind === "blur") {
      const bx = Math.round((Number(l.x) - Number(l.w) / 2) * W), by = Math.round((Number(l.y) - Number(l.h) / 2) * H);
      const bw = Math.max(2, Math.round(Number(l.w) * W)), bh = Math.max(2, Math.round(Number(l.h) * H));
      const mainLabel = `m${n}`, blurSrc = `bs${n}`, blurred = `bl${n}`, outLabel = `ov${n}`;
      filterParts.push(`[${label}]split[${mainLabel}][${blurSrc}]`);
      filterParts.push(`[${blurSrc}]crop=${bw}:${bh}:${bx}:${by},boxblur=12:2[${blurred}]`);
      filterParts.push(`[${mainLabel}][${blurred}]overlay=${bx}:${by}[${outLabel}]`);
      label = outLabel;
    } else if (l.kind === "logo" || l.kind === "pip") {
      if (!l.url) continue;
      const srcPath = assetPath(workDir, `layer-src-${n}`);
      try { await downloadTo(l.url, srcPath); } catch (e) {
        console.error(`[media-editor-render] layer ${n} (${l.kind}) download failed, skipping it: ${e.message}`);
        continue;
      }
      const { w: lw, h: lh } = await probeDims(srcPath).catch(() => ({ w: 0, h: 0 }));
      if (!lw || !lh) continue;
      const scaledW = Math.max(2, Math.round((Number(l.w) * W) / 2) * 2);
      const scaledH = Math.max(2, Math.round((scaledW * (lh / lw)) / 2) * 2);
      const ox = Math.round(Number(l.x) * W - scaledW / 2), oy = Math.round(Number(l.y) * H - scaledH / 2);
      const inIndex = nextInput++;
      inputs.push(...(l.mediaKind === "video" ? ["-stream_loop", "-1", "-i", srcPath] : ["-loop", "1", "-i", srcPath]));
      const prepLabel = `lp${n}`;
      filterParts.push(`[${inIndex}:v]scale=${scaledW}:${scaledH},format=rgba,colorchannelmixer=aa=${l.opacity ?? 1}[${prepLabel}]`);
      const outLabel = `ov${n}`;
      filterParts.push(`[${label}][${prepLabel}]overlay=${ox}:${oy}[${outLabel}]`);
      label = outLabel;
      if (l.kind === "pip") {
        const borderLabel = `pb${n}`;
        filterParts.push(`[${label}]drawbox=x=${ox}:y=${oy}:w=${scaledW}:h=${scaledH}:color=white@1:t=${Math.max(2, Math.round(W * 0.004))}[${borderLabel}]`);
        label = borderLabel;
      }
    }
  }

  if (!filterParts.length) return basePath;
  const outPath = path.join(workDir, "overlaid.mp4");
  await run("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filterParts.join(";"),
    "-map", `[${label}]`, "-map", "0:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-c:a", "copy",
    "-shortest",
    outPath,
  ]);
  return outPath;
}

// Builds the final mixed audio: the clip track already embedded in
// overlaidPath, plus an optional music track and an optional voice track
// dropped in at its own start offset, then bass/treble/fade applied to the
// whole mix. When mix.duck is on and a voice track exists, the music
// track's volume is automated with the exact same ramp
// renderProject.js's exportVideo() applies on the client (down to 30% over
// 0.3s at the voice's start, back up to 100% over 0.5s after it ends) —
// computed from the voice file's own probed duration, not whatever the
// client happened to report, so it's right even if that drifted.
async function buildAudioMix(overlaidPath, project, totalSeconds, workDir) {
  const mix = project.mix || {};
  const inputs = ["-i", overlaidPath];
  const filterParts = [];
  let nextInput = 1;

  let voiceLabel = null, voiceStart = 0, voiceDuration = 0;
  if (project.voice?.url) {
    try {
      const voicePath = assetPath(workDir, "voice");
      await downloadTo(project.voice.url, voicePath);
      voiceDuration = (await probeDuration(voicePath).catch(() => 0)) || Number(project.voice.duration) || 0;
      voiceStart = Math.max(0, Number(project.voice.start) || 0);
      const vol = typeof project.voice.volume === "number" ? project.voice.volume : 1;
      const idx = nextInput++;
      inputs.push("-i", voicePath);
      const delayMs = Math.round(voiceStart * 1000);
      filterParts.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=${vol},apad=whole_dur=${totalSeconds},atrim=0:${totalSeconds}[voice]`);
      voiceLabel = "voice";
    } catch (e) {
      console.error(`[media-editor-render] voice-over failed, continuing without it: ${e.message}`);
    }
  }

  let musicLabel = null;
  if (project.music?.url) {
    try {
      const musicPath = assetPath(workDir, "music");
      await downloadTo(project.music.url, musicPath);
      const natural = await probeDuration(musicPath).catch(() => 0);
      const idx = nextInput++;
      inputs.push(...(natural > 0 && natural < totalSeconds ? ["-stream_loop", "-1", "-i", musicPath] : ["-i", musicPath]));
      const vol = typeof project.music.volume === "number" ? project.music.volume : 0.6;
      let expr = `volume=${vol}`;
      if (mix.duck && voiceLabel) {
        const vs = voiceStart, ve = vs + Math.max(0.1, voiceDuration || totalSeconds - vs);
        const low = Number((vol * 0.3).toFixed(4));
        expr =
          `volume='if(lt(t,${(vs - 0.3).toFixed(3)}),${vol},` +
          `if(lt(t,${vs.toFixed(3)}),${vol}-${(vol - low).toFixed(4)}*(t-${(vs - 0.3).toFixed(3)})/0.3,` +
          `if(lt(t,${ve.toFixed(3)}),${low},` +
          `if(lt(t,${(ve + 0.5).toFixed(3)}),${low}+${(vol - low).toFixed(4)}*(t-${ve.toFixed(3)})/0.5,${vol}))))':eval=frame`;
      }
      filterParts.push(`[${idx}:a]atrim=0:${totalSeconds},apad=whole_dur=${totalSeconds},${expr}[music]`);
      musicLabel = "music";
    } catch (e) {
      console.error(`[media-editor-render] music failed, continuing without it: ${e.message}`);
    }
  }

  const mixInputs = ["[0:a]", musicLabel ? `[${musicLabel}]` : null, voiceLabel ? `[${voiceLabel}]` : null].filter(Boolean);
  let finalLabel = "0:a";
  if (mixInputs.length > 1) {
    filterParts.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[mixed]`);
    finalLabel = "mixed";
  }

  const postParts = [];
  if (mix.bass) postParts.push(`bass=g=${mix.bass}`);
  if (mix.treble) postParts.push(`treble=g=${mix.treble}`);
  if (mix.fadeIn > 0) postParts.push(`afade=t=in:st=0:d=${mix.fadeIn}`);
  if (mix.fadeOut > 0) postParts.push(`afade=t=out:st=${Math.max(0, totalSeconds - mix.fadeOut)}:d=${mix.fadeOut}`);
  let outLabel = finalLabel;
  if (postParts.length) {
    filterParts.push(`[${finalLabel}]${postParts.join(",")}[aout]`);
    outLabel = "aout";
  }

  if (!filterParts.length) return overlaidPath;

  const outPath = path.join(workDir, "mixed.mp4");
  await run("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filterParts.join(";"),
    "-map", "0:v", "-map", `[${outLabel}]`,
    "-c:v", "copy", "-c:a", "aac",
    "-t", String(totalSeconds),
    outPath,
  ]);
  return outPath;
}

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as every other
// server-render module's uploadToBase44/uploadResult (render.js, music.js,
// dub.js, lane1.js) — each keeps its own copy rather than sharing one,
// which this follows for consistency.
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

// A project is valid once every clip has a url — checked here too (not just
// client-side) so index.js's /media-editor-render route can 400 a bad
// payload immediately instead of occupying the queue.
export function hasMediaEditorVisual(project) {
  return Array.isArray(project?.clips) && project.clips.length > 0 &&
    project.clips.every((c) => c && typeof c.url === "string" && c.url.trim());
}

export function estimateMediaEditorDurationSeconds(project) {
  const clips = Array.isArray(project?.clips) ? project.clips : [];
  return clips.reduce((sum, c) => sum + clipDuration(c), 0);
}

export async function renderMediaEditorProject(project, onProgress = () => {}) {
  const clips = Array.isArray(project?.clips) ? project.clips : [];
  if (!hasMediaEditorVisual(project)) throw new Error("Each clip must have a url.");
  if (clips.length > MAX_ME_CLIPS) throw new Error(`Project has ${clips.length} clips, which exceeds the ${MAX_ME_CLIPS}-clip limit.`);

  const W = Math.max(2, Math.round((Number(project?.size?.w) || 1280) / 2) * 2);
  const H = Math.max(2, Math.round((Number(project?.size?.h) || 720) / 2) * 2);
  const totalSeconds = estimateMediaEditorDurationSeconds(project);
  if (totalSeconds > MAX_TOTAL_DURATION_SECONDS) {
    throw new Error(`Project's duration (${Math.round(totalSeconds)}s) exceeds the ${MAX_TOTAL_DURATION_SECONDS}s limit.`);
  }
  const clipVolume = typeof project.clipVolume === "number" ? project.clipVolume : 1;

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "media-editor-"));
  try {
    onProgress(0);

    const clipPaths = [];
    for (let i = 0; i < clips.length; i++) {
      clipPaths.push(await buildClipSegment(clips[i], i, workDir, W, H, clipVolume));
      onProgress(0.05 + ((i + 1) / clips.length) * 0.45);
    }

    const listPath = path.join(workDir, "concat-list.txt");
    await fs.writeFile(listPath, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    const concatPath = path.join(workDir, "concat.mp4");
    await run("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
      "-c:a", "aac",
      concatPath,
    ]);
    onProgress(0.55);

    const overlaidPath = await applyLayers(concatPath, project.layers, workDir, W, H);
    onProgress(0.7);

    const mixedPath = await buildAudioMix(overlaidPath, project, totalSeconds, workDir);
    onProgress(0.9);

    const outPath = path.join(workDir, "out.mp4");
    if (mixedPath === outPath) {
      // never happens (mixedPath is always under workDir with a different
      // name), kept defensively in case that changes
    } else {
      await run("ffmpeg", ["-y", "-i", mixedPath, "-c", "copy", "-movflags", "+faststart", outPath]);
    }

    const url = await uploadResult(outPath);
    onProgress(1);
    return url;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
