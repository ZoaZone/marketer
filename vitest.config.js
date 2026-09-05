import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

// Scope: the platform's cost-safety net (entitlement gating + usage
// metering for the AI-generation functions) — see test/README.md. This is
// deliberately narrow, not an app-wide test suite; scripts/check-plans.mjs
// and scripts/test-metering.mjs already cover plan-catalog consistency and
// remain the source of truth for those, run separately via `npm run
// verify`. Vitest here targets the same production code (the real
// base44/functions/*/entry.ts source, loaded and lightly transliterated
// from TS to JS — see test/helpers/loadServerModule.js) rather than a
// reimplementation, so a change to the real gating logic is what a test
// here actually exercises.
export default defineConfig({
  // The app resolves "@/..." through the base44 Vite plugin, which does not
  // run here — declare the same alias so a test can import a real frontend
  // module (e.g. src/utils/aiClient.js) instead of duplicating its logic.
  // A module imported this way should still stub src/api/base44Client, which
  // constructs an SDK client at import time.
  resolve: {
    alias: { "@": srcDir },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
