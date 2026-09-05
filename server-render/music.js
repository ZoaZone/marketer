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
//     synchronous request that returns the finished audio bytes; there is
//     no prediction to poll and no provider-hosted temp URL to re-download.
//     It is the only provider here that covers BOTH cases on an official,
//     documented API: instrumental beds (force_instrumental) and real sung
//     vocals from supplied lyrics. Accepts 3s-600s per request, so a score
//     can be as long as the film it scores.
//
//   - "suno" — the third-party Suno path (generateSunoSongJob below).
//     Vocals only; instrumental requests still go to ElevenLabs. Suno has
//     no official public API, so this targets the de facto
//     community-standard reseller contract and is opt-in rather than a
//     default: it runs only when MUSIC_PROVIDER is explicitly "suno" AND a
//     key is actually available (platform SUNO_API_KEY, or a BYOK
//     sunoApiKey forwarded by submitMusic/entry.ts). Without a key it falls
//     back to ElevenLabs rather than failing the user's action.
//
//   - "replicate" — MusicGen. Instrumental-only, with a far shorter usable
//     clip length than ElevenLabs. Kept so a deployment can switch back
//     with an env var; a vocals request still prefers ElevenLabs when a key
//     exists, since MusicGen cannot sing at all.
//
// Every branch resolves to { url, vocals } so the caller always learns
// whether it actually got a sung track or an instrumental — see
// getMusicStatus and aiClient.generateMusic.
//
// RUNTIME FALLBACK
// ---------------
// pickProvider (below) decides who goes FIRST, but a provider that is
// configured can still fail mid-run — the exact case that motivated this:
// ElevenLabs answering 401 "missing_permissions: music_generation" because
// the platform key exists but lacks the Music permission, which used to
// error the whole job even though a working Replicate token sat right next
// to it. generateMusicJob therefore walks a capability-aware chain (see
// fallbackChain): suno → elevenlabs → replicate for a vocals request,
// elevenlabs → replicate for an instrumental (Suno is never an
// instrumental fallback — it only sings). The job only errors when every
// provider on the chain has failed. submitMusic/entry.ts still charges from
// pickProvider's answer, which stays correct for the run KIND (a vocal run
// degraded to MusicGen is reported vocals:false so the caller knows what
// they got), and a BYOK run whose own key fails deliberately falls through
// to the platform key — delivering the user's music beats a hard error.

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
// dramatically slower as the clip grows, so the fallback path keeps a
// tight clamp.
const REPLICATE_MIN_DURATION_SECONDS = 5;
const REPLICATE_MAX_DURATION_SECONDS = 30;

// Real vocal song generation is a much bigger job than a short instrumental
// clip (Suno renders a full ~2-4 minute song), so it gets its own, more
// generous poll budget.
const SUNO_POLL_INTERVAL_MS = 5000;
const SUNO_POLL_TIMEOUT_MS = 300_000; // ~5 minutes
const SUNO_DEFAULT_BASE_URL = "https://api.sunoapi.org";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(seconds, min, max, fallback) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ── Upload ───────────────────────────────────────────────────────────── */

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as render.js's
// uploadResult — the caller gets back a persistent, durable Base44 URL
// rather than a link into a provider's own (temporary) storage.
async function uploadBufferToBase44(buffer, contentType, filename = "ai-background-music.mp3") {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType || "audio/mpeg" }), filename);

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

// Providers that hand back a link into their own temporary storage
// (Replicate, Suno) rather than the bytes themselves.
async function uploadUrlToBase44(audioUrl, filename = "ai-background-music.mp3") {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download generated audio (${audioRes.status} ${audioRes.statusText})`);
  }
  const buffer = Buffer.from(await audioRes.arrayBuffer());
  return uploadBufferToBase44(buffer, audioRes.headers.get("content-type") || "audio/mpeg", filename);
}

/* ── ElevenLabs provider (default) ─────────────────────────────────────
 * POST https://api.elevenlabs.io/v1/music?output_format=<fmt>
 *   headers: xi-api-key, Content-Type: application/json
 *   body:    { prompt, music_length_ms, model_id, force_instrumental }
 *   returns: raw audio bytes (no JSON envelope, no polling)
 * ──────────────────────────────────────────────────────────────────── */

// ElevenLabs takes a single free-text prompt. When the caller supplied
// lyrics and did NOT ask for an instrumental, the lyrics go into the same
// prompt — the model sings them. (This is why the old MusicGen-only path
// silently ignored `lyrics`: MusicGen has no vocal synthesis at all, so
// SongCreator's "Sung / full song" button produced an instrumental no
// matter what.)
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
  const wantsVocals = spec?.instrumental === false;

  const body = {
    prompt: buildElevenLabsPrompt(spec),
    music_length_ms: seconds * 1000,
    model_id: modelId,
    // Default to instrumental: every caller except SongCreator's
    // "Sung / full song" wants a score to sit under narration, and vocals
    // there would fight the voiceover.
    force_instrumental: !wantsVocals,
  };

  onProgress(0.1);

  // There is no progress signal to read from a single blocking request —
  // the response arrives complete or not at all. Report a steady tick off
  // the elapsed-time budget so the UI's bar still moves, the same approach
  // the Replicate path uses for its (equally opaque) prediction.
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

  const fileUrl = await uploadBufferToBase44(
    buffer,
    res.headers.get("content-type") || "audio/mpeg",
    wantsVocals ? "ai-song.mp3" : "ai-background-music.mp3",
  );
  onProgress(1);
  // ElevenLabs honours force_instrumental, so what was asked for is what
  // was produced — no "asked for vocals, got an instrumental" gap here.
  return { url: fileUrl, vocals: wantsVocals };
}

/* ── Suno provider (opt-in vocal songs) ──────────────────────────────────
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
 *
 * Because that contract is unofficial and can change without notice, this
 * provider is opt-in (MUSIC_PROVIDER=suno) rather than the default for
 * vocals — ElevenLabs covers the same case on a documented API.
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

  const fileUrl = await uploadUrlToBase44(audioUrl, "ai-song.mp3");
  onProgress(1);
  return { url: fileUrl, vocals: true };
}

/* ── Replicate provider (instrumental fallback) ─────────────────────────
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

/**
 * generateWithReplicateMusicGen(spec, onProgress) — creates a Replicate
 * music-generation prediction, polls it to completion, uploads the result
 * to Base44, and returns { url, vocals: false } — MusicGen has no vocal
 * synthesis, so this is instrumental-only regardless of what was asked for.
 */
async function generateWithReplicateMusicGen(spec, onProgress) {
  // BYOK (Work Package F): a user's own Replicate token, forwarded by the
  // submitMusic Base44 function, takes priority over the platform token so
  // the job bills the user's account instead of the platform's.
  const token = spec?.byok?.replicateToken || process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const model = process.env.REPLICATE_MUSIC_MODEL || DEFAULT_REPLICATE_MODEL;

  onProgress(0);

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
  onProgress(0.9);

  const fileUrl = await uploadUrlToBase44(audioUrl);
  onProgress(1);
  return { url: fileUrl, vocals: false };
}

/**
 * pickProvider(spec, env) — which provider will actually run, given
 * MUSIC_PROVIDER, the keys available, and whether vocals were asked for.
 *
 * Exported because submitMusic/entry.ts has to charge the right metering
 * kind (a vocal song costs 1 RM, an instrumental 0.25 RM) BEFORE the job is
 * submitted, and the two must not be able to disagree about what runs.
 *
 * Resolution, in order:
 *   1. Vocals requested + MUSIC_PROVIDER=suno + a Suno key -> "suno".
 *   2. An ElevenLabs key -> "elevenlabs". It covers instrumental and vocals
 *      alike, so it is the default for either; a vocals request prefers it
 *      even under MUSIC_PROVIDER=replicate, because MusicGen cannot sing at
 *      all and producing what was asked for beats honouring a provider
 *      preference that cannot satisfy it.
 *   3. Otherwise -> "replicate", instrumental-only, which is also the
 *      degraded answer to a vocals request with no vocal-capable key.
 */
export function pickProvider(spec = {}, env = process.env) {
  const wantsVocals = spec?.instrumental === false;
  const configured = (env.MUSIC_PROVIDER || "").trim().toLowerCase() || "elevenlabs";
  const sunoKey = spec?.byok?.sunoApiKey || env.SUNO_API_KEY;
  const elevenLabsKey = spec?.byok?.elevenLabsKey || env.ELEVENLABS_API_KEY;

  if (wantsVocals && configured === "suno" && sunoKey) return "suno";
  if (elevenLabsKey && (configured !== "replicate" || wantsVocals)) return "elevenlabs";
  return "replicate";
}

/**
 * generateMusicJob(spec, onProgress) — generates a track from
 * spec = { prompt, durationSeconds, instrumental, lyrics, genre, mood,
 * title, model_version }, uploads it to Base44, and returns
 * { url, vocals }.
 *
 * `instrumental` defaults to true; pass false (with `lyrics`) to ask for a
 * sung track. `vocals` in the result says whether one was actually
 * produced — a vocals request that could only be served by MusicGen comes
 * back `vocals: false` rather than silently passing off an instrumental as
 * a song. `model_version` is Replicate-only.
 *
 * Providers are tried as a capability-aware RUNTIME FALLBACK chain (see
 * fallbackChain), not a single take-it-or-leave-it pick — the job only
 * errors when every provider on the chain has failed.
 */

/**
 * fallbackChain(spec, env) — the ordered list of providers this job will
 * actually try at RUNTIME, starting with pickProvider's answer.
 *
 * pickProvider decides who goes first (and submitMusic/entry.ts charges the
 * run's metering kind from that same answer), but a provider that is
 * *configured* can still *fail* mid-run — e.g. ElevenLabs answering 401
 * because the key lacks the music_generation permission. The chain is
 * capability-aware, same rules as pickProvider:
 *   - Suno is only ever tried for a VOCALS request — it is the vocals-only
 *     path, so an instrumental run must not get a sung song as its
 *     fallback.
 *   - Replicate is last: MusicGen cannot sing, so it is the degraded answer
 *     to a vocals request (reported vocals:false, never passed off as a
 *     song).
 *   - ElevenLabs covers instrumental and vocals alike, so it is the middle
 *     of the chain either way when a key exists.
 */
export function fallbackChain(spec = {}, env = process.env) {
  const primary = pickProvider(spec, env);
  const wantsVocals = spec?.instrumental === false;
  const capable = [];
  if (wantsVocals && (spec?.byok?.sunoApiKey || env.SUNO_API_KEY)) capable.push("suno");
  if (spec?.byok?.elevenLabsKey || env.ELEVENLABS_API_KEY) capable.push("elevenlabs");
  if (spec?.byok?.replicateToken || env.REPLICATE_API_TOKEN) capable.push("replicate");
  return [primary, ...capable.filter((p) => p !== primary)];
}

export async function generateMusicJob(spec, onProgress = () => {}) {
  onProgress(0);

  const runners = {
    suno: generateSunoSongJob,
    elevenlabs: generateWithElevenLabs,
    replicate: generateWithReplicateMusicGen,
  };

  const failures = [];
  for (const provider of fallbackChain(spec)) {
    try {
      return await runners[provider](spec, onProgress);
    } catch (e) {
      failures.push(`${provider}: ${e?.message || e}`);
      console.error(`[music] provider ${provider} failed: ${e?.message || e} — trying the next provider on the chain.`);
      // Reset the bar so the next attempt's own progress ticks start clean.
      onProgress(0);
    }
  }

  throw new Error(`Music generation failed on every available provider — ${failures.join(" | ")}`);
}