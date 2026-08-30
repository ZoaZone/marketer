// index.js — Express job API for the render worker.
//
// Full-film renders (Lane 2/Movie Maker), Lane 1 short-video assembly, AI
// music generation, per-scene AI video generation, and AI dubbing (audio or
// video, the latter with optional lip-sync/captions) are all long-running
// (real FFmpeg/Replicate/ElevenLabs jobs, not a quick request/response), so
// this is an async job API: POST /render, POST /lane1-video, POST /music,
// POST /video, POST /dub-audio, or POST /dub-video enqueues and returns a
// job id immediately, and the caller polls GET /jobs/:id for
// status/progress/url(/captionsUrl). All job kinds share the same
// in-memory job store and single-item queue (processQueue branches on
// kind) — only one job, of any kind, runs at a time.
//
// When PUBLIC_WORKER_URL is configured, dub-video's lip-sync step (the
// slowest, most poll-flaky leg) is completed via a Replicate webhook
// instead of polling — see buildWebhookHooks/POST /replicate-webhook below.
// Without it, everything falls back to the polling behavior this worker
// has always used, so nothing breaks in environments without a public URL.

import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { randomUUID } from "node:crypto";
import { renderProject, hasSceneVisual, estimateProjectDurationSeconds, MAX_SCENES, MAX_TOTAL_DURATION_SECONDS } from "./render.js";
import { generateMusicJob } from "./music.js";
import { generateSceneVideo } from "./video.js";
import { dubAudio, dubVideo } from "./dub.js";
import { verifyReplicateWebhookSignature } from "./replicate.js";
import { assembleLane1Video } from "./lane1.js";

const PORT = process.env.PORT || 8080;
const RENDER_SHARED_SECRET = process.env.RENDER_SHARED_SECRET;
const PUBLIC_WORKER_URL = process.env.PUBLIC_WORKER_URL?.replace(/\/+$/, "");
const REPLICATE_WEBHOOK_SIGNING_SECRET = process.env.REPLICATE_WEBHOOK_SIGNING_SECRET;

// A render worker with no shared secret would be an unauthenticated public
// endpoint that triggers arbitrary FFmpeg jobs (and arbitrary outbound
// fetches to whatever imageUrl/voiceUrl/musicUrl it's given) — refuse to
// start rather than come up wide open.
if (!RENDER_SHARED_SECRET) {
  console.error("RENDER_SHARED_SECRET is not configured — refusing to start.");
  process.exit(1);
}

const app = express();
app.use(cors());
// verify() stashes the raw request body bytes on req.rawBody — needed to
// check Replicate's webhook signature, which is computed over the exact
// bytes sent, not a re-serialized JSON.parse'd version. Harmless for every
// other route (nothing else reads req.rawBody).
app.use(express.json({ limit: "10mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));

function requireSecret(req, res, next) {
  if (req.header("x-render-secret") !== RENDER_SHARED_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// In-memory job store + single-item queue. Fine at low volume since this
// worker only ever runs one job at a time anyway; swap this Map + array for
// Railway Redis when volume grows — the API (jobs.get/set, enqueue) stays
// identical either way.
const jobs = new Map();
const queue = [];
let processing = false;

// Job-record retention. This used to be a flat one hour, which quietly capped
// how long a job could exist at all: dubbing a feature-length film runs well
// past 60 minutes, so the record was deleted while the job was still running
// and GET /jobs/:id began answering 404 for work still in flight — which the
// client reads as a failed dub. Long-form kinds now get a retention window
// sized to a realistic worst case; short kinds keep the original hour.
const ONE_HOUR_MS = 60 * 60 * 1000;
const LONG_FORM_RETENTION_MS = 8 * ONE_HOUR_MS;
const LONG_FORM_KINDS = new Set(["dub-video", "dub-audio", "render"]);

function retentionFor(id) {
  const job = jobs.get(id);
  return job && LONG_FORM_KINDS.has(job.kind) ? LONG_FORM_RETENTION_MS : ONE_HOUR_MS;
}

function scheduleCleanup(id) {
  setTimeout(() => jobs.delete(id), retentionFor(id)).unref();
}

// KNOWN LIMITATION, left visible on purpose: `jobs` is still an in-memory Map,
// so a worker restart or redeploy loses every in-flight job no matter what the
// retention above says. For commercial dubbing runs measured in hours, moving
// `jobs` to Railway Redis is the next step — the get/set API stays identical,
// which is why the store was written this way in the first place.

// jobToken -> { jobId, resolve, timeoutHandle }. Populated by
// buildWebhookHooks() when a job hands its completion off to a Replicate
// webhook instead of polling; consumed by POST /replicate-webhook/:jobToken
// below. The token (not the jobId) is the unguessable part of the webhook
// URL, so it doubles as that route's auth.
const webhookPending = new Map();
// Was a flat 15 minutes. Replicate lip-sync over a feature-length film runs
// far past that, and the timer fired mid-job and marked healthy work "error".
// Long-form kinds get a window sized to the job instead.
const WEBHOOK_TIMEOUT_MS = 15 * 60 * 1000;
const LONG_FORM_WEBHOOK_TIMEOUT_MS = 6 * ONE_HOUR_MS;

function registerWebhookPending(token, jobId, resolve) {
  const pendingJob = jobs.get(jobId);
  const timeoutMs = pendingJob && LONG_FORM_KINDS.has(pendingJob.kind)
    ? LONG_FORM_WEBHOOK_TIMEOUT_MS
    : WEBHOOK_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => {
    if (!webhookPending.delete(token)) return; // already resolved by the webhook
    const job = jobs.get(jobId);
    if (job && job.status === "processing") {
      job.status = "error";
      job.error = "Timed out waiting for the Replicate webhook.";
    }
    scheduleCleanup(jobId);
  }, timeoutMs);
  timeoutHandle.unref();
  webhookPending.set(token, { jobId, resolve, timeoutHandle });
}

// Returns {} (no-op) when PUBLIC_WORKER_URL isn't configured, so callers
// (dub.js/video.js) fall straight back to their normal polling path — the
// only thing that makes a job kind's webhook branch activate at all is
// this object actually carrying a webhookUrl.
function buildWebhookHooks(jobId) {
  if (!PUBLIC_WORKER_URL) return {};
  const token = randomUUID();
  return {
    webhookUrl: `${PUBLIC_WORKER_URL}/replicate-webhook/${token}`,
    onPending: (resolve) => registerWebhookPending(token, jobId, resolve),
  };
}

async function processQueue() {
  if (processing) return;
  const next = queue.shift();
  if (!next) return;

  processing = true;
  const job = jobs.get(next.id);
  job.status = "processing";

  try {
    // Most job kinds report progress as a bare 0-1 fraction; renderProject
    // additionally reports which scene is currently rendering (see
    // render.js), so this accepts either shape without changing behavior
    // for music/video/dub/lane1 jobs.
    const onProgress = (update) => {
      if (typeof update === "number") {
        job.progress = update;
        return;
      }
      if (update && typeof update === "object") {
        if (typeof update.fraction === "number") job.progress = update.fraction;
        if (typeof update.sceneIndex === "number") job.sceneIndex = update.sceneIndex;
        if (typeof update.sceneTotal === "number") job.sceneTotal = update.sceneTotal;
      }
    };
    let result;
    if (next.kind === "music") {
      result = await generateMusicJob(next.spec, onProgress);
    } else if (next.kind === "video") {
      result = await generateSceneVideo(next.payload, onProgress);
    } else if (next.kind === "dubAudio") {
      result = await dubAudio(next.payload, onProgress);
    } else if (next.kind === "dubVideo") {
      result = await dubVideo(next.payload, onProgress, buildWebhookHooks(next.id));
    } else if (next.kind === "lane1Video") {
      result = await assembleLane1Video(next.project, onProgress);
    } else {
      result = await renderProject(next.project, onProgress);
    }

    if (result?.pending) {
      // A Replicate webhook will finalize this job later (see
      // POST /replicate-webhook/:jobToken) — leave status "processing" and
      // skip cleanup scheduling; the webhook handler (or its safety
      // timeout) does both once the job actually finishes.
    } else {
      job.status = "done";
      job.progress = 1;
      // Most job kinds resolve to a plain URL string; dubVideo resolves to
      // { url, captionsUrl } since it may also produce a captions sidecar.
      if (result && typeof result === "object") {
        job.url = result.url;
        job.captionsUrl = result.captionsUrl ?? null;
      } else {
        job.url = result;
      }
      scheduleCleanup(next.id);
    }
  } catch (e) {
    job.status = "error";
    job.error = String(e?.message || e);
    scheduleCleanup(next.id);
  } finally {
    processing = false;
    processQueue(); // pick up the next queued job, if any — a pending
    // webhook job releases this immediately rather than blocking on it.
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/render", requireSecret, (req, res) => {
  const project = req.body || {};
  // Same "has any visual" rule render.js's renderProject enforces
  // internally (see hasSceneVisual there) — checked here too so a bad
  // payload gets an immediate 400 instead of silently occupying the queue
  // until the async job fails.
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const valid = scenes.length > 0 && scenes.every((s) => hasSceneVisual(s));
  if (!valid) {
    return res.status(400).json({ error: "Each scene must have a visual (image, video, or at least one clip)." });
  }
  // Same limits renderProject enforces internally — checked here too so an
  // over-limit project gets an immediate 400 instead of occupying the queue
  // (and burning render time) before the async job rejects it.
  if (scenes.length > MAX_SCENES) {
    return res.status(400).json({ error: `Project has ${scenes.length} scenes, which exceeds the ${MAX_SCENES}-scene limit.` });
  }
  const estimatedSeconds = estimateProjectDurationSeconds(project);
  if (estimatedSeconds > MAX_TOTAL_DURATION_SECONDS) {
    return res.status(400).json({ error: `Project's estimated duration (${Math.round(estimatedSeconds)}s) exceeds the ${MAX_TOTAL_DURATION_SECONDS}s limit.` });
  }

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    sceneIndex: null,
    sceneTotal: scenes.length,
    url: null,
    captionsUrl: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "render", project });

  res.status(202).json({ jobId: id });
  processQueue();
});

// Lane 1 (Base44-native short video — Quick Create, Campaign Studio, Demo
// Video Maker): a simpler sibling of /render — no title card, no per-scene
// voice/AI-video-clip branching, one whole-short voiceover/music track
// instead — see lane1.js. Still no Replicate involved; this is purely the
// FFmpeg finishing step Lane 1 never had (it used to render client-side to
// WebM via Canvas+MediaRecorder).
app.post("/lane1-video", requireSecret, (req, res) => {
  const project = req.body || {};
  const hasScene = Array.isArray(project.scenes) && project.scenes.some((s) => s && typeof s.imageUrl === "string" && s.imageUrl.trim());
  if (!hasScene) {
    return res.status(400).json({ error: "project.scenes must include at least one scene with an imageUrl" });
  }

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    url: null,
    captionsUrl: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "lane1Video", project });

  res.status(202).json({ jobId: id });
  processQueue();
});

app.post("/music", requireSecret, (req, res) => {
  const spec = req.body || {};
  const hasPrompt = [spec.prompt, spec.genre, spec.mood].some((v) => typeof v === "string" && v.trim());
  if (!hasPrompt) {
    return res.status(400).json({ error: "prompt (or genre/mood) is required" });
  }

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    url: null,
    captionsUrl: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "music", spec });

  res.status(202).json({ jobId: id });
  processQueue();
});

app.post("/video", requireSecret, (req, res) => {
  const payload = req.body || {};
  if (!(typeof payload.prompt === "string" && payload.prompt.trim()) && !(typeof payload.imageUrl === "string" && payload.imageUrl.trim())) {
    return res.status(400).json({ error: "prompt or imageUrl is required" });
  }

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    url: null,
    captionsUrl: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "video", payload });

  res.status(202).json({ jobId: id });
  processQueue();
});

function requireDubFields(req, res) {
  const payload = req.body || {};
  if (!(typeof payload.sourceUrl === "string" && payload.sourceUrl.trim()) || !(typeof payload.targetLang === "string" && payload.targetLang.trim())) {
    res.status(400).json({ error: "sourceUrl and targetLang are required" });
    return null;
  }
  return payload;
}

app.post("/dub-audio", requireSecret, (req, res) => {
  const payload = requireDubFields(req, res);
  if (!payload) return;

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    url: null,
    captionsUrl: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "dubAudio", payload });

  res.status(202).json({ jobId: id });
  processQueue();
});

app.post("/dub-video", requireSecret, (req, res) => {
  const payload = requireDubFields(req, res);
  if (!payload) return;

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    url: null,
    captionsUrl: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "dubVideo", payload });

  res.status(202).json({ jobId: id });
  processQueue();
});

// Replicate calls this back directly, so it can't send x-render-secret —
// the unguessable :jobToken in the path (paired with an optional signature
// check below) is this route's auth instead. Only reachable at all when
// PUBLIC_WORKER_URL was configured at job-creation time (see
// buildWebhookHooks); an unknown/expired token is the normal case for a
// worker that never enabled webhooks, a replayed request, or a job that
// already resolved via its safety timeout.
app.post("/replicate-webhook/:jobToken", (req, res) => {
  if (REPLICATE_WEBHOOK_SIGNING_SECRET && !verifyReplicateWebhookSignature(req, REPLICATE_WEBHOOK_SIGNING_SECRET)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const pending = webhookPending.get(req.params.jobToken);
  if (!pending) {
    return res.status(404).json({ error: "Unknown or already-resolved job token" });
  }

  const body = req.body || {};
  if (body.status !== "succeeded" && body.status !== "failed" && body.status !== "canceled") {
    // Not a terminal update — webhook_events_filter is set to ["completed"]
    // on the create call, so Replicate shouldn't send these, but ignore
    // anything else defensively rather than resolving early.
    return res.status(200).json({ ok: true, ignored: true });
  }

  webhookPending.delete(req.params.jobToken);
  clearTimeout(pending.timeoutHandle);

  // Acknowledge immediately — the actual post-processing (download,
  // optional caption burn-in, upload) can take a while, and Replicate
  // shouldn't be kept waiting or retry a slow-but-successful delivery.
  res.status(200).json({ ok: true });

  (async () => {
    const job = jobs.get(pending.jobId);
    try {
      const result = await pending.resolve(body);
      if (job) {
        job.status = "done";
        job.progress = 1;
        job.url = result.url;
        job.captionsUrl = result.captionsUrl ?? null;
      }
    } catch (e) {
      if (job) {
        job.status = "error";
        job.error = String(e?.message || e);
      }
    } finally {
      scheduleCleanup(pending.jobId);
    }
  })();
});

// Shared across all job kinds — the job record shape is identical either
// way ({ id, status, progress, url, captionsUrl, error, createdAt }).
app.get("/jobs/:id", requireSecret, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  // percent is derived from progress, not stored separately, so it can
  // never drift out of sync. sceneIndex/sceneTotal stay absent on the job
  // record (and so omitted from this response) for non-render job kinds,
  // which never call onProgress with the object shape that sets them.
  const percent = typeof job.progress === "number" ? Math.round(job.progress * 100) : undefined;
  res.json({ ...job, percent });
});

app.listen(PORT, () => {
  console.log(`studio-render-worker listening on :${PORT}`);
});
