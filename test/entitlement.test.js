// Entitlement (plan-tier) gating — the check that runs BEFORE metering, on
// every generation-submit function: does this user's plan include this
// feature at all. Loads the real assertEntitled/isByokEntitled straight out
// of base44/functions/submitMusic/entry.ts (see
// test/helpers/loadServerModule.js) so this exercises production gating
// logic, not a reimplementation of it.
//
// submitMusic is the one this PR touches directly (adding the Suno vocal
// song path and its provider-selection logic), and its assertEntitled /
// isByokEntitled are byte-identical in shape to every other submit*
// function's copy — see AGENTS-facing docs in base44/PRICING_INTERNAL.md
// and base44/_shared/metering.block.ts for the sibling pattern this mirrors.
import { describe, it, expect, beforeAll } from "vitest";
import { loadServerModule } from "./helpers/loadServerModule.js";

let assertEntitled;
let isByokEntitled;

beforeAll(async () => {
  const mod = await loadServerModule(
    "base44/functions/submitMusic/entry.ts",
    "const CORS = {",
    "// ── BEGIN METERING BLOCK",
    ["assertEntitled", "isByokEntitled"],
  );
  assertEntitled = mod.assertEntitled;
  isByokEntitled = mod.isByokEntitled;
});

// Fake base44 client returning a single Subscription (or none).
function fakeBase44(sub) {
  return {
    asServiceRole: {
      entities: {
        Subscription: {
          filter: async () => (sub ? [sub] : []),
        },
      },
    },
  };
}

const ENTITLED_TIERS = ["byok", "indie", "studio", "dubbing_house", "enterprise", "agency"];
const NOT_ENTITLED_TIERS = ["creator", "starter", "growth"]; // Lane 1-only tiers — no music generation

describe("assertEntitled — plan-tier gate on AI music generation", () => {
  it("a user with no subscription at all is rejected", async () => {
    const base44 = fakeBase44(null);
    const res = await assertEntitled(base44, { email: "u@x.com", role: "user" });
    expect(res).toBeTruthy();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("upgrade_required");
  });

  for (const tier of NOT_ENTITLED_TIERS) {
    it(`a user on the '${tier}' plan (below the required tier) is rejected`, async () => {
      const base44 = fakeBase44({ status: "active", plan_tier: tier });
      const res = await assertEntitled(base44, { email: "u@x.com", role: "user" });
      expect(res).toBeTruthy();
      expect(res.status).toBe(403);
    });
  }

  for (const tier of ENTITLED_TIERS) {
    it(`a user on the '${tier}' plan is let through`, async () => {
      const base44 = fakeBase44({ status: "active", plan_tier: tier });
      const res = await assertEntitled(base44, { email: "u@x.com", role: "user" });
      expect(res).toBeNull();
    });
  }

  it("a cancelled subscription on an otherwise-entitled tier is rejected", async () => {
    const base44 = fakeBase44({ status: "cancelled", plan_tier: "studio" });
    const res = await assertEntitled(base44, { email: "u@x.com", role: "user" });
    expect(res).toBeTruthy();
    expect(res.status).toBe(403);
  });

  it("a trialing subscription on an entitled tier is let through", async () => {
    const base44 = fakeBase44({ status: "trialing", plan_tier: "indie" });
    const res = await assertEntitled(base44, { email: "u@x.com", role: "user" });
    expect(res).toBeNull();
  });

  it("an admin is never blocked, even with no subscription", async () => {
    const base44 = fakeBase44(null);
    const res = await assertEntitled(base44, { email: "admin@x.com", role: "admin" });
    expect(res).toBeNull();
  });
});

describe("isByokEntitled — who a saved BYOK key is honored for", () => {
  it("a Lane-1-only tier's stored key is ignored (not BYOK entitled)", async () => {
    const base44 = fakeBase44({ status: "active", plan_tier: "growth" });
    expect(await isByokEntitled(base44, { email: "u@x.com", role: "user" })).toBe(false);
  });

  it("a Lane-2 tier is BYOK entitled", async () => {
    const base44 = fakeBase44({ status: "active", plan_tier: "studio" });
    expect(await isByokEntitled(base44, { email: "u@x.com", role: "user" })).toBe(true);
  });

  it("the dedicated byok add-on tier is BYOK entitled", async () => {
    const base44 = fakeBase44({ status: "active", plan_tier: "byok" });
    expect(await isByokEntitled(base44, { email: "u@x.com", role: "user" })).toBe(true);
  });

  it("no subscription at all is not BYOK entitled", async () => {
    const base44 = fakeBase44(null);
    expect(await isByokEntitled(base44, { email: "u@x.com", role: "user" })).toBe(false);
  });

  it("an admin is always BYOK entitled", async () => {
    const base44 = fakeBase44(null);
    expect(await isByokEntitled(base44, { email: "admin@x.com", role: "admin" })).toBe(true);
  });
});
