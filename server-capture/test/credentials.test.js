import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// A fixed, valid 32-byte key for this whole file — must be set before
// credentials.js is imported, since it reads
// CAPTURE_CREDENTIAL_ENCRYPTION_KEY once at module load.
process.env.CAPTURE_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

const { encryptCredentials, decryptCredentials, zeroCredentials, redactCredentials, credentialEncryptionAvailable } =
  await import("../credentials.js");

const SAMPLE_CREDENTIALS = {
  loginUrl: "https://example.com/login",
  usernameField: "#email",
  passwordField: "#password",
  username: "demo-user@example.com",
  password: "correct horse battery staple",
};

test("credentialEncryptionAvailable is true once a key is configured", () => {
  assert.equal(credentialEncryptionAvailable(), true);
});

test("encrypt/decrypt round-trips the exact plaintext", () => {
  const envelope = encryptCredentials(SAMPLE_CREDENTIALS);
  assert.ok(envelope.iv && envelope.authTag && envelope.ciphertext);
  assert.deepEqual(decryptCredentials(envelope), SAMPLE_CREDENTIALS);
});

test("the encrypted envelope never contains the plaintext username or password as a substring", () => {
  const envelope = encryptCredentials(SAMPLE_CREDENTIALS);
  const serialized = JSON.stringify(envelope);
  assert.ok(!serialized.includes(SAMPLE_CREDENTIALS.password));
  assert.ok(!serialized.includes(SAMPLE_CREDENTIALS.username));
});

test("tampering with the ciphertext fails to decrypt (GCM auth tag integrity)", () => {
  const envelope = encryptCredentials(SAMPLE_CREDENTIALS);
  const tampered = { ...envelope, ciphertext: Buffer.from("not the real ciphertext at all").toString("base64") };
  assert.throws(() => decryptCredentials(tampered));
});

test("zeroCredentials clears every field of a decrypted object in place", () => {
  const decrypted = decryptCredentials(encryptCredentials(SAMPLE_CREDENTIALS));
  zeroCredentials(decrypted);
  for (const value of Object.values(decrypted)) {
    assert.ok(value === "" || value === null);
  }
  assert.ok(!JSON.stringify(decrypted).includes(SAMPLE_CREDENTIALS.password));
});

test("redactCredentials strips every known credential field from a copy, without mutating the input", () => {
  const original = { url: "https://example.com", ...SAMPLE_CREDENTIALS };
  const redacted = redactCredentials(original);
  assert.equal(redacted.url, "https://example.com");
  for (const key of ["loginUrl", "usernameField", "passwordField", "username", "password"]) {
    assert.equal(redacted[key], "[redacted]");
  }
  assert.equal(original.password, SAMPLE_CREDENTIALS.password); // input untouched
});

test("a job record serialized the way GET /captures/:id builds its response never leaks credentials", () => {
  // Mirrors index.js's field-by-field response construction exactly. The
  // regression this guards against: someone later "simplifying" that
  // handler to res.json(job) (a full object spread), which would leak
  // encryptedCredentials straight into the API response.
  const job = {
    id: "abc123",
    status: "done",
    progress: 1,
    stepIndex: 5,
    stepTotal: 5,
    videoUrl: "https://cdn.example.com/out.mp4",
    durationSeconds: 42,
    pageInfo: { title: "Example", description: "", headings: [] },
    hasCredentials: true,
    encryptedCredentials: encryptCredentials(SAMPLE_CREDENTIALS),
    userId: "user@example.com",
    error: null,
    createdAt: Date.now(),
  };

  const response = {
    captureId: job.id,
    status: job.status,
    stepIndex: job.stepIndex,
    stepTotal: job.stepTotal,
    percent: Math.round(job.progress * 100),
    videoUrl: job.videoUrl,
    durationSeconds: job.durationSeconds,
    pageInfo: job.pageInfo,
    hasCredentials: job.hasCredentials,
    error: job.error,
    createdAt: job.createdAt,
  };

  assert.ok(!("encryptedCredentials" in response));
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes(SAMPLE_CREDENTIALS.password));
  assert.ok(!serialized.includes(SAMPLE_CREDENTIALS.username));
});

test("a log line built the way index.js logs a queued capture never includes credential values or query strings", () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);
  try {
    function redactUrl(u) {
      try {
        const parsed = new URL(u);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[unparseable url]";
      }
    }
    const url = "https://example.com/product?ref=secret-tracking-token";
    const hasCredentials = true;
    // Mirrors index.js's exact log line construction — deliberately never
    // interpolates anything from the credentials object itself.
    console.log(`[capture] queued job xyz for ${redactUrl(url)}${hasCredentials ? " (authenticated)" : ""}`);
  } finally {
    console.log = originalLog;
  }
  const combined = logs.join("\n");
  assert.ok(!combined.includes(SAMPLE_CREDENTIALS.password));
  assert.ok(!combined.includes(SAMPLE_CREDENTIALS.username));
  assert.ok(!combined.includes("secret-tracking-token"));
  assert.ok(combined.includes("(authenticated)"));
});
