import { base44 } from "@/api/base44Client";

// Short-lived cache for the account-wide "preferred platform model" setting
// (Settings > AI Provider), so generateText() doesn't fetch the user record
// on every single call. Refreshed at most once per PLATFORM_MODEL_CACHE_MS.
let platformModelCache = { value: "", fetchedAt: 0 };
const PLATFORM_MODEL_CACHE_MS = 30_000;

async function getDefaultPlatformModel() {
  if (Date.now() - platformModelCache.fetchedAt < PLATFORM_MODEL_CACHE_MS) {
    return platformModelCache.value;
  }
  try {
    const user = await base44.auth.me();
    const value = user?.settings?.api_keys?.platform_model || "";
    platformModelCache = { value, fetchedAt: Date.now() };
    return value;
  } catch (_e) {
    return platformModelCache.value;
  }
}

/**
 * Generate marketing/script text via the platform's AI content engine.
 * Mirrors the call pattern already used in AdCreator, SocialHub, WebsiteScanner.
 *
 * `model` optionally overrides the account-wide default (Settings > AI
 * Provider > Preferred platform model) for this one call — e.g. a
 * per-generation picker. If omitted, the account-wide default is used
 * automatically. Only applies on the platform-default generation path; a
 * configured "bring your own LLM" key takes priority over both.
 *
 * `onModelFallback`, if provided, is called (no args) when the requested
 * model wasn't available and the backend silently fell back to the
 * platform's own default model, so the caller can surface a notice instead
 * of leaving the user unaware their chosen model wasn't actually used.
 */
export async function generateText({ type = "caption", prompt, platform = "General", tone = "Professional", model, onModelFallback }) {
  const chosenModel = model || (await getDefaultPlatformModel());
  const res = await base44.functions.invoke("generateMediaContent", {
    type, prompt, platform, tone,
    model: chosenModel || undefined,
  });
  const data = res?.data ?? res;
  if (chosenModel && data?.model_fallback) onModelFallback?.();
  const raw = data?.text ?? data?.content ?? "";
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/**
 * Generate an AI image via the generateImage backend function, which also
 * enforces the free-trial generation limit and logs the result to the
 * Media Library. Falls back to the Core integration (no trial gating, no
 * library record) if the backend function itself is unreachable.
 *
 * Throws an Error with `.upgradeRequired = true` when the caller's free
 * trial is exhausted and they have no purchased credits — UI callers should
 * catch this and show a "Subscribe to continue" CTA linking to /pricing.
 *
 * `referenceImageUrls` (optional) lets the caller attach one or more uploaded
 * images so the model replicates the people/style/likeness from them.
 */
export async function generateImage({ prompt, platform = "General", dimensions = "1024x1024", referenceImageUrls = [] }) {
  try {
    const res = await base44.functions.invoke("generateImage", { prompt, platform, dimensions, reference_image_urls: referenceImageUrls });
    const data = res?.data ?? res;
    const url = data?.url ?? data?.file_url;
    if (url) return url;
  } catch (e) {
    const data = e?.response?.data;
    if (data?.error === "trial_limit_reached") {
      const err = new Error(data?.message || "Free trial limit reached. Subscribe to continue generating.");
      err.upgradeRequired = true;
      throw err;
    }
    // fall through to Core integration fallback
  }
  try {
    const res = await base44.integrations.Core.GenerateImage({ prompt, existing_image_urls: referenceImageUrls?.length ? referenceImageUrls : undefined });
    return res?.url ?? res?.data?.url ?? res?.file_url ?? null;
  } catch (_e) {
    return null;
  }
}

/** Upload a File/Blob and get back a persistent, shareable URL. */
export async function uploadFile(file) {
  const res = await base44.integrations.Core.UploadFile({ file });
  return res?.file_url ?? res?.url ?? (typeof res === "string" ? res : "");
}

/**
 * Fetch an image URL server-side (via the proxyImage function) and return a
 * same-origin blob: URL for it. Used as a fallback when a cross-origin image
 * fails to load in the browser with crossOrigin="anonymous" — usually
 * because the hosting server doesn't send Access-Control-Allow-Origin, which
 * the canvas/MediaRecorder pipeline in videoAssembler.js requires. Returns
 * null if the proxy is unavailable or the fetch fails.
 */
export async function proxyImageAsObjectUrl(url) {
  if (!url) return null;
  try {
    const res = await base44.functions.invoke("proxyImage", { url });
    const data = res?.data ?? res;
    const b64 = data?.data_base64;
    if (!b64) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: data?.mime || "image/png" }));
  } catch (_e) {
    return null;
  }
}

/**
 * Generate a short AI voiceover for a block of text.
 * - Returns `null` only when there's genuinely nothing to speak (blank input).
 * - Returns an audio Blob on success.
 * - Throws an Error when generation itself fails (network error, or the
 *   backend responding without audio) — callers should catch this and show
 *   it, rather than treating a real failure the same as empty input.
 */
export async function generateVoiceover(text) {
  if (!text?.trim()) return null;
  try {
    // 20000 matches the backend's own MAX_CHARS (ElevenLabs TTS) — the old
    // 2000-char cap here was a leftover from the previous Google Translate
    // TTS backend, which silently cut off long narrations.
    const res = await base44.functions.invoke("generateVoiceover", { text: text.slice(0, 20000) });
    const data = res?.data ?? res;
    const b64 = data?.audio_base64;
    if (!b64) {
      throw new Error("Voiceover generation failed — check that ELEVENLABS_API_KEY is set in Base44 and the ElevenLabs account is active.");
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: data?.mime || "audio/mpeg" });
  } catch (e) {
    throw new Error("Voiceover generation failed — check that ELEVENLABS_API_KEY is set in Base44 and the ElevenLabs account is active. (" + (e?.message || "unknown error") + ")");
  }
}

// Combines genre/mood/prompt into one descriptive text prompt for the
// music-generation worker, which takes a single free-text description
// rather than structured fields — mirrors generateMusic/entry.ts's
// buildPromptText.
//
// `instrumental` and `lyrics` are forwarded as their own fields too (see
// generateMusic below), because the provider decides what to do with them:
// ElevenLabs takes a `force_instrumental` flag and can sing supplied
// lyrics, Suno sings them, and MusicGen can do neither. The "instrumental,
// no vocals" text appended here is what steers MusicGen, which has no such
// flag. This text does not by itself decide which provider runs — see
// generateMusic() below for that.
function buildMusicPromptText({ prompt, genre, mood, instrumental }) {
  const g = genre?.trim();
  const m = mood?.trim() || "cinematic";
  const p = prompt?.trim() || "";
  const segments = [g ? `${g} film score` : null, m, p || null].filter(Boolean);
  const base = segments.join(", ") || "cinematic instrumental background music";
  return instrumental === false ? base : `${base}, instrumental, no vocals`;
}

/**
 * Submit an AI music-generation job (see server-render/music.js for the
 * spec) to the render worker. Returns the job id; poll it with
 * getMusicStatus(). Throws a friendly message if the worker is
 * unreachable, or a generic one for any other failure to start the job.
 */
export async function submitMusic(spec) {
  const res = await base44.functions.invoke("submitMusic", spec);
  const data = res?.data ?? res;
  if (!data?.jobId) {
    throw new Error(data?.error === "render_worker_unreachable"
      ? "The render service is offline. Please try again shortly."
      : "Could not start music generation.");
  }
  return data.jobId;
}

/**
 * Fetch the current status of a music job started via submitMusic().
 * Returns { status, progress, url, vocals, error } as reported by the
 * render worker — status is one of "queued" | "processing" | "done" |
 * "error".
 */
export async function getMusicStatus(jobId) {
  const res = await base44.functions.invoke("getMusicStatus", { jobId });
  return res?.data ?? res;
}

/**
 * Generate AI background music or a real vocal song via the async
 * render-worker job (server-render/music.js) — submits the job, then polls
 * until it completes. This replaced a synchronous Base44 function
 * (generateMusic) that ran the whole create-poll-download cycle inside one
 * function-gateway call, which only worked for very short clips before
 * timing out.
 *
 * `instrumental: false` (with `lyrics`) asks for a real sung song.
 * ElevenLabs — the default provider — synthesizes vocals, so this normally
 * produces one; server-render/music.js picks the provider, submitMusic
 * meters whichever will run, and the result here always reports what
 * actually happened via `vocals`, so a caller never has to guess. `vocals`
 * comes back false when the request could only be served by MusicGen,
 * which has no vocal synthesis at all.
 *
 * - Returns `null` only when there's genuinely nothing to generate from
 *   (no prompt, genre, mood, or lyrics provided).
 * - Returns `{ url, vocals }` on success — an OBJECT, not a bare string
 *   and not a Blob. `url` is already persistent (the worker uploads the
 *   result to Base44 storage before reporting the job done), so there's
 *   nothing left for the caller to upload.
 * - Throws an Error on any failure to start, poll, or complete the job,
 *   including a timeout. Music failing is not inherently fatal to
 *   whatever it's being generated for — see MovieMaker.jsx's
 *   generateBackgroundMusic, which treats a thrown error here as
 *   non-fatal to the film and just warns.
 *
 * `durationSeconds` is capped at MAX_MUSIC_SECONDS here and the worker
 * clamps again per provider. A score shorter than the film it sits under
 * is fine: the render worker extends it with crossfaded repetitions rather
 * than cutting the film short (see buildVariedMusicTrack in render.js).
 */
export const MAX_MUSIC_SECONDS = 300;

export async function generateMusic({ prompt, durationSeconds = 30, instrumental = true, lyrics, genre, mood } = {}) {
  if (!prompt?.trim() && !genre?.trim() && !mood?.trim() && !lyrics?.trim()) return null;

  const composedPrompt = buildMusicPromptText({ prompt, genre, mood, instrumental });
  const seconds = Math.min(MAX_MUSIC_SECONDS, Math.max(3, Math.round(Number(durationSeconds) || 30)));
  const jobId = await submitMusic({
    prompt: composedPrompt,
    durationSeconds: seconds,
    instrumental,
    lyrics: instrumental === false ? lyrics : undefined,
    genre,
    mood,
    title: prompt,
  });

  const POLL_MS = 2500;
  // Generous on both paths, and deliberately longer than the worst-case
  // generation: the worker runs one job at a time across every kind
  // (render, music, video, dub), so this budget covers queue time behind
  // another job as well as the generation itself. A full sung song takes
  // materially longer than an instrumental bed, so it gets the larger cap.
  const TIMEOUT_MS = instrumental === false ? 420_000 : 300_000;

  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error("Music generation timed out. Please try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const job = await getMusicStatus(jobId);
    if (job?.status === "done") return { url: job.url, vocals: job.vocals === true };
    if (job?.status === "error") throw new Error(job.error || "Music generation failed.");
    // else "queued" / "processing" — keep polling
  }
}

/**
 * Submit an AI per-scene video-generation job (see server-render/video.js
 * for the spec) to the render worker. Returns the job id; poll it with
 * getVideoStatus(). Throws a friendly message if the worker is
 * unreachable, or a generic one for any other failure to start the job.
 */
export async function submitVideo(spec) {
  const res = await base44.functions.invoke("submitVideo", spec);
  const data = res?.data ?? res;
  if (!data?.jobId) {
    throw new Error(data?.error === "render_worker_unreachable"
      ? "The render service is offline. Please try again shortly."
      : "Could not start video generation.");
  }
  return data.jobId;
}

/**
 * Fetch the current status of a video job started via submitVideo().
 * Returns { status, progress, url, error } as reported by the render
 * worker — status is one of "queued" | "processing" | "done" | "error".
 */
export async function getVideoStatus(jobId) {
  const res = await base44.functions.invoke("getVideoStatus", { jobId });
  return res?.data ?? res;
}

/**
 * Generate an AI video clip for a single scene via the async render-worker
 * job (server-render/video.js) — submits the job, then polls until it
 * completes. Mirrors generateMusic()'s submit+poll pattern, but with a
 * longer timeout since video generation (Kling/MiniMax on Replicate) is
 * much slower than music generation.
 * - Returns a persistent URL string on success — the worker already
 *   uploads the result to Base44 storage before reporting the job done.
 * - Throws an Error on any failure to start, poll, or complete the job,
 *   including a timeout. Callers (MovieMaker.jsx) should treat this as
 *   non-fatal to the film — a scene without a generated clip just keeps
 *   its still image.
 */
export async function generateSceneVideo({ prompt, imageUrl, durationSeconds = 5, aspectRatio = "16:9" } = {}) {
  const jobId = await submitVideo({ prompt, imageUrl, durationSeconds, aspectRatio });

  const POLL_MS = 4000;
  // 10 minutes. Kling itself can take several minutes per clip, and the worker
  // runs ONE job at a time across every kind (render, music, video, dub — see
  // server-render/index.js), so a clip submitted behind an in-flight render or
  // music job spends real minutes just sitting queued. A 5-minute wall-clock
  // budget failed those jobs client-side while the worker was still working on
  // them, and the scene silently fell back to its still image — the exact
  // "video generation isn't generating / just a cinematic still" symptom.
  const TIMEOUT_MS = 600_000;

  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error("Video generation timed out. Please try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const job = await getVideoStatus(jobId);
    if (job?.status === "done") return job.url;
    if (job?.status === "error") throw new Error(job.error || "Video generation failed.");
    // else "queued" / "processing" — keep polling
  }
}

/**
 * Submit a page-walkthrough capture job (see server-capture/capture.js for
 * the spec: { url, plan? }) to the standalone capture worker — a separate
 * deployment from the render worker above, with its own job id namespace.
 * Returns the capture id; poll it with getCaptureStatus(). Throws a
 * friendly message if the worker is unreachable, or a generic one for any
 * other failure to start the job.
 */
export async function submitCapture(spec) {
  const res = await base44.functions.invoke("submitCapture", spec);
  const data = res?.data ?? res;
  if (!data?.captureId) {
    throw new Error(data?.error === "capture_worker_unreachable"
      ? "The capture service is offline. Please try again shortly."
      : "Could not start the capture.");
  }
  return data.captureId;
}

/**
 * Fetch the current status of a capture job started via submitCapture().
 * Returns { status, stepIndex, stepTotal, percent, videoUrl,
 * durationSeconds, pageInfo, error } as reported by the capture worker —
 * status is one of "queued" | "processing" | "done" | "error" |
 * "login_required" (the target page needed a login; Phase 1 doesn't
 * support that, no video was produced).
 */
export async function getCaptureStatus(captureId) {
  const res = await base44.functions.invoke("getCaptureStatus", { captureId });
  return res?.data ?? res;
}

/**
 * Submit an AI audio-dubbing job (ElevenLabs Dubbing API — see
 * server-render/dub.js's dubAudio for the spec) to the render worker.
 * Returns the job id; poll it with getDubStatus(). Throws a friendly
 * message if the worker is unreachable, or a generic one for any other
 * failure to start the job.
 */
export async function submitDubAudio(spec) {
  const res = await base44.functions.invoke("submitDubAudio", spec);
  const data = res?.data ?? res;
  if (!data?.jobId) {
    throw new Error(data?.error === "render_worker_unreachable"
      ? "The render service is offline. Please try again shortly."
      : "Could not start dubbing.");
  }
  return data.jobId;
}

/**
 * Submit an AI video-dubbing job (ElevenLabs Dubbing API, optionally
 * followed by Replicate lip-sync and ffmpeg caption burn-in — see
 * server-render/dub.js's dubVideo for the spec) to the render worker.
 * Returns the job id; poll it with getDubStatus(). Throws a friendly
 * message if the worker is unreachable, or a generic one for any other
 * failure to start the job.
 */
export async function submitDubVideo(spec) {
  const res = await base44.functions.invoke("submitDubVideo", spec);
  const data = res?.data ?? res;
  if (!data?.jobId) {
    throw new Error(data?.error === "render_worker_unreachable"
      ? "The render service is offline. Please try again shortly."
      : "Could not start dubbing.");
  }
  return data.jobId;
}

/**
 * Fetch the current status of a dubbing job started via submitDubAudio() or
 * submitDubVideo(). Returns { status, progress, url, captionsUrl, error }
 * as reported by the render worker — status is one of "queued" |
 * "processing" | "done" | "error". captionsUrl is only ever set for a
 * video-dub job that requested burnCaptions.
 */
export async function getDubStatus(jobId) {
  const res = await base44.functions.invoke("getDubStatus", { jobId });
  return res?.data ?? res;
}

const DUB_POLL_MS = 5000;

// Client-side give-up window for a dubbing job. This was a flat 15 minutes,
// which silently capped the product's headline feature: dubbing a
// feature-length film runs for hours, so the browser stopped polling and
// reported failure while the worker (and the ElevenLabs job it is paying for)
// carried on to a successful result nobody ever collected.
//
// The budget now scales with the source duration, mirroring
// server-render/dub.js's pollTimeoutFor so the two ends agree — the client
// should never be the one to give up first, so it allows a little more than
// the worker does.
const DUB_TIMEOUT_MS = 900_000;                  // fallback: short clips / unknown duration
const DUB_LONG_FORM_TIMEOUT_MS = 7 * 60 * 60 * 1000; // hard ceiling, 7h
const DUB_REALTIME_MULTIPLIER = 4;
const DUB_HEADROOM_MS = 45 * 60 * 1000;

function dubTimeoutFor(sourceSeconds) {
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) return DUB_LONG_FORM_TIMEOUT_MS;
  const estimated = sourceSeconds * 1000 * DUB_REALTIME_MULTIPLIER + DUB_HEADROOM_MS;
  return Math.min(Math.max(estimated, DUB_TIMEOUT_MS), DUB_LONG_FORM_TIMEOUT_MS);
}

/**
 * Reads a media file's duration in seconds from its URL, without downloading
 * the whole file (metadata preload only). Returns undefined rather than
 * throwing — an unknown duration just falls back to the long-form budget.
 */
export function probeMediaDuration(url, kind = "video") {
  return new Promise((resolve) => {
    if (!url || typeof document === "undefined") return resolve(undefined);
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    el.preload = "metadata";
    el.crossOrigin = "anonymous";
    const done = (v) => { el.removeAttribute("src"); el.load?.(); resolve(v); };
    const timer = setTimeout(() => done(undefined), 15000);
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined);
    };
    el.onerror = () => { clearTimeout(timer); done(undefined); };
    el.src = url;
  });
}

/**
 * Dub an audio file into another language via the async render-worker job
 * (server-render/dub.js's dubAudio, ElevenLabs Dubbing API) — submits the
 * job, then polls until it completes. Mirrors generateSceneVideo()'s
 * submit+poll pattern, but with an even longer timeout.
 * - Returns a persistent URL string on success — the worker already
 *   uploads the result to Base44 storage before reporting the job done.
 * - Throws an Error on any failure to start, poll, or complete the job,
 *   including a timeout. Callers should treat this as non-fatal — audio
 *   that fails to dub just keeps its original language.
 */
export async function dubAudioFile({ sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning, sourceSeconds, onProgress } = {}) {
  // Same duration-aware budget as dubVideoFile — an audiobook or a feature's
  // full audio track is just as long as the film it came from.
  const durationSeconds = Number.isFinite(sourceSeconds) && sourceSeconds > 0
    ? sourceSeconds
    : await probeMediaDuration(sourceUrl, "audio");

  const jobId = await submitDubAudio({
    sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning,
    sourceSeconds: durationSeconds,
  });

  const budgetMs = dubTimeoutFor(durationSeconds);
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > budgetMs) {
      throw new Error(
        `Dubbing is still running after ${Math.round(budgetMs / 60000)} minutes and this page stopped waiting. ` +
        "The job may still complete on the server — check before re-running, since a re-run bills the source again.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, DUB_POLL_MS));
    const job = await getDubStatus(jobId);
    if (job?.status === "done") return job.url;
    if (job?.status === "error") throw new Error(job.error || "Dubbing failed.");
    if (typeof onProgress === "function") {
      onProgress({
        jobId,
        status: job?.status || "processing",
        progress: typeof job?.progress === "number" ? job.progress : null,
        elapsedMs: Date.now() - startedAt,
        budgetMs,
      });
    }
  }
}

/**
 * Dub a video into another language, with optional lip-sync and burned-in
 * captions, via the async render-worker job (server-render/dub.js's
 * dubVideo). Submits the job, then polls until it completes. Mirrors
 * dubAudioFile()'s submit+poll pattern.
 * - Returns { url, captionsUrl } on success — captionsUrl is a persistent
 *   .srt URL when burnCaptions was requested, otherwise null. The worker
 *   already uploads both to Base44 storage before reporting the job done.
 * - Throws an Error on any failure to start, poll, or complete the job,
 *   including a timeout. Callers should treat this as non-fatal — a video
 *   that fails to dub just keeps its original audio/captions.
 */
export async function dubVideoFile({ sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning, watermark, highestResolution, startTime, endTime, lipSync, burnCaptions, captionOverrides, sourceSeconds, onProgress } = {}) {
  // Duration drives the timeout on BOTH ends: it is forwarded to the worker
  // (submitDubVideo passes the spec through verbatim) so its poll budget
  // matches, and used locally below. Probed from the media itself when the
  // caller didn't supply it.
  const durationSeconds = Number.isFinite(sourceSeconds) && sourceSeconds > 0
    ? sourceSeconds
    : await probeMediaDuration(sourceUrl, "video");

  const jobId = await submitDubVideo({
    sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning,
    watermark, highestResolution, startTime, endTime, lipSync, burnCaptions, captionOverrides,
    sourceSeconds: durationSeconds,
  });

  const budgetMs = dubTimeoutFor(durationSeconds);
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > budgetMs) {
      throw new Error(
        `Dubbing is still running after ${Math.round(budgetMs / 60000)} minutes and this page stopped waiting. ` +
        "The job may still complete on the server — check your media library before re-running, since a re-run bills the source again.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, DUB_POLL_MS));
    const job = await getDubStatus(jobId);
    if (job?.status === "done") return { url: job.url, captionsUrl: job.captionsUrl || null, jobId };
    if (job?.status === "error") throw new Error(job.error || "Dubbing failed.");
    // else "queued" / "processing" — keep polling. Surfacing progress matters
    // far more on a two-hour job than on a clip: without it the UI looks hung.
    if (typeof onProgress === "function") {
      onProgress({
        jobId,
        status: job?.status || "processing",
        progress: typeof job?.progress === "number" ? job.progress : null,
        elapsedMs: Date.now() - startedAt,
        budgetMs,
      });
    }
  }
}

/**
 * Submit a movie project (see server-render/render.js for the schema) to
 * the standalone render worker for server-side FFmpeg rendering. Returns
 * the worker's job id; poll it with getRenderStatus(). Throws a friendly
 * message if the worker itself is unreachable, or a generic one for any
 * other failure to start the job.
 */
export async function submitRender(project) {
  const res = await base44.functions.invoke("submitRender", project);
  const data = res?.data ?? res;
  if (!data?.jobId) {
    throw new Error(data?.error === "render_worker_unreachable"
      ? "The render service is offline. Please try again shortly."
      : "Could not start the render.");
  }
  return data.jobId;
}

/**
 * Fetch the current status of a render job started via submitRender().
 * Returns { status, progress, url, error } as reported by the render
 * worker — status is one of "queued" | "processing" | "done" | "error".
 */
export async function getRenderStatus(jobId) {
  const res = await base44.functions.invoke("getRenderStatus", { jobId });
  return res?.data ?? res;
}

/**
 * Submit a Lane 1 short-video assembly job (Quick Create, Campaign Studio,
 * Demo Video Maker — see server-render/lane1.js for the schema) to the
 * render worker. Returns the job id; poll it with getLane1VideoStatus().
 * Throws a friendly message if the worker is unreachable, or a generic one
 * for any other failure to start the job.
 */
export async function submitLane1Video(project) {
  const res = await base44.functions.invoke("submitLane1Video", project);
  const data = res?.data ?? res;
  if (!data?.jobId) {
    throw new Error(data?.error === "render_worker_unreachable"
      ? "The render service is offline. Please try again shortly."
      : "Could not start video assembly.");
  }
  return data.jobId;
}

/**
 * Fetch the current status of a Lane 1 video job started via
 * submitLane1Video(). Returns { status, progress, url, error } as reported
 * by the render worker — status is one of "queued" | "processing" |
 * "done" | "error".
 */
export async function getLane1VideoStatus(jobId) {
  const res = await base44.functions.invoke("getLane1VideoStatus", { jobId });
  return res?.data ?? res;
}

/**
 * Assemble a Lane 1 short video — { scenes: [{ imageUrl, seconds }], ratio,
 * resolution ("1080p"|"720p", default "1080p"), audioMode
 * ("voiceover"|"music"|"silent"), voiceoverUrl, musicUrl } — via the async
 * render-worker job (server-render/lane1.js). Submits the job, then polls
 * until it completes. This replaced Quick Create/Campaign Studio/Demo
 * Video Maker's old client-side Canvas+MediaRecorder assembly
 * (src/utils/videoAssembler.js, still in the repo but no longer called by
 * these pages), which produced silent, capped-resolution WebM with no
 * control over encode quality.
 * - Returns a persistent URL string on success — the worker already
 *   uploads the result to Base44 storage, so there's no separate
 *   uploadFile step for the caller to do afterward.
 * - Throws an Error on any failure to start, poll, or complete the job,
 *   including a timeout.
 */
export async function assembleLane1Video(project, { onProgress } = {}) {
  const jobId = await submitLane1Video(project);

  const POLL_MS = 3000;
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — generous for a multi-scene 1080p short

  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error("Video assembly timed out. Please try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const job = await getLane1VideoStatus(jobId);
    if (typeof job?.progress === "number") onProgress?.(job.progress);
    if (job?.status === "done") return job.url;
    if (job?.status === "error") throw new Error(job.error || "Video assembly failed.");
    // else "queued" / "processing" — keep polling
  }
}

/**
 * Shorten a scene's narration text down to a short on-screen caption
 * (a subtitle, not a paragraph) so it doesn't cover the frame.
 */
export function shortenCaption(text, maxWords = 12) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Split an AI-written video script into `sceneCount` scenes, each with
 * narration/caption text and a derived image prompt. Handles structured
 * "SCENE 1: ..." output as well as plain paragraphs.
 */
export function splitScriptIntoScenes(script, sceneCount = 4) {
  const text = (script || "").trim();
  if (!text) {
    return Array.from({ length: sceneCount }, (_, i) => ({ text: `Scene ${i + 1}`, imagePrompt: "" }));
  }

  // Prefer structured "SCENE n:" / "Shot n -" markers
  const sceneMatches = [...text.matchAll(/(?:^|\n)\s*(?:scene|shot)\s*\d+\s*[:\-]?\s*/gi)];
  let chunks;
  if (sceneMatches.length >= 2) {
    chunks = text.split(/(?:^|\n)\s*(?:scene|shot)\s*\d+\s*[:\-]?\s*/gi).filter((c) => c.trim());
  } else {
    // Fall back to splitting sentences into roughly equal groups
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const perChunk = Math.max(1, Math.ceil(sentences.length / sceneCount));
    chunks = [];
    for (let i = 0; i < sentences.length; i += perChunk) {
      chunks.push(sentences.slice(i, i + perChunk).join(" "));
    }
  }

  while (chunks.length < sceneCount) chunks.push(chunks[chunks.length - 1] || text);
  chunks = chunks.slice(0, sceneCount);

  return chunks.map((c) => {
    const clean = c.trim().replace(/\s+/g, " ");
    return { text: clean, imagePrompt: clean };
  });
}