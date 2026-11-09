// replicate.js — shared hardened fetch wrapper for every outbound call to
// api.replicate.com (video.js's Kling/MiniMax predictions, dub.js's
// lip-sync predictions).
//
// Replicate sits behind Cloudflare, which occasionally answers a request
// with an HTML challenge/error page instead of JSON (also seen on 429/5xx
// blips) — left unhandled, that HTML gets treated as prediction data
// downstream and fails confusingly. This wraps every request so those
// responses are recognized and raised as a typed, retryable error instead;
// a well-formed non-2xx JSON error (bad input, invalid model, unauthorized)
// is a real failure and is NOT retryable.

import { createHmac, timingSafeEqual } from "node:crypto";

const USER_AGENT = "DigitalStudios-RenderWorker/1.0 (+https://digitalstudios.app)";

export class RetryableReplicateError extends Error {
  constructor(message) {
    super(message);
    this.name = "RetryableReplicateError";
    this.retryable = true;
  }
}

export function isRetryableReplicateError(err) {
  return !!err?.retryable;
}

/**
 * A 402 from Replicate — the account is out of credit. Typed separately
 * because it is the one Replicate failure that is neither transient nor
 * fixable in code: retrying it wastes time, and failing over to another
 * MODEL is pointless because every model bills the same ACCOUNT.
 *
 * This used to be an untyped Error, so video.js dutifully "fell back" from
 * Kling to MiniMax on a dead account and produced a burst of 429s chasing a
 * request that could never succeed — which is precisely what buried the
 * real cause ("insufficient credit") in the logs.
 */
export class ReplicateBillingError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReplicateBillingError";
    this.billing = true;
  }
}

export function isReplicateBillingError(err) {
  return !!err?.billing;
}

/**
 * replicateFetch(url, { token, method, body, headers }) — fetch wrapper for
 * api.replicate.com. Always sends Authorization/Accept/User-Agent (plus
 * Content-Type: application/json when a body is given); any caller-supplied
 * `headers` are merged on top of those defaults (e.g. Prefer: wait=N for a
 * synchronous create-prediction call) without removing them. Reads the
 * response as text first, and throws a RetryableReplicateError instead of
 * returning malformed data when: the request fails outright (network
 * error), the body isn't valid JSON, the body looks like an HTML page, or
 * the status is 429/5xx.
 */
export async function replicateFetch(url, { token, method = "GET", body, headers = {} } = {}) {
  const mergedHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...headers,
  };

  let res;
  try {
    res = await fetch(url, { method, headers: mergedHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (networkError) {
    throw new RetryableReplicateError(`Replicate request failed: ${networkError?.message || networkError}`);
  }

  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("<")) {
    throw new RetryableReplicateError(`Replicate returned a non-JSON response (status ${res.status})`);
  }

  let data;
  try {
    data = trimmed ? JSON.parse(trimmed) : {};
  } catch (_parseError) {
    throw new RetryableReplicateError(`Replicate returned a non-JSON response (status ${res.status})`);
  }

  if (res.status === 429 || res.status >= 500) {
    throw new RetryableReplicateError(`Replicate returned ${res.status} ${res.statusText}`);
  }

  if (!res.ok) {
    const detail = data?.detail || data?.error || JSON.stringify(data).slice(0, 500);
    // 402 = out of credit. Typed so callers can stop rather than retry or
    // fail over to another model on the same (unfunded) account.
    if (res.status === 402) {
      throw new ReplicateBillingError(`Replicate account has insufficient credit: ${detail}`);
    }
    throw new Error(`Replicate request failed (${res.status}): ${detail}`);
  }

  return data;
}

const BACKOFF_START_MS = 2000;
const BACKOFF_MULTIPLIER = 1.5;
const BACKOFF_MAX_MS = 15000;
const JITTER_RATIO = 0.2;

export const MAX_REPLICATE_RETRY_ATTEMPTS = 40;

/**
 * nextReplicateBackoffDelay(attempt) — exponential backoff (2s, ×1.5,
 * capped at 15s) with ±20% jitter, for retrying a transient Replicate
 * polling error. `attempt` is 0-indexed (first retry = attempt 0).
 */
export function nextReplicateBackoffDelay(attempt) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * Math.pow(BACKOFF_MULTIPLIER, attempt));
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

const CREATE_PREDICTION_BACKOFF_START_MS = 2000;
const CREATE_PREDICTION_BACKOFF_MULTIPLIER = 2;

export const MAX_CREATE_PREDICTION_RETRY_ATTEMPTS = 4;

/**
 * nextCreatePredictionBackoffDelay(attempt) — exponential backoff (2s, ×2,
 * i.e. 2s/4s/8s/16s across MAX_CREATE_PREDICTION_RETRY_ATTEMPTS) with ±20%
 * jitter, for retrying a transient failure creating a prediction (as
 * opposed to polling one already in flight, which uses the slower/longer
 * nextReplicateBackoffDelay above — prediction creation should fail fast
 * rather than hold a job queue slot for minutes). `attempt` is 0-indexed
 * (first retry = attempt 0).
 */
export function nextCreatePredictionBackoffDelay(attempt) {
  const base = CREATE_PREDICTION_BACKOFF_START_MS * Math.pow(CREATE_PREDICTION_BACKOFF_MULTIPLIER, attempt);
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

/**
 * verifyReplicateWebhookSignature(req, secret) — verifies a Replicate
 * webhook request using their Svix-based signing scheme: HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`, keyed by the
 * base64-decoded secret (after stripping the "whsec_" prefix), compared
 * against the base64 signature(s) in the `webhook-signature` header
 * (space-separated, each "v1,<base64>").
 *
 * Requires the raw request body bytes on `req.rawBody` — the signature is
 * computed over the exact bytes Replicate sent, not a re-serialized
 * JSON.parse'd version, so the server must capture it via
 * express.json({ verify }) before this can succeed.
 */
export function verifyReplicateWebhookSignature(req, secret) {
  const id = req.header("webhook-id");
  const timestamp = req.header("webhook-timestamp");
  const signatureHeader = req.header("webhook-signature");
  if (!id || !timestamp || !signatureHeader || !req.rawBody) return false;

  let secretBytes;
  try {
    secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  const signedContent = `${id}.${timestamp}.${req.rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");

  return signatureHeader.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    try {
      const sigBuf = Buffer.from(sig, "base64");
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}
