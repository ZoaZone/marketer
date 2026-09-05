// music.js — async AI music-generation job for the render worker.
//
// This runs as its own job kind through index.js's async job queue instead
// of inside a synchronous Base44 function call — that old path was hitting
// the function gateway's timeout for anything but very short clips.
//
// PROVIDERS
// ---------
// Selected by MUSIC_PROVIDER (default "elevenlabs"):
//
//   - "elevenlabs" (default) — ElevenLabs Music, POST /v1/music. One
//     synchronous request that returns the finished audio bytes in the
//     response body; there is no prediction to poll and no provider-hosted
//     temp URL to re-download. It also generates *vocals*, so the
//     "Sung / full song" flow in SongCreator finally produces what it
//     claims to, and it accepts up to 10 minutes of audio per request, so a
//     score can actually be as long as the film it is scoring.
//
//   - "replicate" — the previous MusicGen path, kept as a fallback so a
//     deployment can switch back with an env var if ElevenLabs is
//     unavailable. Instrumental-only, and its practical length ceiling is
//     far shorter than ElevenLabs'.
//
//   - "suno" — accepted as a legacy alias for "elevenlabs". Suno has no
//     public API; this value only ever selected a stub that threw. Mapping
//     it forward means an old deployment still holding MUSIC_PROVIDER=suno
//     generates music instead of failing every request.

const REPLICATE_POLL_INTERVAL_MS = 2000;
const REPLICATE_POLL_TIMEOUT_MS = 120_000; // ~120s — generous, since this isn't racing a function gateway timeout

const DEFAULT_REPLICATE_MODEL = "meta/musicgen";
const DEFAULT_REPLICATE_MODEL_VERSION = "stereo-large";

// ElevenLabs Music accepts 3s–600s per request (music_length_ms is in
// milliseconds). Anything the caller asks for is clamped into that window
// rather than rejected — a film longer than 10 minutes still gets a track,
// it just gets extended by the renderer's own crossfaded-loop pass (see
// buildVariedMusicTrack in render.js) instead of being generated whole.
const EL_MIN_DURATION_SECONDS = 3;
const EL_MAX_DURATION_SECONDS = 600;
const EL_DEFAULT_MODEL_ID = "music_v1";
const EL_DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
// Generating several minutes of music takes ElevenLabs a while, and the
// request holds open for the whole generation. Cap it so a hung provider
// call can't occupy the worker's single-item queue indefinitely.
const EL_REQUEST_TIMEOUT_MS = 300_000;

// Replicate's music models reject long durations outright and get
// dramatically slower as the clip grows, so the fallback path keeps the
// tight clamp the old code relied on.
const REPLICATE_MIN_DURATION_SECONDS = 5;
const REPLICATE_MAX_DURATION_SECONDS = 30;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(seconds, min, max, fallback) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function resolveProvider() {
  const raw = (process.env.MUSIC_PROVIDER || "").trim().toLowerCase();
  if (!raw) return "elevenlabs";
  if (raw === "suno") {
    // Not an error — see the header comment. Log once per job so the stale
    // config is visible in the worker's output.
    console.warn('[music] MUSIC_PROVIDER="suno" is a legacy value with no working API; using ElevenLabs instead.');
    return "elevenlabs";
  }
  return raw;
}

/* ── ElevenLabs provider ───────────────────────────────────────────────
 * POST https://api.elevenlabs.io/v1/music?output_format=<fmt>
 *   headers: xi-api-key, Content-Type: application/json
 *   body:    { prompt, music_length_ms, model_id, force_instrumental }
 *   returns: raw audio bytes (no JSON envelope, no polling)
 * ──────────────────────────────────────────────────────────────────── */

// ElevenLabs takes a single free-text prompt. When the caller supplied
// lyrics and did NOT ask for an instrumental, the lyrics go into the same
// prompt — the model sings them. (This is the whole reason the old
// MusicGen path silently ignored `lyrics`: MusicGen has no vocal synthesis
// at all, so SongCreator's "Sung / full song" button produced an
// instrumental no matter what.)
function buildElevenLabsPrompt(spec) {
  const prompt = spec?.prompt?.trim() || "cinematic instrumental background music";
  const lyrics = typeof spec?.lyrics === "string" ? spec.lyrics.trim() : "";
  if (spec?.instrumental === false && lyrics) {
    return `${prompt}\n\nSing the following lyrics:\n${lyrics}`;
  }
  return prompt;
}

async function generateWithElevenLabs(spec, onProgress) {
  const apiKey = spec?.byok?.elevenLabsKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const modelId = process.env.ELEVENLABS_MUSIC_MODEL_ID?.trim() || EL_DEFAULT_MODEL_ID;
  const outputFormat = process.env.ELEVENLABS_MUSIC_OUTPUT_FORMAT?.trim() || EL_DEFAULT_OUTPUT_FORMAT;
  const seconds = clamp(spec?.durationSeconds, EL_MIN_DURATION_SECONDS, EL_MAX_DURATION_SECONDS, 30);

  const body = {
    prompt: buildElevenLabsPrompt(spec),
    music_length_ms: seconds * 1000,
    model_id: modelId,
    // Default to instrumental: every caller except SongCreator's
    // "Sung / full song" wants a score to sit under narration, and vocals
    // there would fight the voiceover.
    force_instrumental: spec?.instrumental !== false,
  };

  onProgress(0.1);

  // There is no progress signal to read from a single blocking request —
  // the response arrives complete or not at all. Report a steady tick off
  // the elapsed-time budget so the UI's bar still moves, same approach the
  // Replicate path uses for its (equally opaque) prediction.
  const startedAt = Date.now();
  const ticker = setInterval(() => {
    onProgress(Math.min(0.85, 0.1 + ((Date.now() - startedAt) / EL_REQUEST_TIMEOUT_MS) * 0.75));
  }, 2000);

  let res;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(outputFormat)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(EL_REQUEST_TIMEOUT_MS),
      },
    );
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      throw new Error("Timed out waiting for ElevenLabs music generation to finish.");
    }
    throw e;
  } finally {
    clearInterval(ticker);
  }

  if (!res.ok) {
    // Surface ElevenLabs' own error text verbatim. Its music endpoint
    // returns a structured reason for the two failures a user can actually
    // act on — `bad_prompt` (the prompt named a real artist or quoted
    // copyrighted lyrics, and the body carries a `prompt_suggestion`) and
    // quota exhaustion — so paraphrasing it into "generation failed" would
    // throw away the only actionable part.
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`ElevenLabs music generation failed (${res.status}): ${detail}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    throw new Error("ElevenLabs returned an empty audio response.");
  }
  onProgress(0.9);
  return { buffer, contentType: res.headers.get("content-type") || "audio/mpeg" };
}

/* ── Replicate provider (fallback) ─────────────────────────────────────
 * "owner/model" (no version hash) uses the model-by-name endpoint (always
 * runs the latest pushed version); "owner/model:versionhash" falls back to
 * the generic /v1/predictions endpoint, the only one that accepts an
 * explicit pinned version.
 * ──────────────────────────────────────────────────────────────────── */

async function createReplicatePrediction(model, token, prompt, duration, modelVersion) {
  const input = {
    prompt,
    model_version: modelVersion || DEFAULT_REPLICATE_MODEL_VERSION,
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

async function generateWithReplicate(spec, onProgress) {
  // BYOK (Work Package F): a user's own Replicate token, forwarded by the
  // submitMusic Base44 function, takes priority over the platform token so
  // the job bills the user's account instead of the platform's.
  const token = spec?.byok?.replicateToken || process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const model = process.env.REPLICATE_MUSIC_MODEL || DEFAULT_REPLICATE_MODEL;

  const prompt = spec?.prompt?.trim() || "cinematic instrumental background music";
  const duration = clamp(
    spec?.durationSeconds,
    REPLICATE_MIN_DURATION_SECONDS,
    REPLICATE_MAX_DURATION_SECONDS,
    30,
  );

  let prediction = await createReplicatePrediction(model, token, prompt, duration, spec?.model_version);
  onProgress(0.1);

  const startedAt = Date.now();
  const deadline = startedAt + REPLICATE_POLL_TIMEOUT_MS;

  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Replicate music generation to finish.");
    }
    await sleep(REPLICATE_POLL_INTERVAL_MS);

    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      const detail = await pollRes.text().catch(() => `${pollRes.status} ${pollRes.statusText}`);
      throw new Error(`Replicate polling failed: ${detail}`);
    }
    prediction = await pollRes.json();

    // Replicate doesn't expose a real completion percentage for this
    // model — approximate with elapsed-time-over-budget instead.
    onProgress(Math.min(0.85, 0.1 + ((Date.now() - startedAt) / REPLICATE_POLL_TIMEOUT_MS) * 0.75));
  }

  if (prediction.status !== "succeeded") {
    // Surface Replicate's own error text verbatim — a billing/credit error
    // should reach the caller exactly as Replicate phrased it.
    const providerMessage = prediction.error ? String(prediction.error) : "no further detail from the provider";
    throw new Error(`Replicate generation ${prediction.status}: ${providerMessage}`);
  }

  const output = prediction.output;
  const audioUrl = Array.isArray(output) ? output[0] : output;
  if (!audioUrl || typeof audioUrl !== "string") {
    throw new Error("Replicate finished successfully but returned no audio URL.");
  }

  // Unlike ElevenLabs, Replicate hands back a link into its own temporary
  // storage rather than the bytes — fetch them here so both providers
  // return the same { buffer, contentType } shape to the uploader below.
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download generated audio (${audioRes.status} ${audioRes.statusText})`);
  }
  const buffer = Buffer.from(await audioRes.arrayBuffer());
  onProgress(0.9);
  return { buffer, contentType: audioRes.headers.get("content-type") || "audio/mpeg" };
}

/* ── Upload ───────────────────────────────────────────────────────────── */

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as render.js's
// uploadResult — the caller gets back a persistent, durable Base44 URL
// rather than a link into a provider's own (temporary) storage.
async function uploadToBase44(buffer, contentType) {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "audio/mpeg" }), "ai-background-music.mp3");

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
 * generateMusicJob(spec, onProgress) — generates a track from
 * spec = { prompt, durationSeconds, instrumental, lyrics, model_version },
 * uploads it to Base44, and returns the persistent file_url.
 *
 * `instrumental` defaults to true; pass false (with `lyrics`) to get a sung
 * track from the ElevenLabs provider. `model_version` is Replicate-only.
 */
export async function generateMusicJob(spec, onProgress = () => {}) {
  onProgress(0);

  const provider = resolveProvider();
  const { buffer, contentType } =
    provider === "replicate"
      ? await generateWithReplicate(spec, onProgress)
      : await generateWithElevenLabs(spec, onProgress);

  const fileUrl = await uploadToBase44(buffer, contentType);
  onProgress(1);
  return fileUrl;
}
