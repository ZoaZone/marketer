// dub.js — async AI dubbing jobs for the render worker (ElevenLabs Dubbing
// API), with optional Replicate lip-sync and burned-in captions for video.
//
// Mirrors music.js/video.js's structure: create a job with the provider,
// poll it to completion, download the result, upload to Base44, return the
// persistent URL. ElevenLabs's dubbing job is created via a single
// multipart/form-data POST (no separate "input" object, unlike Replicate)
// and its result is fetched from a dedicated per-language audio endpoint
// rather than an `output` field on the job record itself.
//
// dubAudio() is the simple case: dub and return the resulting file.
// dubVideo() is the same dubbing call, optionally followed by two more
// pipeline stages — lip-sync (re-render the video's mouth movements to
// match the new audio, via Replicate) and caption burn-in (ffmpeg) — which
// is why it needs a local temp directory and ffmpeg, and returns both the
// final video and a captions sidecar URL.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { replicateFetch, isRetryableReplicateError, nextReplicateBackoffDelay, MAX_REPLICATE_RETRY_ATTEMPTS } from "./replicate.js";

const POLL_INTERVAL_MS = 5000;
// Dubbing runs on the long-lived worker process, not inside a gated function
// call, so it can afford to wait.
//
// This was a flat 15 minutes, which is fine for a clip and wrong for the thing
// the product actually sells: ElevenLabs Dubbing on a feature-length film runs
// for hours, so the poll gave up long before the provider finished and a
// perfectly healthy job surfaced to the user as a timeout. The provider job
// kept running and kept billing — the result was simply abandoned.
//
// The ceiling now scales with the source duration when the caller knows it
// (roughly 4x realtime plus generous headroom), and falls back to a flat
// long-form window when it doesn't.
const POLL_TIMEOUT_MS = 15 * 60 * 1000;              // short clips / unknown
const LONG_FORM_POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000; // hard ceiling, 6h
const REALTIME_MULTIPLIER = 4;
const POLL_HEADROOM_MS = 30 * 60 * 1000;

/**
 * Poll ceiling for one dubbing job.
 * @param {number|undefined} sourceSeconds duration of the source media, when known.
 */
function pollTimeoutFor(sourceSeconds) {
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) {
    return LONG_FORM_POLL_TIMEOUT_MS;
  }
  const estimated = sourceSeconds * 1000 * REALTIME_MULTIPLIER + POLL_HEADROOM_MS;
  return Math.min(Math.max(estimated, POLL_TIMEOUT_MS), LONG_FORM_POLL_TIMEOUT_MS);
}

const DEFAULT_LIPSYNC_MODEL = "sync/lipsync-2";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same array-args spawn wrapper as render.js's run() — duplicated rather
// than imported, matching this codebase's existing pattern of each
// server-render module owning its own small set of process/upload helpers.
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function downloadToFile(url, destPath, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, bytes);
  return res.headers.get("content-type") || "";
}

// ── ElevenLabs Dubbing API ──────────────────────────────────────────────

async function createDubbingJob(spec, apiKey) {
  const { sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning, watermark, highestResolution, startTime, endTime } = spec;

  const form = new FormData();
  form.append("source_url", sourceUrl);
  form.append("target_lang", targetLang);
  if (sourceLang) form.append("source_lang", sourceLang);
  if (numSpeakers) form.append("num_speakers", String(numSpeakers));
  if (dropBackgroundAudio) form.append("drop_background_audio", "true");
  if (disableVoiceCloning) form.append("disable_voice_cloning", "true");
  if (watermark) form.append("watermark", "true");
  if (highestResolution) form.append("highest_resolution", "true");
  if (startTime != null) form.append("start_time", String(startTime));
  if (endTime != null) form.append("end_time", String(endTime));

  const res = await fetch("https://api.elevenlabs.io/v1/dubbing", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`ElevenLabs dubbing request failed: ${detail}`);
  }
  const data = await res.json();
  if (!data?.dubbing_id) throw new Error("ElevenLabs did not return a dubbing_id.");
  return data.dubbing_id;
}

async function pollDubbingJob(dubbingId, apiKey, onProgress, progressFloor, progressCeil, sourceSeconds) {
  const startedAt = Date.now();
  const budgetMs = pollTimeoutFor(sourceSeconds);
  const deadline = startedAt + budgetMs;

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for ElevenLabs dubbing to finish after ${Math.round(budgetMs / 60000)} minutes. ` +
        "The provider job may still be running — check before re-submitting, since a re-run bills the source again.",
      );
    }
    await sleep(POLL_INTERVAL_MS);

    const res = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
      throw new Error(`ElevenLabs dubbing status check failed: ${detail}`);
    }
    const data = await res.json();

    if (data?.error) throw new Error(String(data.error));
    if (data?.status === "failed") throw new Error("ElevenLabs dubbing failed.");
    if (data?.status === "dubbed") return;

    // ElevenLabs doesn't expose a real completion percentage — approximate
    // with elapsed-time-over-budget, same technique as video.js's polling.
    // Uses the same duration-aware budget as the deadline above, so the bar on
    // a two-hour film advances realistically instead of pinning at 100% after
    // fifteen minutes and sitting there.
    const elapsedFrac = Math.min(1, (Date.now() - startedAt) / budgetMs);
    onProgress(progressFloor + elapsedFrac * (progressCeil - progressFloor));
  }
}

async function downloadDubbedMediaToFile(dubbingId, targetLang, apiKey, destPath) {
  return downloadToFile(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${targetLang}`, destPath, { "xi-api-key": apiKey });
}

async function fetchDubbingTranscriptSrt(dubbingId, targetLang, apiKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/transcript/${targetLang}?format_type=srt`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Failed to fetch dubbing transcript: ${detail}`);
  }
  return res.text();
}

// ── Caption helpers ──────────────────────────────────────────────────────

function toSrtTimestamp(totalSeconds) {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hh = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const mmm = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

// Builds an .srt from the caller's own {start,end,text} entries (per-scene
// edited captions) — used instead of ElevenLabs's auto-transcript when the
// caller supplies captionOverrides, so burned-in captions reflect the
// user's edits rather than the raw auto-generated transcript.
function buildSrtFromOverrides(entries) {
  return entries
    .map((e, i) => `${i + 1}\n${toSrtTimestamp(e.start)} --> ${toSrtTimestamp(e.end)}\n${e.text}\n`)
    .join("\n");
}

// ffmpeg's subtitles= filter treats the path as a filter-argument string —
// colons and backslashes need escaping so a temp path doesn't get parsed as
// filter option syntax.
function escapeForSubtitlesFilter(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

async function burnCaptionsIntoVideo(videoPath, srtPath, outPath) {
  await run("ffmpeg", [
    "-y", "-i", videoPath,
    "-vf", `subtitles=${escapeForSubtitlesFilter(srtPath)}`,
    "-c:a", "copy",
    outPath,
  ]);
}

// ── Replicate lip-sync ───────────────────────────────────────────────────

async function extractAudioTrack(videoPath, outPath) {
  await run("ffmpeg", ["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", outPath]);
}

// Prefer: wait=60 (Replicate's max synchronous wait window) asks Replicate
// to hold the create-prediction response open and return the prediction
// already in a terminal state when it finishes within that window — for a
// short clip this means resolveLipSyncPrediction below never has to poll
// the status endpoint at all. Prefer: wait conflicts with webhook delivery,
// so when a webhookUrl is given, ask Replicate to POST completion there
// instead and skip the header entirely.
async function createReplicateLipSyncPrediction(model, token, videoUrl, audioUrl, webhookUrl) {
  const body = { input: { video: videoUrl, audio: audioUrl } };
  if (webhookUrl) {
    body.webhook = webhookUrl;
    body.webhook_events_filter = ["completed"];
  }
  try {
    return await replicateFetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      token,
      method: "POST",
      body,
      headers: webhookUrl ? {} : { Prefer: "wait=60" },
    });
  } catch (err) {
    throw new Error(`Replicate lip-sync prediction creation failed (${model}): ${err.message}`);
  }
}

async function pollReplicatePrediction(prediction, token, onProgress, progressFloor, progressCeil) {
  const startedAt = Date.now();
  const deadline = startedAt + POLL_TIMEOUT_MS;
  let current = prediction;
  let retryAttempt = 0;

  while (current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled") {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Replicate lip-sync to finish.");
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
        console.warn(`[dub] Replicate lip-sync poll failed transiently (attempt ${retryAttempt}/${MAX_REPLICATE_RETRY_ATTEMPTS}): ${err.message}`);
        continue;
      }
      throw err;
    }

    const elapsedFrac = Math.min(1, (Date.now() - startedAt) / POLL_TIMEOUT_MS);
    onProgress(progressFloor + elapsedFrac * (progressCeil - progressFloor));
  }

  if (current.status !== "succeeded") {
    const providerMessage = current.error ? String(current.error) : "no further detail from the provider";
    throw new Error(`Replicate lip-sync ${current.status}: ${providerMessage}`);
  }
  return current;
}

// Handles the create-prediction response given Prefer: wait=60: if it's
// already terminal (the common case — lip-sync of a short clip usually
// finishes well within 60s), resolve directly from that response with no
// poll GET at all. Otherwise the job outlasted the wait window and this
// falls back to the hardened poll loop above (which retries transient/HTML
// errors with backoff and prefers the prediction's own urls.get).
async function resolveLipSyncPrediction(prediction, token, onProgress, progressFloor, progressCeil) {
  if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
    if (prediction.status !== "succeeded") {
      const providerMessage = prediction.error ? String(prediction.error) : "no further detail from the provider";
      throw new Error(`Replicate lip-sync ${prediction.status}: ${providerMessage}`);
    }
    onProgress(progressCeil);
    return prediction;
  }
  return pollReplicatePrediction(prediction, token, onProgress, progressFloor, progressCeil);
}

async function runLipSync(originalVideoUrl, dubbedAudioUrl, replicateToken, onProgress, progressFloor, progressCeil) {
  const model = process.env.LIPSYNC_MODEL || DEFAULT_LIPSYNC_MODEL;
  const prediction = await createReplicateLipSyncPrediction(model, replicateToken, originalVideoUrl, dubbedAudioUrl);
  const finished = await resolveLipSyncPrediction(prediction, replicateToken, onProgress, progressFloor, progressCeil);
  const output = finished.output;
  const outputUrl = Array.isArray(output) ? output[0] : output;
  if (!outputUrl || typeof outputUrl !== "string") {
    throw new Error(`Replicate lip-sync (${model}) finished successfully but returned no video URL.`);
  }
  return outputUrl;
}

// ── Base44 upload ────────────────────────────────────────────────────────

// Same BASE44_UPLOAD_URL/BASE44_UPLOAD_TOKEN approach as music.js's/
// video.js's uploadToBase44 — re-uploads a result to Base44 storage so the
// caller gets back a persistent, durable URL. Generic over content
// type/filename since this is reused for the final dubbed media, the
// intermediate extracted-audio track (lip-sync input), and the captions
// .srt sidecar.
async function uploadToBase44(buffer, contentType, filename) {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);

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

function requireDubSpec(spec) {
  const sourceUrl = spec?.sourceUrl;
  if (!sourceUrl) throw new Error("sourceUrl is required.");
  const targetLang = spec?.targetLang;
  if (!targetLang) throw new Error("targetLang is required.");
  return { sourceUrl, targetLang };
}

/**
 * dubAudio(spec, onProgress) — creates an ElevenLabs dubbing job for an
 * audio file from spec = { sourceUrl, targetLang, sourceLang, numSpeakers,
 * dropBackgroundAudio, disableVoiceCloning }, polls it to completion,
 * uploads the dubbed MP3 to Base44, and returns the persistent file_url.
 */
export async function dubAudio(spec, onProgress = () => {}) {
  // BYOK (Work Package F): a user's own ElevenLabs key, forwarded by the
  // submitDubAudio Base44 function, takes priority over the platform key.
  const apiKey = spec?.byok?.elevenLabsKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const { sourceUrl, targetLang } = requireDubSpec(spec);

  onProgress(0);
  const dubbingId = await createDubbingJob({
    sourceUrl,
    targetLang,
    sourceLang: spec?.sourceLang || null,
    numSpeakers: Math.max(0, Number(spec?.numSpeakers) || 0),
    dropBackgroundAudio: !!spec?.dropBackgroundAudio,
    disableVoiceCloning: !!spec?.disableVoiceCloning,
  }, apiKey);
  onProgress(0.05);

  await pollDubbingJob(dubbingId, apiKey, onProgress, 0.05, 0.9, spec?.sourceSeconds);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "dub-audio-"));
  try {
    const destPath = path.join(workDir, "dubbed.mp3");
    const contentType = await downloadDubbedMediaToFile(dubbingId, targetLang, apiKey, destPath);
    const buffer = await fs.readFile(destPath);
    const fileUrl = await uploadToBase44(buffer, contentType || "audio/mpeg", "dubbed-audio.mp3");
    onProgress(1);
    return fileUrl;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * dubVideo(spec, onProgress, webhookHooks) — creates an ElevenLabs dubbing
 * job for a video from spec = { sourceUrl, targetLang, sourceLang,
 * numSpeakers, dropBackgroundAudio, disableVoiceCloning, watermark,
 * highestResolution, startTime, endTime, lipSync, burnCaptions,
 * captionOverrides }, polls it to completion, optionally re-syncs lip
 * movement to the new audio (Replicate) and burns in captions (ffmpeg),
 * uploads the final video (and, if captions were burned in, a .srt
 * sidecar) to Base44, and returns { url, captionsUrl } — captionsUrl is
 * null when burnCaptions wasn't requested.
 *
 * webhookHooks = { webhookUrl, onPending } is supplied by index.js only
 * when PUBLIC_WORKER_URL is configured. When lip-sync is requested and a
 * webhookUrl is available, the Replicate prediction is created with that
 * webhook instead of being polled: this function registers a resolve
 * callback via onPending() (which does the download/caption-burn/upload
 * once Replicate calls back) and returns { pending: true } immediately, so
 * the caller's queue can move on to the next job. With no webhookUrl (the
 * default), behavior is unchanged — lip-sync still resolves synchronously
 * via Prefer: wait / polling.
 */
export async function dubVideo(spec, onProgress = () => {}, webhookHooks = {}) {
  // BYOK (Work Package F): a user's own ElevenLabs key, forwarded by the
  // submitDubVideo Base44 function, takes priority over the platform key.
  const apiKey = spec?.byok?.elevenLabsKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const { sourceUrl, targetLang } = requireDubSpec(spec);

  const lipSync = !!spec?.lipSync;
  const burnCaptions = !!spec?.burnCaptions;
  const captionOverrides = Array.isArray(spec?.captionOverrides) && spec.captionOverrides.length ? spec.captionOverrides : null;

  onProgress(0);
  const dubbingId = await createDubbingJob({
    sourceUrl,
    targetLang,
    sourceLang: spec?.sourceLang || null,
    numSpeakers: Math.max(0, Number(spec?.numSpeakers) || 0),
    dropBackgroundAudio: !!spec?.dropBackgroundAudio,
    disableVoiceCloning: !!spec?.disableVoiceCloning,
    watermark: !!spec?.watermark,
    highestResolution: !!spec?.highestResolution,
    startTime: spec?.startTime != null ? Number(spec.startTime) : null,
    endTime: spec?.endTime != null ? Number(spec.endTime) : null,
  }, apiKey);

  // Progress budget: dubbing itself is the bulk of the wait; lip-sync and
  // caption burn-in each get a slice only when actually requested, so a
  // plain dub (no options) still reaches 1 without stalling on unused
  // stages.
  const dubCeil = lipSync ? 0.55 : (burnCaptions ? 0.7 : 0.9);
  await pollDubbingJob(dubbingId, apiKey, onProgress, 0.05, dubCeil, spec?.sourceSeconds);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "dub-video-"));
  // Set to false right before handing the job off to a webhook — from that
  // point on, the resolve callback registered below owns workDir and is
  // responsible for removing it (on success, failure, or the safety
  // timeout), since it runs long after this function has already returned.
  let ownsWorkDir = true;
  try {
    let videoPath = path.join(workDir, "dubbed.mp4");
    await downloadDubbedMediaToFile(dubbingId, targetLang, apiKey, videoPath);

    if (lipSync) {
      // BYOK (Work Package F): a user's own Replicate token takes priority
      // over the platform token for the lip-sync step too.
      const replicateToken = spec?.byok?.replicateToken || process.env.REPLICATE_API_TOKEN;
      if (!replicateToken) throw new Error("REPLICATE_API_TOKEN is not configured (required for lip-sync).");

      // Replicate needs a URL it can fetch, not a local file — extract the
      // just-dubbed audio track and upload it to Base44 to get one, purely
      // as an intermediate step (this URL is never returned to the caller).
      const dubbedAudioPath = path.join(workDir, "dubbed-audio.mp3");
      await extractAudioTrack(videoPath, dubbedAudioPath);
      const dubbedAudioBuffer = await fs.readFile(dubbedAudioPath);
      const dubbedAudioUrl = await uploadToBase44(dubbedAudioBuffer, "audio/mpeg", "dubbed-audio-for-lipsync.mp3");

      if (webhookHooks.webhookUrl) {
        const model = process.env.LIPSYNC_MODEL || DEFAULT_LIPSYNC_MODEL;
        await createReplicateLipSyncPrediction(model, replicateToken, sourceUrl, dubbedAudioUrl, webhookHooks.webhookUrl);

        ownsWorkDir = false;
        webhookHooks.onPending(async (predictionBody) => {
          try {
            if (predictionBody.status !== "succeeded") {
              const providerMessage = predictionBody.error ? String(predictionBody.error) : "no further detail from the provider";
              throw new Error(`Replicate lip-sync ${predictionBody.status}: ${providerMessage}`);
            }
            const output = predictionBody.output;
            const lipSyncedUrl = Array.isArray(output) ? output[0] : output;
            if (!lipSyncedUrl || typeof lipSyncedUrl !== "string") {
              throw new Error(`Replicate lip-sync (${model}) finished successfully but returned no video URL.`);
            }

            const lipSyncedPath = path.join(workDir, "lipsynced.mp4");
            await downloadToFile(lipSyncedUrl, lipSyncedPath);
            let finalVideoPath = lipSyncedPath;

            let webhookCaptionsUrl = null;
            if (burnCaptions) {
              const srtText = captionOverrides ? buildSrtFromOverrides(captionOverrides) : await fetchDubbingTranscriptSrt(dubbingId, targetLang, apiKey);
              const srtPath = path.join(workDir, "captions.srt");
              await fs.writeFile(srtPath, srtText, "utf8");

              const captionedPath = path.join(workDir, "captioned.mp4");
              await burnCaptionsIntoVideo(finalVideoPath, srtPath, captionedPath);
              finalVideoPath = captionedPath;

              webhookCaptionsUrl = await uploadToBase44(Buffer.from(srtText, "utf8"), "text/plain", "dubbed-captions.srt");
            }

            const finalBuffer = await fs.readFile(finalVideoPath);
            const url = await uploadToBase44(finalBuffer, "video/mp4", "dubbed-video.mp4");
            return { url, captionsUrl: webhookCaptionsUrl };
          } finally {
            await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
          }
        });

        return { pending: true };
      }

      const lipSyncedUrl = await runLipSync(sourceUrl, dubbedAudioUrl, replicateToken, onProgress, dubCeil, burnCaptions ? 0.7 : 0.9);

      const lipSyncedPath = path.join(workDir, "lipsynced.mp4");
      await downloadToFile(lipSyncedUrl, lipSyncedPath);
      videoPath = lipSyncedPath;
    }

    let captionsUrl = null;
    if (burnCaptions) {
      const srtText = captionOverrides ? buildSrtFromOverrides(captionOverrides) : await fetchDubbingTranscriptSrt(dubbingId, targetLang, apiKey);
      const srtPath = path.join(workDir, "captions.srt");
      await fs.writeFile(srtPath, srtText, "utf8");

      const captionedPath = path.join(workDir, "captioned.mp4");
      await burnCaptionsIntoVideo(videoPath, srtPath, captionedPath);
      videoPath = captionedPath;
      onProgress(0.9);

      captionsUrl = await uploadToBase44(Buffer.from(srtText, "utf8"), "text/plain", "dubbed-captions.srt");
    }

    const finalBuffer = await fs.readFile(videoPath);
    const url = await uploadToBase44(finalBuffer, "video/mp4", "dubbed-video.mp4");
    onProgress(1);
    return { url, captionsUrl };
  } finally {
    if (ownsWorkDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
