// music.js — async AI music-generation job for the render worker.
//
// Two providers, selected automatically by what's configured and what the
// caller asked for:
//   - Suno (generateSunoSongJob below): a real full song, with vocals, from
//     lyrics. Only runs when a Suno key is actually available — the
//     platform's SUNO_API_KEY, or a BYOK sunoApiKey forwarded by
//     submitMusic/entry.ts. Suno has no official public API as of writing,
//     so this targets the de facto community-standard third-party REST
//     contract (POST /api/v1/generate + GET /api/v1/generate/record-info,
//     the shape exposed by sunoapi.org and similarly-shaped resellers) —
//     see generateSunoSongJob's docstring for specifics and how to point it
//     at a different reseller via SUNO_API_BASE_URL.
//   - Replicate MusicGen (generateWithReplicateMusicGen, unchanged from
//     before): short instrumental-only clips. This is the fallback whenever
//     a vocal song was requested but no Suno key is configured, and the
//     only path at all when an instrumental was requested.
//
// This mirrors render.js's Replicate-prediction-then-upload shape (and the
// same version-hash-vs-model-by-name branching as the old, now-unused
// base44/functions/generateMusic/entry.ts), but runs as its own job kind
// through index.js's async job queue instead of inside a synchronous Base44
// function call — that old path was hitting the function gateway's timeout
// for anything but very short clips. Running here, on a long-lived worker
// process rather than a gated function invocation, this can afford a much
// more generous poll budget.

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000; // ~120s — generous, since this isn't racing a function gateway timeout

const DEFAULT_MODEL = "meta/musicgen";
const DEFAULT_MODEL_VERSION = "stereo-large";

// Real vocal song generation is a much bigger job than a 15s instrumental
// clip (Suno renders a full ~2-4 minute song), so it gets its own, more
// generous poll budget rather than sharing MusicGen's.
const SUNO_POLL_INTERVAL_MS = 5000;
const SUNO_POLL_TIMEOUT_MS = 300_000; // ~5 minutes
const SUNO_DEFAULT_BASE_URL = "https://api.sunoapi.org";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same branching as generateMusic/entry.ts's createReplicatePrediction:
// "owner/model" (no version hash) uses the model-by-name endpoint (always
// runs the latest pushed version); "owner/model:versionhash" falls back to
// the generic /v1/predictions endpoint, the only one that accepts an
// explicit pinned version.
async function createReplicatePrediction(model, token, prompt, duration, modelVersion) {
  const input = {
    prompt,
    model_version: modelVersion || DEFAULT_MODEL_VERSION,
    duration,
    output_format: "mp3",
  };

  const versionHashIndex = model.indexOf(":");
  const hasVersionHash = versionHashIndex !== -1;

  const url = hasVersionHash
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${model}/predictions`;

  const body = hasVersionHash
    ? { version: model.slice(versionHashIndex + 1), input }
    : { input };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Replicate prediction creation failed: ${detail}`);
  }
  return res.json();
}

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as render.js's
// uploadResult — downloads the provider-hosted result and re-uploads it to
// Base44 storage so the caller gets back a persistent, durable URL rather
// than a link into the provider's own (often temporary) storage.
async function uploadToBase44(audioUrl, filename = "ai-background-music.mp3") {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download generated audio (${audioRes.status} ${audioRes.statusText})`);
  }
  const buffer = Buffer.from(await audioRes.arrayBuffer());
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/mpeg" }), filename);

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

/* ── Suno provider (real vocal song generation) ──────────────────────────
 * Suno has no official public API as of writing, so this targets the
 * de facto community-standard third-party REST contract that most Suno API
 * resellers (e.g. sunoapi.org and similarly-shaped services) expose:
 *   - POST  {base}/api/v1/generate            -> { data: { taskId } }
 *   - GET   {base}/api/v1/generate/record-info?taskId=...
 *           -> { data: { status, response: { sunoData: [{ audioUrl }] } } }
 * If your chosen Suno reseller uses a different shape, this is the only
 * place that needs to change — everything above and below it (metering,
 * entitlement, job queue, polling contract with the frontend) is provider-
 * agnostic. SUNO_API_BASE_URL overrides the default host for a reseller
 * with a different endpoint.
 * ────────────────────────────────────────────────────────────────────── */

async function createSunoTask(baseUrl, apiKey, spec) {
  const lyrics = spec?.lyrics?.trim();
  const style = [spec?.genre, spec?.mood].filter((s) => typeof s === "string" && s.trim()).join(", ");
  const body = {
    // customMode + a lyrics-shaped prompt gets Suno to sing the supplied
    // lyrics rather than freely improvising its own from a short prompt.
    customMode: !!lyrics,
    instrumental: false,
    prompt: lyrics || spec?.prompt?.trim() || "An original song",
    style: style || undefined,
    title: (spec?.title || spec?.prompt || "Untitled").slice(0, 80),
    model: process.env.SUNO_MODEL || "V4_5",
  };

  const res = await fetch(`${baseUrl}/api/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Suno task creation failed: ${detail}`);
  }
  const data = await res.json();
  const taskId = data?.data?.taskId || data?.taskId;
  if (!taskId) throw new Error("Suno accepted the request but returned no task id.");
  return taskId;
}

async function pollSunoTask(baseUrl, apiKey, taskId, onFraction) {
  const startedAt = Date.now();
  const deadline = startedAt + SUNO_POLL_TIMEOUT_MS;

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Suno song generation to finish.");
    }
    await sleep(SUNO_POLL_INTERVAL_MS);

    const res = await fetch(
      `${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
      throw new Error(`Suno polling failed: ${detail}`);
    }
    const data = await res.json();
    const status = String(data?.data?.status || data?.status || "").toUpperCase();

    onFraction(Math.min(0.85, (Date.now() - startedAt) / SUNO_POLL_TIMEOUT_MS));

    if (status.includes("FAIL") || status === "ERROR") {
      const providerMessage = data?.data?.errorMessage || data?.msg || "no further detail from the provider";
      throw new Error(`Suno generation failed: ${providerMessage}`);
    }
    if (status.includes("SUCCESS") || status === "COMPLETE" || status === "SUCCEEDED") {
      const tracks = data?.data?.response?.sunoData || data?.data?.sunoData || [];
      const audioUrl = tracks?.[0]?.audioUrl || tracks?.[0]?.audio_url;
      if (!audioUrl) throw new Error("Suno finished but returned no audio URL.");
      return audioUrl;
    }
    // Anything else (PENDING, TEXT_SUCCESS, FIRST_SUCCESS, GENERATING, ...)
    // is a normal in-progress state — keep polling.
  }
}

/**
 * generateSunoSongJob(spec, onProgress) — creates a Suno song-generation
 * task from spec = { prompt, lyrics, genre, mood, title }, polls it to
 * completion, uploads the result to Base44, and returns
 * { url, vocals: true }.
 */
async function generateSunoSongJob(spec, onProgress) {
  const apiKey = spec?.byok?.sunoApiKey || process.env.SUNO_API_KEY;
  const baseUrl = (process.env.SUNO_API_BASE_URL || SUNO_DEFAULT_BASE_URL).replace(/\/+$/, "");

  onProgress(0);
  const taskId = await createSunoTask(baseUrl, apiKey, spec);
  onProgress(0.1);

  const audioUrl = await pollSunoTask(baseUrl, apiKey, taskId, (fraction) => onProgress(0.1 + fraction * 0.75));
  onProgress(0.9);

  const fileUrl = await uploadToBase44(audioUrl, "ai-song.mp3");
  onProgress(1);
  return { url: fileUrl, vocals: true };
}

/**
 * generateWithReplicateMusicGen(spec, onProgress) — creates a Replicate
 * music-generation prediction from spec = { prompt, durationSeconds,
 * model_version }, polls it to completion, uploads the result to Base44,
 * and returns { url, vocals: false } — MusicGen has no vocal synthesis, so
 * this is instrumental-only regardless of what was asked for.
 */
async function generateWithReplicateMusicGen(spec, onProgress) {
  // BYOK (Work Package F): a user's own Replicate token, forwarded by the
  // submitMusic Base44 function, takes priority over the platform token so
  // the job bills the user's account instead of the platform's.
  const token = spec?.byok?.replicateToken || process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const model = process.env.REPLICATE_MUSIC_MODEL || DEFAULT_MODEL;

  onProgress(0);

  const prompt = spec?.prompt?.trim() || "cinematic instrumental background music";
  const duration = Math.max(1, Number(spec?.durationSeconds) || 30);

  let prediction = await createReplicatePrediction(model, token, prompt, duration, spec?.model_version);
  onProgress(0.1);

  const startedAt = Date.now();
  const deadline = startedAt + POLL_TIMEOUT_MS;

  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Replicate music generation to finish.");
    }
    await sleep(POLL_INTERVAL_MS);

    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      const detail = await pollRes.text().catch(() => `${pollRes.status} ${pollRes.statusText}`);
      throw new Error(`Replicate polling failed: ${detail}`);
    }
    prediction = await pollRes.json();

    // Replicate doesn't expose a real completion percentage for this
    // model — approximate with elapsed-time-over-budget instead.
    onProgress(Math.min(0.85, 0.1 + ((Date.now() - startedAt) / POLL_TIMEOUT_MS) * 0.75));
  }

  if (prediction.status !== "succeeded") {
    // Surface Replicate's own error text verbatim, same as
    // generateMusic/entry.ts — a billing/credit error should reach the
    // caller exactly as Replicate phrased it.
    const providerMessage = prediction.error ? String(prediction.error) : "no further detail from the provider";
    throw new Error(`Replicate generation ${prediction.status}: ${providerMessage}`);
  }

  const output = prediction.output;
  const audioUrl = Array.isArray(output) ? output[0] : output;
  if (!audioUrl || typeof audioUrl !== "string") {
    throw new Error("Replicate finished successfully but returned no audio URL.");
  }
  onProgress(0.9);

  const fileUrl = await uploadToBase44(audioUrl);
  onProgress(1);
  return { url: fileUrl, vocals: false };
}

/**
 * generateMusicJob(spec, onProgress) — dispatches to the Suno vocal-song
 * provider or the Replicate/MusicGen instrumental provider, whichever
 * actually applies:
 *   - spec.instrumental === false (a real song, with vocals, was asked
 *     for) AND a Suno key is available (platform SUNO_API_KEY, or a BYOK
 *     spec.byok.sunoApiKey forwarded by submitMusic/entry.ts) -> Suno.
 *   - anything else -> Replicate MusicGen, instrumental-only, same as
 *     always. This is also the fallback when vocals were requested but no
 *     Suno key is configured — the caller finds out via the returned
 *     `vocals: false` (surfaced by getMusicStatus and the frontend) rather
 *     than getting an opaque failure or a silently wrong result.
 * Either branch returns { url, vocals }.
 */
export async function generateMusicJob(spec, onProgress = () => {}) {
  const wantsVocals = spec?.instrumental === false;
  const sunoKey = spec?.byok?.sunoApiKey || process.env.SUNO_API_KEY;

  if (wantsVocals && sunoKey) {
    return generateSunoSongJob(spec, onProgress);
  }
  return generateWithReplicateMusicGen(spec, onProgress);
}
