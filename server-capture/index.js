// index.js — Express job API for the capture worker.
//
// Mirrors server-render/index.js's shape: an in-memory job store + a
// single-item queue (one capture at a time — headless Chromium + video
// recording is heavy enough that this worker doesn't try to run more than
// one job concurrently), POST enqueues and returns a job id immediately,
// and the caller polls GET for status/progress/videoUrl.
//
// Two job kinds share this queue: "capture" (POST /capture — an arbitrary
// caller-supplied url) and "appDemo" (POST /app-demo — the fixed, scripted
// digitalstudios.app walkthrough in capture.js). Both share the same rate
// limiting, concurrency cap, and credential encryption; only which
// capture.js function processQueue calls differs.

import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { runCapture, runAppDemoWalkthrough, redactUrl, launchLiveSession, captureLiveFrame, sendLiveInput, closeLiveSession, runLiveHandoffCapture } from "./capture.js";
import { encryptCredentials, decryptCredentials, zeroCredentials, credentialEncryptionAvailable } from "./credentials.js";

const PORT = process.env.PORT || 8080;
const CAPTURE_SHARED_SECRET = process.env.CAPTURE_SHARED_SECRET;
const RATE_LIMIT_PER_MINUTE = Number(process.env.CAPTURE_RATE_LIMIT_PER_MINUTE) || 5;
const MAX_CONCURRENT_PER_USER = Number(process.env.CAPTURE_MAX_CONCURRENT_PER_USER) || 1;
// Fallback target when a /capture request omits url — real callers
// (Movie Maker's "Auto Demo from URL") always send an explicit url, so
// this only matters for a bare health-check-style call.
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || "https://digitalstudios.app";
// Phase 3 (live login capture): how long a caller may keep an interactive
// live session open before it's force-closed and its concurrency slot
// freed, in case the tab is abandoned mid-login. Generous enough for a real
// login flow (password manager, 2FA code, SSO redirect) without holding a
// headless Chromium instance open indefinitely on this worker's single-job
// queue.
const LIVE_SESSION_MAX_MS = (Number(process.env.CAPTURE_LIVE_SESSION_MAX_SECONDS) || 360) * 1000;

// An unauthenticated capture worker would let anyone point a headless
// browser at arbitrary URLs through this service — refuse to start rather
// than come up wide open, same posture as server-render's RENDER_SHARED_SECRET.
if (!CAPTURE_SHARED_SECRET) {
  console.error("CAPTURE_SHARED_SECRET is not configured — refusing to start.");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function requireSecret(req, res, next) {
  if (req.header("x-capture-secret") !== CAPTURE_SHARED_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const jobs = new Map();
const queue = [];
let processing = false;

const ONE_HOUR_MS = 60 * 60 * 1000;
function scheduleCleanup(id) {
  setTimeout(() => jobs.delete(id), ONE_HOUR_MS).unref();
}

// Per-user rate limit (requests/minute) and concurrency cap (queued +
// processing jobs at once), keyed by the Base44 user id the submitCapture
// proxy forwards as body.userId. Applies to every capture, authenticated
// or not — simple in-memory bookkeeping, same operational model as the job
// store itself (resets on restart, doesn't share state across multiple
// worker instances; upgrade both together if this worker is ever scaled
// horizontally).
const rateLimitLog = new Map(); // userId -> timestamps[]
const activeJobsByUser = new Map(); // userId -> count

function checkRateLimit(userId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (rateLimitLog.get(userId) || []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_PER_MINUTE) {
    rateLimitLog.set(userId, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitLog.set(userId, timestamps);
  return true;
}

function claimConcurrencySlot(userId) {
  const current = activeJobsByUser.get(userId) || 0;
  if (current >= MAX_CONCURRENT_PER_USER) return false;
  activeJobsByUser.set(userId, current + 1);
  return true;
}

function releaseConcurrencySlot(userId) {
  const current = activeJobsByUser.get(userId) || 0;
  activeJobsByUser.set(userId, Math.max(0, current - 1));
}

async function processQueue() {
  if (processing) return;
  const next = queue.shift();
  if (!next) return;

  processing = true;
  const job = jobs.get(next.id);
  job.status = "processing";

  // Decrypted here, immediately before the one call that needs it, and
  // zeroed/discarded in the finally block below regardless of outcome —
  // never held any longer than the single runCapture() call requires.
  let credentials = null;
  let authToken = null;
  try {
    if (job.encryptedCredentials) {
      credentials = decryptCredentials(job.encryptedCredentials);
    }
    if (job.encryptedAuthToken) {
      authToken = decryptCredentials(job.encryptedAuthToken).token || null;
    }

    const onProgress = (update) => {
      if (!update || typeof update !== "object") return;
      if (typeof update.fraction === "number") job.progress = update.fraction;
      if (typeof update.stepIndex === "number") job.stepIndex = update.stepIndex;
      if (typeof update.stepTotal === "number") job.stepTotal = update.stepTotal;
    };

    const result = next.kind === "appDemo"
      ? await runAppDemoWalkthrough(onProgress, TARGET_BASE_URL, credentials, authToken)
      : next.kind === "liveHandoff"
        ? await runLiveHandoffCapture(next.spec, onProgress)
        : await runCapture(next.spec, onProgress, credentials, authToken);

    if (result.status === "login_required") {
      job.status = "login_required";
      job.error = next.kind === "liveHandoff"
        ? "The logged-in session couldn't be carried over — it may have expired. Please try the live login again."
        : "This page requires a login and can't be captured yet — Phase 1 only supports public pages.";
    } else if (result.status === "login_failed") {
      // Deliberately generic — never echoes which field failed or any
      // credential value, per the "return a generic login failed" rule.
      job.status = "login_failed";
      job.error = "Login failed. The target site may use email-OTP or magic-link auth (no password login). If this is your own Base44 app, try 'Use my current session' instead of entering credentials.";
    } else {
      job.status = "done";
      job.progress = 1;
      job.videoUrl = result.videoUrl;
      job.durationSeconds = result.durationSeconds;
      job.pageInfo = result.pageInfo ?? null;
      job.steps = result.steps ?? null;
    }
    scheduleCleanup(next.id);
  } catch (e) {
    job.status = "error";
    job.error = String(e?.message || e);
    scheduleCleanup(next.id);
  } finally {
    if (credentials) zeroCredentials(credentials);
    credentials = null;
    if (authToken) authToken = null;
    // Consumed exactly once — even if this job is somehow retried, it can
    // never be decrypted again after this point.
    job.encryptedCredentials = null;
    delete job.encryptedCredentials;
    job.encryptedAuthToken = null;
    delete job.encryptedAuthToken;
    releaseConcurrencySlot(job.userId || "anonymous");
    processing = false;
    processQueue();
  }
}

// ---------------------------------------------------------------------------
// Phase 3: live login capture. liveSessions holds the in-progress
// interactive browser sessions a caller is actively driving (via /live/*).
// Keyed by sessionId (nanoid, used only to address the session — never
// logged, never the thing that actually authorizes access to it); each
// entry also carries its own random `token`, which is the one real
// capability secret a caller must present to read frames from or send
// input to that session (so the public, cors()-open /live/:id/frame and
// /live/:id/input routes don't need the main CAPTURE_SHARED_SECRET — the
// frontend calls those directly from the browser, and the shared secret
// must never reach a browser). /live/start and /live/:id/finish still
// require CAPTURE_SHARED_SECRET, same as every other route — those are
// only ever called server-to-server, from the Base44 proxy functions.
const liveSessions = new Map();

function closeAndForgetLiveSession(id) {
  const session = liveSessions.get(id);
  if (!session) return;
  clearTimeout(session.expiryTimer);
  liveSessions.delete(id);
  releaseConcurrencySlot(session.userId || "anonymous");
  closeLiveSession(session).catch(() => { });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/live/start", requireSecret, async (req, res) => {
  const body = req.body || {};
  const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "anonymous";
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : "";

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ error: "url must be http(s)." });
    }
  } catch {
    return res.status(400).json({ error: "url must be a valid absolute URL." });
  }

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
  }
  // A live session occupies the same per-user concurrency slot a normal
  // capture would — it's the same one-job-at-a-time budget, just spent on
  // an interactive session instead of a queued job until /finish hands it
  // over to the real queue.
  if (!claimConcurrencySlot(userId)) {
    return res.status(429).json({ error: "You already have a capture or live session in progress. Please wait for it to finish." });
  }

  let session;
  try {
    session = await launchLiveSession(url);
  } catch (e) {
    releaseConcurrencySlot(userId);
    return res.status(502).json({ error: "Could not start a live session: " + String(e?.message || e) });
  }

  const id = nanoid();
  const token = nanoid(32);
  session.id = id;
  session.token = token;
  session.userId = userId;
  session.createdAt = Date.now();
  session.expiryTimer = setTimeout(() => {
    console.log(`[live] session ${id} timed out — closing.`);
    closeAndForgetLiveSession(id);
  }, LIVE_SESSION_MAX_MS).unref();
  liveSessions.set(id, session);

  console.log(`[live] started session ${id} for ${redactUrl(session.targetUrl)}`);
  res.status(201).json({ sessionId: id, token, expiresInSeconds: Math.round(LIVE_SESSION_MAX_MS / 1000) });
});

function requireLiveToken(req, res) {
  const session = liveSessions.get(req.params.id);
  if (!session) { res.status(404).json({ error: "Live session not found or already closed." }); return null; }
  const token = req.query.token || req.body?.token || req.header("x-live-token");
  if (!token || token !== session.token) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return session;
}

app.get("/live/:id/frame", async (req, res) => {
  const session = requireLiveToken(req, res);
  if (!session) return;
  try {
    const jpeg = await captureLiveFrame(session.page);
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.send(jpeg);
  } catch (e) {
    res.status(502).json({ error: "Could not capture a frame: " + String(e?.message || e) });
  }
});

// Body already parsed by the global express.json() middleware registered
// above — no extra body parser needed here.
app.post("/live/:id/input", async (req, res) => {
  const session = requireLiveToken(req, res);
  if (!session) return;
  try {
    const result = await sendLiveInput(session.page, req.body || {});
    res.json({ ok: true, url: result.url });
  } catch (e) {
    res.status(502).json({ error: "Input failed: " + String(e?.message || e) });
  }
});

app.post("/live/:id/cancel", async (req, res) => {
  const id = req.params.id;
  const session = liveSessions.get(id);
  if (!session) return res.json({ ok: true }); // already gone — cancelling twice is fine
  const secretOk = req.header("x-capture-secret") === CAPTURE_SHARED_SECRET;
  const token = req.query.token || req.body?.token || req.header("x-live-token");
  if (!secretOk && token !== session.token) return res.status(401).json({ error: "Unauthorized" });
  closeAndForgetLiveSession(id);
  res.json({ ok: true });
});

// POST /live/:id/finish — server-to-server only (Base44's finishLiveCapture
// proxy). Ends the interactive phase, exports the now-authenticated
// session's storageState (cookies + localStorage — never a password, since
// none was ever collected in this flow), closes the live browser, and
// queues a "liveHandoff" job on the SAME job store/queue/polling contract
// every other capture uses — the frontend's existing getCaptureStatus
// polling loop works against the returned captureId completely unchanged.
app.post("/live/:id/finish", requireSecret, async (req, res) => {
  const id = req.params.id;
  const session = liveSessions.get(id);
  if (!session) return res.status(404).json({ error: "Live session not found or already closed." });
  const body = req.body || {};
  const token = body.token;
  if (!token || token !== session.token) return res.status(401).json({ error: "Unauthorized" });

  clearTimeout(session.expiryTimer);
  liveSessions.delete(id);

  let storageState = null;
  try {
    storageState = await session.context.storageState();
  } catch (e) {
    releaseConcurrencySlot(session.userId || "anonymous");
    closeLiveSession(session).catch(() => { });
    return res.status(502).json({ error: "Could not finish the live session: " + String(e?.message || e) });
  }
  await closeLiveSession(session).catch(() => { });

  let plan;
  if (body.plan !== undefined) {
    if (!Array.isArray(body.plan) || !body.plan.length) {
      releaseConcurrencySlot(session.userId || "anonymous");
      return res.status(400).json({ error: "plan, if provided, must be a non-empty array of steps." });
    }
    plan = body.plan;
  }

  const jobId = nanoid();
  jobs.set(jobId, {
    id: jobId,
    status: "queued",
    progress: 0,
    stepIndex: null,
    stepTotal: null,
    videoUrl: null,
    durationSeconds: null,
    pageInfo: null,
    steps: null,
    hasCredentials: false,
    hasAuthToken: false,
    userId: session.userId || "anonymous",
    error: null,
    createdAt: Date.now(),
  });
  // Reuses the concurrency slot the live session already held — this is
  // one continuous job from the caller's point of view (interactive login,
  // then the recorded walkthrough), not two separate ones, so it isn't
  // released and re-claimed here.
  queue.push({ id: jobId, kind: "liveHandoff", spec: { url: session.targetUrl, storageState, plan } });

  console.log(`[live] session ${id} handed off to capture job ${jobId} for ${redactUrl(session.targetUrl)}`);
  res.status(202).json({ captureId: jobId });
  processQueue();
});

app.post("/capture", requireSecret, (req, res) => {
  const body = req.body || {};
  const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "anonymous";

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: "Too many capture requests. Please wait a moment and try again." });
  }

  const url = (typeof body.url === "string" && body.url.trim()) || TARGET_BASE_URL;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ error: "url must be http(s)." });
    }
  } catch {
    return res.status(400).json({ error: "url must be a valid absolute URL." });
  }

  let plan;
  if (body.plan !== undefined) {
    if (!Array.isArray(body.plan) || !body.plan.length) {
      return res.status(400).json({ error: "plan, if provided, must be a non-empty array of steps." });
    }
    plan = body.plan;
  }

// Checked before touching credentials at all — no point encrypting
  // something we're about to reject anyway.
  if (!claimConcurrencySlot(userId)) {
    return res.status(429).json({ error: "You already have a capture in progress. Please wait for it to finish." });
  }

  // Encrypted the instant it arrives — body.credentials (plaintext) is
  // never referenced again after this block, never stored on the job
  // record, and never logged (the log line below only ever mentions the
  // url and whether credentials were present, nothing from inside them).
  let encryptedCredentials = null;
  if (body.credentials !== undefined) {
    if (!body.credentials || typeof body.credentials !== "object" || !body.credentials.password) {
      releaseConcurrencySlot(userId);
      return res.status(400).json({ error: "credentials, if provided, must be an object with at least a password." });
    }
    if (!credentialEncryptionAvailable()) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
    try {
      encryptedCredentials = encryptCredentials(body.credentials);
    } catch (_e) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
  }

  let encryptedAuthToken = null;
  if (body.authToken) {
    if (!credentialEncryptionAvailable()) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
    try {
      encryptedAuthToken = encryptCredentials({ token: body.authToken });
    } catch (_e) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
  }

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    stepIndex: null,
    stepTotal: null,
    videoUrl: null,
    durationSeconds: null,
    pageInfo: null,
    steps: null,
    hasCredentials: !!encryptedCredentials,
    encryptedCredentials,
    hasAuthToken: !!encryptedAuthToken,
    encryptedAuthToken,
    userId,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "capture", spec: { url, plan } });

  console.log(`[capture] queued job ${id} for ${redactUrl(url)}${encryptedCredentials ? " (authenticated)" : encryptedAuthToken ? " (session-token)" : ""}`);
  res.status(202).json({ captureId: id });
  processQueue();
});

// POST /app-demo — records the fixed, scripted digitalstudios.app
// walkthrough (see capture.js's DIGITAL_STUDIOS_DEMO_STEPS) instead of an
// arbitrary caller-supplied url. Public-only by default; set
// `authenticated: true` with `credentials` to instead tour the logged-in
// tools (DIGITAL_STUDIOS_AUTHENTICATED_DEMO_STEPS) — the two are never
// combined in one recording (see runAppDemoWalkthrough's doc comment).
// Shares the same job store, rate limit, concurrency cap, and credential
// encryption as /capture — this is deliberately not a separate code path
// for any of that, only for which capture.js function actually runs.
app.post("/app-demo", requireSecret, (req, res) => {
  const body = req.body || {};
  const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "anonymous";
  const authenticated = body.authenticated === true;

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: "Too many capture requests. Please wait a moment and try again." });
  }

  if (!claimConcurrencySlot(userId)) {
    return res.status(429).json({ error: "You already have a capture in progress. Please wait for it to finish." });
  }

  // Credentials are REQUIRED when authenticated: true — there's nothing
  // to log into otherwise, and the public tour is already the default
  // (authenticated: false or omitted) that needs no credentials at all.
  let encryptedCredentials = null;
  if (authenticated && !body.authToken) {
    if (!body.credentials || typeof body.credentials !== "object" || !body.credentials.password) {
      releaseConcurrencySlot(userId);
      return res.status(400).json({ error: "authenticated: true requires credentials or an authToken." });
    }
    if (!credentialEncryptionAvailable()) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
    try {
      encryptedCredentials = encryptCredentials(body.credentials);
    } catch (_e) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
  }

  let encryptedAuthToken = null;
  if (body.authToken) {
    if (!credentialEncryptionAvailable()) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
    try {
      encryptedAuthToken = encryptCredentials({ token: body.authToken });
    } catch (_e) {
      releaseConcurrencySlot(userId);
      return res.status(503).json({ error: "Authenticated capture is not available right now." });
    }
  }

  const id = nanoid();
  jobs.set(id, {
    id,
    status: "queued",
    progress: 0,
    stepIndex: null,
    stepTotal: null,
    videoUrl: null,
    durationSeconds: null,
    pageInfo: null,
    steps: null,
    hasCredentials: !!encryptedCredentials,
    encryptedCredentials,
    hasAuthToken: !!encryptedAuthToken,
    encryptedAuthToken,
    userId,
    error: null,
    createdAt: Date.now(),
  });
  queue.push({ id, kind: "appDemo" });

  console.log(`[capture] queued app-demo job ${id}${encryptedCredentials ? " (authenticated)" : encryptedAuthToken ? " (session-token)" : " (public)"}`);
  res.status(202).json({ captureId: id });
  processQueue();
});

// Shared job-record shape: { captureId, status, stepIndex, stepTotal,
// percent, videoUrl, durationSeconds, pageInfo, steps, hasCredentials,
// error, createdAt }. status is one of queued / processing / done / error
// / login_required / login_failed. durationSeconds/pageInfo/steps are
// only populated once status is "done" (pageInfo for /capture jobs,
// steps for /app-demo jobs — never both). encryptedCredentials never
// appears here — this response is built field-by-field, not by spreading
// the job record, specifically so a field like that can never leak into
// it by accident.
app.get("/captures/:id", requireSecret, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Capture not found" });
  const percent = typeof job.progress === "number" ? Math.round(job.progress * 100) : undefined;
  res.json({
    captureId: job.id,
    status: job.status,
    stepIndex: job.stepIndex,
    stepTotal: job.stepTotal,
    percent,
    videoUrl: job.videoUrl,
    durationSeconds: job.durationSeconds,
    pageInfo: job.pageInfo,
    steps: job.steps,
    hasCredentials: job.hasCredentials,
    hasAuthToken: job.hasAuthToken,
    error: job.error,
    createdAt: job.createdAt,
  });
});

app.listen(PORT, () => {
  console.log(`studio-capture-worker listening on :${PORT}`);
});