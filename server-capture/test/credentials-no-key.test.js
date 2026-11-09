import { test } from "node:test";
import assert from "node:assert/strict";

// Deliberately does NOT set CAPTURE_CREDENTIAL_ENCRYPTION_KEY — `node
// --test` runs each test file in its own process, so this is a clean
// "no key configured" environment independent of credentials.test.js.
delete process.env.CAPTURE_CREDENTIAL_ENCRYPTION_KEY;
const { encryptCredentials, credentialEncryptionAvailable } = await import("../credentials.js");

test("without a configured key, authenticated capture refuses to encrypt rather than ever holding plaintext", () => {
  assert.equal(credentialEncryptionAvailable(), false);
  assert.throws(
    () => encryptCredentials({ username: "a", password: "b" }),
    /CAPTURE_CREDENTIAL_ENCRYPTION_KEY/
  );
});
