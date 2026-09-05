import { defineConfig } from "vitest/config";

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
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
