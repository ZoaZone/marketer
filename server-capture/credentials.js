// credentials.js — encrypt-at-rest-in-memory handling for optional
// authenticated-capture credentials (Phase 2).
//
// Rule: credentials are used exactly once, for exactly one job, and are
// never written to disk and never logged. The only thing that outlives the
// instant they're received is an AES-256-GCM ciphertext, held on the
// queued job record in place of the plaintext, decrypted just-in-time
// immediately before the login step runs, and discarded immediately after
// (see index.js's processQueue). Every function here that touches
// plaintext returns it to the caller and does not retain its own copy.

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit — the standard/recommended GCM nonce size

function loadKey() {
  const b64 = process.env.CAPTURE_CREDENTIAL_ENCRYPTION_KEY;
  if (!b64) return null;
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("CAPTURE_CREDENTIAL_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes for AES-256.");
  }
  return key;
}

// Loaded once at process start — rotating the key requires a worker
// restart, the same operational model every other secret this worker reads
// from env already has.
const KEY = loadKey();

export function credentialEncryptionAvailable() {
  return KEY !== null;
}

/**
 * Encrypts a plaintext credentials object into a JSON-serializable envelope
 * ({ iv, authTag, ciphertext }, all base64) suitable for holding on the
 * in-memory job queue while a capture waits its turn. Throws if no
 * encryption key is configured — a queued job must never fall back to
 * holding plaintext credentials just because encryption isn't set up.
 */
export function encryptCredentials(plainObj) {
  if (!KEY) throw new Error("CAPTURE_CREDENTIAL_ENCRYPTION_KEY is not configured — authenticated capture is disabled.");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(plainObj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  plaintext.fill(0);
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/**
 * Decrypts an envelope from encryptCredentials back to the plaintext
 * object. Callers must use the result immediately and then call
 * zeroCredentials() on it as soon as they're done — Node/V8 gives no
 * guaranteed way to force a JS string or object's backing memory to be
 * overwritten (unlike a Buffer, where .fill(0) genuinely zeroes it), so
 * this is best-effort defense in depth, not a hard guarantee against e.g.
 * a heap dump taken at exactly the wrong instant. It's still worth doing:
 * it closes the window during which the plaintext is reachable from the
 * object the rest of the code holds a reference to.
 */
export function decryptCredentials(envelope) {
  if (!KEY) throw new Error("CAPTURE_CREDENTIAL_ENCRYPTION_KEY is not configured.");
  const iv = Buffer.from(envelope.iv, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const obj = JSON.parse(plaintext.toString("utf8"));
  plaintext.fill(0);
  return obj;
}

/** Best-effort in-place zeroing — see decryptCredentials's note above. */
export function zeroCredentials(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    obj[key] = typeof obj[key] === "string" ? "" : null;
  }
}

const CREDENTIAL_KEYS = [
  "username", "password", "usernameField", "passwordField",
  "loginUrl", "submitSelector", "successSelector",
];

/**
 * Strips every known credential field from an arbitrary object before it's
 * logged or returned in an API response. Returns a shallow copy; never
 * mutates the input. Used defensively anywhere a request body or job
 * record might end up serialized — even though the normal code paths
 * never put plaintext credentials on a logged or API-facing object in the
 * first place, this is the backstop if one ever does by mistake.
 */
export function redactCredentials(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const copy = { ...obj };
  for (const key of CREDENTIAL_KEYS) {
    if (key in copy) copy[key] = "[redacted]";
  }
  if ("credentials" in copy) copy.credentials = "[redacted]";
  if ("encryptedCredentials" in copy) copy.encryptedCredentials = "[redacted]";
  return copy;
}
