// jobstore.js — durable job records for the render worker.
//
// WHY THIS EXISTS
// The worker previously kept jobs in a bare `const jobs = new Map()`. That is
// fine for a 30-second render and wrong for the thing this product sells: a
// feature-length dub runs for hours, and any Railway redeploy, crash or
// scale event during that window destroyed the job record. The provider job
// (and its bill) carried on; the client polling GET /jobs/:id got a 404 and
// reported failure for work that was still running or had already succeeded.
//
// DESIGN — write-through cache, not a replacement
// An in-memory Map stays the hot path, so every existing synchronous
// `jobs.get(id)` inside the worker keeps working unchanged. Every mutation is
// mirrored to Redis. On boot we hydrate the Map back from Redis, so a restart
// recovers the records. Reads that miss the cache fall back to an async Redis
// lookup — that is the path that matters right after a deploy.
//
// Without REDIS_URL the module degrades to exactly the old in-memory
// behaviour, so local dev and un-provisioned deploys keep working. It logs
// once at boot so the operator knows which mode is live rather than
// discovering it during an incident.
//
// WHAT THIS DOES AND DOESN'T BUY
// Durable *records*, not durable *compute*. A job interrupted mid-ffmpeg is
// still lost work. But a provider-backed job (ElevenLabs dubbing) stores its
// provider reference, so a restarted worker can reattach to the run already
// in flight instead of paying to start it over — see resumableJobs() and its
// use in index.js.

import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || "";
const KEY_PREFIX = "renderjob:";
// Redis-side expiry. Deliberately longer than the in-process cleanup timers so
// Redis is never the thing that removes a record first; the worker's own
// scheduleCleanup stays in charge of lifetime.
const REDIS_TTL_SECONDS = 24 * 60 * 60;
// Boot must not block on an unavailable Redis — see initJobStore.
const CONNECT_TIMEOUT_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

const cache = new Map();

let redis = null;
let redisReady = false;

/** Connect lazily and never throw: Redis being down must not take the worker down. */
export async function initJobStore() {
  if (!REDIS_URL) {
    console.warn(
      "[jobstore] REDIS_URL not set — using in-memory job records only. " +
      "Jobs will NOT survive a restart; long dubbing runs are at risk.",
    );
    return { durable: false, recovered: 0 };
  }

  try {
    redis = createClient({
      url: REDIS_URL,
      socket: {
        // Without these, an unreachable Redis makes connect() retry forever and
        // the worker never reaches app.listen() — it silently serves nothing.
        // A render worker that is up without Redis is strictly better than a
        // render worker that is down, so give up quickly and degrade.
        connectTimeout: CONNECT_TIMEOUT_MS,
        reconnectStrategy: (retries) =>
          retries > MAX_RECONNECT_ATTEMPTS ? false : Math.min(retries * 200, 2000),
      },
    });
    // An 'error' listener is mandatory: without one, node-redis emits an
    // unhandled 'error' event and crashes the process on a transient blip.
    redis.on("error", (err) => {
      if (redisReady) console.error("[jobstore] redis error:", err?.message || err);
      redisReady = false;
    });
    redis.on("ready", () => { redisReady = true; });
    // Belt and braces: connectTimeout governs the socket, this bounds the whole
    // handshake (auth, TLS) so boot can never hang on it.
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis connect timed out")), CONNECT_TIMEOUT_MS + 1000),
      ),
    ]);
    redisReady = true;

    const recovered = await hydrate();
    console.log(`[jobstore] redis connected — recovered ${recovered} job record(s).`);
    return { durable: true, recovered };
  } catch (e) {
    console.error(
      `[jobstore] redis connect failed (${e?.message || e}) — continuing in memory-only mode. ` +
      "Jobs will NOT survive a restart until Redis is reachable.",
    );
    // Detach so a late reconnect can't half-enable persistence behind our back,
    // and so the dangling client doesn't keep the event loop alive.
    try { await redis?.disconnect(); } catch { /* already gone */ }
    redis = null;
    redisReady = false;
    return { durable: false, recovered: 0 };
  }
}

/** Pull every persisted record back into the in-memory cache after a restart. */
async function hydrate() {
  if (!redisReady) return 0;
  let count = 0;
  try {
    for await (const key of redis.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 200 })) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const job = JSON.parse(raw);
        if (job?.id) { cache.set(job.id, job); count++; }
      } catch { /* a corrupt record must not abort recovery of the rest */ }
    }
  } catch (e) {
    console.error("[jobstore] hydrate failed:", e?.message || e);
  }
  return count;
}

function persist(job) {
  if (!redisReady || !job?.id) return;
  // Fire-and-forget: persistence must never add latency to, or fail, a render.
  redis
    .set(`${KEY_PREFIX}${job.id}`, JSON.stringify(job), { EX: REDIS_TTL_SECONDS })
    .catch((e) => console.error("[jobstore] persist failed:", e?.message || e));
}

/** Synchronous read from the hot cache — the worker's internal path. */
export function get(id) {
  return cache.get(id);
}

/**
 * Async read that falls back to Redis on a cache miss. Use this on the HTTP
 * status route: right after a redeploy the cache may not yet hold a job that
 * Redis still knows about.
 */
export async function getAsync(id) {
  const hit = cache.get(id);
  if (hit) return hit;
  if (!redisReady) return undefined;
  try {
    const raw = await redis.get(`${KEY_PREFIX}${id}`);
    if (!raw) return undefined;
    const job = JSON.parse(raw);
    cache.set(id, job);
    return job;
  } catch {
    return undefined;
  }
}

export function set(id, job) {
  cache.set(id, job);
  persist(job);
  return job;
}

/**
 * Apply mutations to a job and persist the result in one step. Replaces the
 * old pattern of mutating the object in place, which wrote nothing durable.
 */
export function update(id, changes) {
  const job = cache.get(id);
  if (!job) return undefined;
  Object.assign(job, changes);
  persist(job);
  return job;
}

/**
 * Progress ticks fire every few seconds for hours. Writing each one to Redis
 * is pure noise, so the in-memory value updates every time (the status route
 * reads that) while Redis is written at most once every PROGRESS_FLUSH_MS.
 */
const PROGRESS_FLUSH_MS = 15000;
const lastFlush = new Map();

export function updateProgress(id, changes) {
  const job = cache.get(id);
  if (!job) return undefined;
  Object.assign(job, changes);
  const now = Date.now();
  if (now - (lastFlush.get(id) || 0) >= PROGRESS_FLUSH_MS) {
    lastFlush.set(id, now);
    persist(job);
  }
  return job;
}

export function remove(id) {
  cache.delete(id);
  lastFlush.delete(id);
  if (redisReady) {
    redis.del(`${KEY_PREFIX}${id}`).catch(() => { /* best effort */ });
  }
}

/**
 * Jobs that were mid-flight when the worker stopped AND carry a provider
 * reference we can reattach to. index.js walks these at boot so an
 * hours-long dub resumes against the run already in progress rather than
 * being re-submitted and billed a second time.
 */
export function resumableJobs() {
  return [...cache.values()].filter(
    (j) => j.status === "processing" && j.providerRef && j.providerKind,
  );
}

/** Everything still marked processing, resumable or not — used for reporting. */
export function orphanedJobs() {
  return [...cache.values()].filter((j) => j.status === "processing");
}

export function isDurable() {
  return redisReady;
}
