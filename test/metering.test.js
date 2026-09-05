// Usage-metering behaviour — the spend ceiling enforced at submit time,
// before any provider is called. Loads the real meterUsage/WEIGHTS/RAW
// straight out of base44/_shared/metering.block.ts (the file every
// submit* function carries a byte-identical copy of, verified by `npm run
// check:plans`) — see test/helpers/loadServerModule.js. This exercises
// production logic, not a reimplementation of it.
//
// scripts/test-metering.mjs already covers this block thoroughly (run via
// `npm run test:metering`, wired into `npm run verify`) — this file is not
// a duplicate of it. It focuses on what this PR actually added: the new
// `music_vocal_track` (Suno) kind alongside the existing `music_track`
// (MusicGen instrumental) kind, and a couple of the core allowance/rejection
// paths the task asked to see covered by Vitest specifically.
import { describe, it, expect, beforeAll } from "vitest";
import { loadServerModule } from "./helpers/loadServerModule.js";

let meterUsage;
let WEIGHTS;
let ALLOWANCE;

beforeAll(async () => {
  const mod = await loadServerModule(
    "base44/_shared/metering.block.ts",
    "// ── BEGIN METERING BLOCK",
    "// ── END METERING BLOCK",
    ["meterUsage", "WEIGHTS", "ALLOWANCE"],
  );
  meterUsage = mod.meterUsage;
  WEIGHTS = mod.WEIGHTS;
  ALLOWANCE = mod.ALLOWANCE;
});

function fake(subOverrides, trialPrior = []) {
  const sub = subOverrides === null
    ? null
    : {
        id: "s1", owner_email: "u@x.com", status: "active", plan_tier: "studio",
        usage_period_start: new Date().toISOString(),
        ai_credits_used: 0, render_minutes_used: 0,
        overage_ai_credits: 0, overage_render_minutes: 0,
        ...subOverrides,
      };
  const events = [];
  const costs = [];
  return {
    sub, events, costs,
    client: {
      asServiceRole: {
        entities: {
          Subscription: {
            filter: async () => (sub ? [sub] : []),
            update: async (_id, patch) => Object.assign(sub, patch),
          },
          UsageEvent: {
            create: async (d) => { events.push(d); return { id: `e${events.length}` }; },
            filter: async () => trialPrior,
          },
          UsageCost: { create: async (d) => { costs.push(d); return { id: "c1" }; } },
        },
      },
    },
  };
}
const USER = { email: "u@x.com" };

describe("music generation weights — instrumental (MusicGen) vs. vocal (Suno)", () => {
  it("an instrumental track weighs 0.25 Render Minutes", () => {
    expect(WEIGHTS.music_track).toEqual({ rm: 0.25, ac: 0 });
  });

  it("a real vocal song (Suno) weighs 1 Render Minute — 4x an instrumental", () => {
    expect(WEIGHTS.music_vocal_track).toEqual({ rm: 1, ac: 0 });
  });

  it("an instrumental job inside the allowance charges 0.25 RM and is let through", async () => {
    const f = fake();
    const r = await meterUsage(f.client, USER, "music_track", 1, { provider: "replicate" });
    expect(r).toBeNull();
    expect(f.sub.render_minutes_used).toBe(0.25);
    expect(f.events[0].billed_as).toBe("allowance");
  });

  it("a vocal-song job inside the allowance charges 1 RM, four times the instrumental rate", async () => {
    const f = fake();
    const r = await meterUsage(f.client, USER, "music_vocal_track", 1, { provider: "suno" });
    expect(r).toBeNull();
    expect(f.sub.render_minutes_used).toBe(1);
  });

  it("a vocal-song job that would exceed the allowance is refused (402), not silently free", async () => {
    // studio allowance = 250 RM; 250 used already, 1 more RM tips it over
    // and the account has overage disabled.
    const f = fake({ render_minutes_used: 250, overage_enabled: false });
    const r = await meterUsage(f.client, USER, "music_vocal_track", 1, { provider: "suno" });
    expect(r).toBeTruthy();
    expect(r.status).toBe(402);
    expect(f.sub.render_minutes_used).toBe(250); // counters must not move on refusal
  });

  it("a BYOK Suno job costs the customer zero Render Minutes", async () => {
    const f = fake({ render_minutes_used: 100 });
    const r = await meterUsage(f.client, USER, "music_vocal_track", 1, { usedOwnKey: true, provider: "suno" });
    expect(r).toBeNull();
    expect(f.sub.render_minutes_used).toBe(100);
    expect(f.events[0].billed_as).toBe("byok");
    expect(f.costs.length).toBe(0); // no COGS row — the platform did not pay Suno for this one
  });

  it("no subscription at all is refused for a vocal song — Lane 2 spend is never free", async () => {
    const f = fake(null);
    const r = await meterUsage(f.client, USER, "music_vocal_track", 1, { provider: "suno" });
    expect(r).toBeTruthy();
    expect(r.status).toBe(403);
  });
});

describe("cost/margin math for known inputs", () => {
  it("10 dubbing minutes cost $5 raw, $1.25 margin, $6.25 charged (25% margin)", async () => {
    const f = fake();
    await meterUsage(f.client, USER, "dubbing_minute", 10, {});
    const c = f.costs[0];
    expect(c.raw_provider_cost_usd).toBe(5);
    expect(c.platform_margin_usd).toBe(1.25);
    expect(c.charged_cost_usd).toBe(6.25);
  });

  it("lip-sync costs 6x its unit count in Render Minutes, not 1x", async () => {
    const f = fake();
    await meterUsage(f.client, USER, "lipsync_minute", 10, {});
    expect(f.sub.render_minutes_used).toBe(60);
  });

  it("exceeding the allowance is recorded as overage, not silently free", async () => {
    const f = fake({ render_minutes_used: 245 }); // studio allowance = 250
    const r = await meterUsage(f.client, USER, "dubbing_minute", 20, {});
    expect(r).toBeNull(); // overage still proceeds by default
    expect(f.sub.render_minutes_used).toBe(265);
    expect(f.sub.overage_render_minutes).toBe(15);
    expect(f.events[0].billed_as).toBe("overage");
  });
});

describe("plan allowance catalog sanity", () => {
  it("byok tier carries a zero allowance — the customer's own keys pay for everything", () => {
    expect(ALLOWANCE.byok).toEqual({ ac: 0, rm: 0 });
  });

  it("every entitled music tier has a non-zero Render Minute allowance", () => {
    for (const tier of ["indie", "studio", "dubbing_house", "enterprise", "agency"]) {
      expect(ALLOWANCE[tier].rm).toBeGreaterThan(0);
    }
  });
});
