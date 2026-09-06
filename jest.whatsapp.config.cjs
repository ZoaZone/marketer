// Jest configuration for the WhatsApp CRM inbox tests.
//
// These specs are .mjs and run through Jest's native ESM support (the npm
// script sets --experimental-vm-modules) rather than the .cjs + mirrored-helper
// pattern used by tests/security. The difference is deliberate: the logic under
// test here lives in src/lib/whatsapp/payload.js, which is dependency-free ESM
// and can be imported for real, so these tests exercise the shipped code rather
// than a copy of it that can silently drift.
//
// The Deno functions still cannot be imported from Node, so what they need —
// that the webhook really does verify the token, check the signature and echo
// hub.challenge — is covered by source invariants in webhookContract.test.mjs.
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/whatsapp/**/*.test.mjs"],
  transform: {},
  verbose: true,
};
