// video.js — async per-scene AI video generation job for the render
// worker.
//
// Mirrors music.js's structure exactly: create a Replicate prediction,
// poll it to completion, download the result, upload to Base44, return the
// persistent URL. Unlike music (one model), two Replicate models are tried
// in sequence — Kling (primary) and MiniMax (fallback) — since a single
// video-generation provider is more failure-prone (availability, quota,
// per-model outages) than the single-model music path.

import {
  replicateFetch, isRetryableReplicateError, nextReplicateBackoffDelay, MAX_REPLICATE_RETRY_ATTEMPTS,
  nextCreatePredictionBackoffDelay, MAX_CREATE_PREDICTION_RETRY_ATTEMPTS,
  isReplicateBillingError,
} from "./replicate.js";

const POLL_INTERVAL_MS = 3000;
// ~5 minutes — video generation is much slower than music generation, but
// this still runs on the long-lived worker process, not inside a gated
// function call, so it can afford the wait.
const POLL_TIMEOUT_MS = 300_000;

const DEFAULT_PRIMARY_MODEL = "kwaivgi/kling-v1.6-standard";
const DEFAULT_FALLBACK_MODEL = "minimax/video-01";

// Kling's API only accepts these specific duration values — anything else
// is rejected outright. Snap to the nearest one so an out-of-range value
// (a stale client, a caller that bypasses the UI, a future model swap with
// different defaults) can never reach the API. MiniMax (the fallback) has
// no duration parameter at all, so this only ever affects Kling.
const KLING_VALID_DURATIONS = [5, 10];
function snapToValidKlingDuration(seconds) {
  return KLING_VALID_DURATIONS.reduce((closest, candidate) =>
    Math.abs(candidate - seconds) < Math.abs(closest - seconds) ? candidate : closest
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Kling's input schema: an explicit duration/aspect_ratio/cfg_scale.
function buildKlingInput({ prompt, imageUrl, durationSeconds, aspectRatio }) {
  return {
    prompt,
    start_image: imageUrl || undefined,
    duration: snapToValidKlingDuration(durationSeconds),
    aspect_ratio: aspectRatio,
    cfg_scale: 0.5,
  };
}

// MiniMax's input schema is simpler — just a prompt and a starting frame.
function buildMiniMaxInput({ prompt, imageUrl }) {
  return {
    prompt,
    first_frame_image: imageUrl || undefined,
  };
}

// Model-by-name endpoint only (no version-hash pinning branch, unlike
// music.js's createReplicatePrediction) — both VIDEO_MODEL_PRIMARY and
// VIDEO_MODEL_FALLBACK are expected as plain "owner/model" strings.
// Prefer: wait=60 (Replicate's max synchronous wait window) asks Replicate
// to hold the create-prediction response open and return the prediction
// already in a terminal state when it finishes within that window — for a
// short clip this means resolvePrediction below never has to poll at all.
//
// Retries on a transient failure (429/5xx, or a Cloudflare HTML blip —
// replicateFetch classifies both as RetryableReplicateError) with
// exponential backoff, up to MAX_CREATE_PREDICTION_RETRY_ATTEMPTS attempts.
// A well-formed rejection (bad input, invalid model — a plain Error, not
// RetryableReplicateError) is never retried, it fails immediately. This
// wraps both the primary (Kling) and fallback (MiniMax) calls, since both
// go through this same function — each model gets its own full set of
// retries before generateSceneVideo gives up on it and (for the primary)
// falls through to the other model, or (for the fallback) surfaces the
// combined "Both video models failed" error.
async function createReplicatePrediction(model, token, input) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_CREATE_PREDICTION_RETRY_ATTEMPTS; attempt++) {
    try {
      return await replicateFetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        token,
        method: "POST",
        body: { input },
        headers: { Prefer: "wait=60" },
      });
    } catch (err) {
      lastErr = err;
      if (!isRetryableReplicateError(err) || attempt === MAX_CREATE_PREDICTION_RETRY_ATTEMPTS - 1) {
        throw new Error(`Replicate prediction creation failed (${model}): ${err.message}`);
      }
      console.warn(`[video] Prediction creation failed transiently (attempt ${attempt + 1}/${MAX_CREATE_PREDICTION_RETRY_ATTEMPTS}) for ${model}: ${err.message}`);
      await sleep(nextCreatePredictionBackoffDelay(attempt));
    }
  }
  // Unreachable — the loop above always either returns or throws — but keeps
  // this function's return type honest for anything that changes the loop later.
  throw new Error(`Replicate prediction creation failed (${model}): ${lastErr?.message}`);
}

async function pollReplicatePrediction(prediction, token, onProgress, progressFloor, progressCeil) {
  const startedAt = Date.now();
  const deadline = startedAt + POLL_TIMEOUT_MS;
  let current = prediction;
  let retryAttempt = 0;

  while (current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled") {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Replicate video generation to finish.");
    }
    // Normal pacing between polls, except right after a transient failure —
    // then use the backoff delay instead so retries don't hammer Replicate.
    await sleep(retryAttempt > 0 ? nextReplicateBackoffDelay(retryAttempt - 1) : POLL_INTERVAL_MS);

    const pollUrl = current.urls?.get || `https://api.replicate.com/v1/predictions/${current.id}`;
    try {
      current = await replicateFetch(pollUrl, { token });
      retryAttempt = 0;
    } catch (err) {
      if (isRetryableReplicateError(err) && retryAttempt < MAX_REPLICATE_RETRY_ATTEMPTS) {
        retryAttempt++;
        console.warn(`[video] Replicate poll failed transiently (attempt ${retryAttempt}/${MAX_REPLICATE_RETRY_ATTEMPTS}): ${err.message}`);
        continue;
      }
      throw err;
    }

    // Replicate doesn't expose a real completion percentage — approximate
    // with elapsed-time-over-budget, scaled into this attempt's slice of
    // the overall progress range.
    const elapsedFrac = Math.min(1, (Date.now() - startedAt) / POLL_TIMEOUT_MS);
    onProgress(progressFloor + elapsedFrac * (progressCeil - progressFloor));
  }

  if (current.status !== "succeeded") {
    // Surface Replicate's own error text verbatim, same as music.js — a
    // billing/credit or content-policy error should reach the caller
    // exactly as Replicate phrased it.
    const providerMessage = current.error ? String(current.error) : "no further detail from the provider";
    throw new Error(`Replicate generation ${current.status}: ${providerMessage}`);
  }
  return current;
}

// Handles the create-prediction response given Prefer: wait=60: if it's
// already terminal (the common case for a short clip), resolve directly
// with no poll GET at all; otherwise the job outlasted the wait window and
// this falls back to the hardened poll loop above.
async function resolvePrediction(prediction, token, onProgress, progressFloor, progressCeil) {
  if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
    if (prediction.status !== "succeeded") {
      const providerMessage = prediction.error ? String(prediction.error) : "no further detail from the provider";
      throw new Error(`Replicate generation ${prediction.status}: ${providerMessage}`);
    }
    onProgress(progressCeil);
    return prediction;
  }
  return pollReplicatePrediction(prediction, token, onProgress, progressFloor, progressCeil);
}

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as music.js's
// uploadToBase44 (itself mirroring render.js's uploadResult) — downloads
// the Replicate-hosted result and re-uploads it to Base44 storage so the
// caller gets back a persistent, durable URL.
async function uploadToBase44(videoUrl) {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download generated video (${videoRes.status} ${videoRes.statusText})`);
  }
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/mp4" }), "ai-scene-video.mp4");

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

async function generateWithModel(model, input, token, onProgress, progressFloor, progressCeil) {
  const prediction = await createReplicatePrediction(model, token, input);
  const finished = await resolvePrediction(prediction, token, onProgress, progressFloor, progressCeil);
  const output = finished.output;
  const videoUrl = Array.isArray(output) ? output[0] : output;
  if (!videoUrl || typeof videoUrl !== "string") {
    throw new Error(`Replicate (${model}) finished successfully but returned no video URL.`);
  }
  return videoUrl;
}

/**
 * generateSceneVideo(spec, onProgress) — creates a Replicate video-
 * generation prediction from spec = { prompt, imageUrl, durationSeconds,
 * aspectRatio }, trying the primary model (Kling) first and retrying once
 * with the fallback model (MiniMax) if the primary throws for any reason.
 * Polls to completion, uploads the result to Base44, and returns the
 * persistent file_url. Only throws if both models fail.
 */
export async function generateSceneVideo(spec, onProgress = () => {}) {
  // BYOK (Work Package F): a user's own Replicate token, forwarded by the
  // submitVideo Base44 function, takes priority over the platform token so
  // the job bills the user's account instead of the platform's.
  const token = spec?.byok?.replicateToken || process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured.");

  const primaryModel = process.env.VIDEO_MODEL_PRIMARY || DEFAULT_PRIMARY_MODEL;
  const fallbackModel = process.env.VIDEO_MODEL_FALLBACK || DEFAULT_FALLBACK_MODEL;

  const prompt = spec?.prompt?.trim() || "cinematic scene";
  const imageUrl = spec?.imageUrl || undefined;
  const durationSeconds = Math.max(1, Number(spec?.durationSeconds) || 5);
  const aspectRatio = spec?.aspectRatio || "16:9";

  onProgress(0);

  let videoUrl;
  try {
    const input = buildKlingInput({ prompt, imageUrl, durationSeconds, aspectRatio });
    videoUrl = await generateWithModel(primaryModel, input, token, onProgress, 0.05, 0.7);
  } catch (primaryError) {
    // The two models are a guard against ONE MODEL being unavailable. They
    // are not a guard against the ACCOUNT being unfunded — both bill the
    // same Replicate account on the same token, so a 402 on the primary
    // guarantees a 402 on the fallback. Failing over anyway just fired a
    // second doomed request per scene and drew rate limits, which is how a
    // plain "insufficient credit" ended up buried under a burst of 429s.
    // Stop here and say the one thing an operator can act on.
    if (isReplicateBillingError(primaryError)) {
      console.error(
        `[generateSceneVideo] ${primaryModel} rejected for billing — not trying ${fallbackModel}, ` +
        `it bills the same account: ${primaryError.message}`
      );
      throw primaryError;
    }

    console.error(
      `[generateSceneVideo] Primary model (${primaryModel}) failed, retrying with fallback (${fallbackModel}):`,
      primaryError?.message || primaryError
    );
    try {
      const input = buildMiniMaxInput({ prompt, imageUrl });
      videoUrl = await generateWithModel(fallbackModel, input, token, onProgress, 0.05, 0.7);
    } catch (fallbackError) {
      // A billing failure on the fallback is equally actionable — surface it
      // on its own rather than as half of a combined message.
      if (isReplicateBillingError(fallbackError)) throw fallbackError;
      throw new Error(
        `Both video models failed. Primary (${primaryModel}): ${primaryError?.message || primaryError}. ` +
        `Fallback (${fallbackModel}): ${fallbackError?.message || fallbackError}`
      );
    }
  }

  onProgress(0.85);
  const fileUrl = await uploadToBase44(videoUrl);
  onProgress(1);
  return fileUrl;
}
