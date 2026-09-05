#!/usr/bin/env node
/**
 * Behavioural test for the metering block.
 *
 * The block is Deno/TypeScript inlined into eight functions, so it is
 * exercised here by transliterating it into JS with a fake base44 client:
 * strip the type annotations, stub Deno.env, and run the real control flow.
 * That keeps the arithmetic and the branch order under test even though the
 * production copies live inside Deno deployments.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const BEGIN = "// ── BEGIN METERING BLOCK";
const END = "// ── END METERING BLOCK";
const raw = readFileSync("base44/_shared/metering.block.ts", "utf8");
let block = raw.slice(raw.indexOf(BEGIN), raw.indexOf(END));

// TS -> JS: drop annotations the block uses. Deliberately narrow so a
// mistranslation shows up as a syntax error rather than silently changing
// behaviour.
block = block
  .replace(/const num = \(v: string \| undefined, fallback: number\)/, "const num = (v, fallback)")
  .replace(/const WEIGHTS: Record<string, \{ rm: number; ac: number \}>/, "const WEIGHTS")
  .replace(/const ALLOWANCE: Record<string, \{ ac: number; rm: number \}>/, "const ALLOWANCE")
  .replace(/RAW\[kind as keyof typeof RAW\]/g, "RAW[kind]")
  .replace(/\(n: number, e: any\)/g, "(n, e)")
  .replace(
    /async function meterUsage\([\s\S]*?\): Promise<Response \| null> \{/,
    "async function meterUsage(base44, user, kind, units, opts = {}) {",
  )
  .replace(/let sub: any = null;/, "let sub = null;")
  .replace(/\(s: any\)/g, "(s)")
  .replace(/let billedAs: string =/, "let billedAs =");

globalThis.Deno = { env: { get: () => undefined } };

const mod = await import(
  "data:text/javascript," + encodeURIComponent(block + "\nexport { meterUsage, ALLOWANCE };")
);
const { meterUsage } = mod;

// --- fake base44 -----------------------------------------------------------
function fake(subOverrides, trialPrior = []) {
  const sub = {
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
            filter: async () => (subOverrides === null ? [] : [sub]),
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

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ok    ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1; }
};

console.log("\nmetering behaviour");

await t("a dubbing job inside the allowance is charged and let through", async () => {
  const f = fake();
  const r = await meterUsage(f.client, USER, "dubbing_minute", 10, {});
  assert.equal(r, null, "should proceed");
  assert.equal(f.sub.render_minutes_used, 10);
  assert.equal(f.events[0].billed_as, "allowance");
  assert.equal(f.events[0].render_minutes_charged, 10);
});

await t("lip-sync costs 6 Render Minutes per minute, not 1", async () => {
  const f = fake();
  await meterUsage(f.client, USER, "lipsync_minute", 10, {});
  assert.equal(f.sub.render_minutes_used, 60);
});

await t("exceeding the allowance is flagged as overage, not silently free", async () => {
  const f = fake({ render_minutes_used: 245 }); // studio allowance = 250
  const r = await meterUsage(f.client, USER, "dubbing_minute", 20, {});
  assert.equal(r, null, "overage still proceeds by default");
  assert.equal(f.sub.render_minutes_used, 265);
  assert.equal(f.sub.overage_render_minutes, 15);
  assert.equal(f.events[0].billed_as, "overage");
});

await t("overage is REFUSED with 402 when the account has overage disabled", async () => {
  const f = fake({ render_minutes_used: 245, overage_enabled: false });
  const r = await meterUsage(f.client, USER, "dubbing_minute", 20, {});
  assert.ok(r, "should return a Response");
  assert.equal(r.status, 402);
  assert.equal(f.sub.render_minutes_used, 245, "counters must not move on refusal");
});

await t("a BYOK job costs the customer zero Render Minutes", async () => {
  const f = fake({ render_minutes_used: 100 });
  const r = await meterUsage(f.client, USER, "dubbing_minute", 500, { usedOwnKey: true });
  assert.equal(r, null);
  assert.equal(f.sub.render_minutes_used, 100, "allowance untouched on own key");
  assert.equal(f.events[0].billed_as, "byok");
  assert.equal(f.events[0].render_minutes_charged, 0);
  assert.equal(f.costs.length, 0, "no COGS row — we did not pay the provider");
});

await t("a lapsed billing window resets the counters", async () => {
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const f = fake({ usage_period_start: old, render_minutes_used: 240, overage_render_minutes: 30 });
  await meterUsage(f.client, USER, "dubbing_minute", 5, {});
  assert.equal(f.sub.render_minutes_used, 5, "should restart from zero, not 245");
  assert.equal(f.sub.overage_render_minutes, 0);
  assert.notEqual(f.sub.usage_period_start, old, "window should roll forward");
});

await t("no subscription is refused for Lane 2 — dubbing is never free", async () => {
  const f = fake(null);
  const r = await meterUsage(f.client, USER, "dubbing_minute", 1, {});
  assert.ok(r);
  assert.equal(r.status, 403);
});

await t("FREE TRIAL: a trial user CAN generate a voiceover", async () => {
  // This is the signup promise. Before the trial branch existed this
  // returned 403 and Quick Create died at the narration step.
  const f = fake(null);
  const r = await meterUsage(f.client, USER, "voiceover", 3, {});
  assert.equal(r, null, "trial user must be allowed");
  assert.equal(f.events[0].billed_as, "trial");
  assert.equal(f.events[0].ai_credits_charged, 3);
});

await t("FREE TRIAL: is capped at 25 and refuses the job that would exceed it", async () => {
  const spent = [{ ai_credits_charged: 24 }];
  const f = fake(null, spent);
  const r = await meterUsage(f.client, USER, "voiceover", 3, {});
  assert.ok(r, "should refuse");
  assert.equal(r.status, 403);
  assert.equal(f.events.length, 0, "nothing recorded on refusal");
  const f2 = fake(null, spent);
  assert.equal(await meterUsage(f2.client, USER, "voiceover", 1, {}), null);
});

await t("FREE TRIAL: never charges the customer, and margin is zero", async () => {
  const f = fake(null);
  await meterUsage(f.client, USER, "voiceover", 2, {});
  assert.equal(f.costs[0].charged_cost_usd, 0);
  assert.equal(f.costs[0].platform_margin_usd, 0);
  assert.ok(f.costs[0].raw_provider_cost_usd > 0, "but real COGS is still recorded");
});

await t("FREE TRIAL: an uncountable trial is refused, not handed out", async () => {
  const f = fake(null);
  f.client.asServiceRole.entities.UsageEvent.filter = async () => { throw new Error("down"); };
  const r = await meterUsage(f.client, USER, "voiceover", 1, {});
  assert.ok(r, "must not allow an uncounted trial");
  assert.equal(r.status, 503);
});

await t("a cancelled subscription cannot spend", async () => {
  const f = fake({ status: "cancelled" });
  const r = await meterUsage(f.client, USER, "dubbing_minute", 1, {});
  assert.ok(r);
  assert.equal(r.status, 403);
});

await t("the job is refused if the usage counter cannot be persisted", async () => {
  const f = fake();
  f.client.asServiceRole.entities.Subscription.update = async () => { throw new Error("db down"); };
  const r = await meterUsage(f.client, USER, "dubbing_minute", 5, {});
  assert.ok(r, "must not run the job unmetered");
  assert.equal(r.status, 503);
});

await t("a ledger write failure does NOT block a job already charged for", async () => {
  const f = fake();
  f.client.asServiceRole.entities.UsageEvent.create = async () => { throw new Error("ledger down"); };
  const r = await meterUsage(f.client, USER, "dubbing_minute", 5, {});
  assert.equal(r, null, "reporting is best-effort");
  assert.equal(f.sub.render_minutes_used, 5, "but the charge still landed");
});

await t("the internal COGS row carries a 25% margin over raw cost", async () => {
  const f = fake();
  await meterUsage(f.client, USER, "dubbing_minute", 10, {});
  const c = f.costs[0];
  assert.equal(c.raw_provider_cost_usd, 5, "10 min x $0.50");
  assert.equal(c.platform_margin_usd, 1.25);
  assert.equal(c.charged_cost_usd, 6.25);
});

await t("the customer-facing event never carries cost or margin fields", async () => {
  const f = fake();
  await meterUsage(f.client, USER, "dubbing_minute", 10, {});
  const keys = Object.keys(f.events[0]).join(",");
  assert.ok(!/cost|margin|usd/i.test(keys), `leaked: ${keys}`);
});

await t("an admin is never blocked, even with no subscription at all", async () => {
  // Every assertEntitled gate exempts admins; metering must too, or the
  // owner's own account gets 403s from its own app.
  const f = fake(null);
  const r = await meterUsage(f.client, { email: "admin@x.com", role: "admin" }, "dubbing_minute", 500, {});
  assert.equal(r, null, "admin must not be refused");
});

await t("a zero/negative unit count is a no-op, not a free pass or a crash", async () => {
  const f = fake();
  assert.equal(await meterUsage(f.client, USER, "dubbing_minute", 0, {}), null);
  assert.equal(f.sub.render_minutes_used, 0);
});

// --- ElevenLabs surcharge + consent ----------------------------------------
// An ElevenLabs run on a PLATFORM key carries an extra 25% platform margin
// on top of the standard 25%, and must not be charged at all until the
// account has recorded consent to it.

const CONSENTED = {
  email: "u@x.com",
  settings: { elevenlabs_surcharge_consent: { accepted: true, surchargePct: 0.25 } },
};

await t("an ElevenLabs run is REFUSED until the account consents to the surcharge", async () => {
  const f = fake();
  const r = await meterUsage(f.client, USER, "dubbing_minute", 10, { provider: "elevenlabs" });
  assert.ok(r, "should return a Response");
  assert.equal(r.status, 402);
  const body = await r.json();
  assert.equal(body.code, "elevenlabs_consent_required");
  assert.equal(body.surcharge_pct, 0.25);
  assert.equal(f.sub.render_minutes_used, 0, "counters must not move on refusal");
  assert.equal(f.events.length, 0, "and nothing is recorded");
});

await t("with consent, an ElevenLabs run costs 25% more than the same non-ElevenLabs run", async () => {
  const base = fake();
  await meterUsage(base.client, USER, "dubbing_minute", 10, {});
  const el = fake();
  const r = await meterUsage(el.client, CONSENTED, "dubbing_minute", 10, { provider: "elevenlabs" });
  assert.equal(r, null, "should proceed once consented");
  assert.equal(base.sub.render_minutes_used, 10);
  assert.equal(el.sub.render_minutes_used, 12.5, "10 RM + 25% surcharge");
  assert.equal(el.events[0].render_minutes_charged, 12.5, "the recorded charge matches the counter");
});

await t("the surcharge shows up as extra MARGIN, not extra raw provider cost", async () => {
  const f = fake();
  await meterUsage(f.client, CONSENTED, "dubbing_minute", 10, { provider: "elevenlabs" });
  const c = f.costs[0];
  assert.equal(c.raw_provider_cost_usd, 5, "10 min x $0.50 — what the provider charges us is unchanged");
  assert.equal(c.platform_margin_usd, 2.5, "25% base + 25% surcharge on $5");
  assert.equal(c.charged_cost_usd, 7.5);
  assert.equal(c.rate_source, "elevenlabs_surcharge");
});

await t("a BYOK ElevenLabs run is never surcharged — the customer's own key pays", async () => {
  const f = fake();
  // No consent recorded, and none needed: there is no platform margin to
  // add a surcharge to when the customer's provider bills them directly.
  const r = await meterUsage(f.client, USER, "dubbing_minute", 10, { provider: "elevenlabs", usedOwnKey: true });
  assert.equal(r, null, "must not be refused for missing consent");
  assert.equal(f.sub.render_minutes_used, 0, "allowance untouched on own key");
  assert.equal(f.events[0].billed_as, "byok");
});

await t("an admin is never surcharged or asked to consent", async () => {
  const f = fake(null);
  const r = await meterUsage(f.client, { email: "admin@x.com", role: "admin" }, "dubbing_minute", 10, { provider: "elevenlabs" });
  assert.equal(r, null);
});

await t("a non-ElevenLabs provider is untouched by the surcharge", async () => {
  const f = fake();
  const r = await meterUsage(f.client, USER, "ai_video_scene", 4, { provider: "replicate" });
  assert.equal(r, null, "no consent needed for another provider");
  assert.equal(f.sub.render_minutes_used, 4, "charged at face value");
  assert.equal(f.costs[0].rate_source, "default");
});

await t("stale consent at a lower percentage does not authorise the current surcharge", async () => {
  const f = fake();
  const staleUser = {
    email: "u@x.com",
    settings: { elevenlabs_surcharge_consent: { accepted: true, surchargePct: 0.1 } },
  };
  const r = await meterUsage(f.client, staleUser, "dubbing_minute", 10, { provider: "elevenlabs" });
  assert.ok(r, "consent to 10% must not authorise a 25% charge");
  assert.equal(r.status, 402);
});

await t("a withdrawn consent stops further ElevenLabs charges", async () => {
  const f = fake();
  const withdrawn = {
    email: "u@x.com",
    settings: { elevenlabs_surcharge_consent: { accepted: false, surchargePct: 0.25 } },
  };
  const r = await meterUsage(f.client, withdrawn, "dubbing_minute", 10, { provider: "elevenlabs" });
  assert.ok(r);
  assert.equal(r.status, 402);
});

await t("FREE TRIAL: an ElevenLabs run is neither surcharged nor consent-gated", async () => {
  // The signup promise is a fixed number of free generations. Surcharging
  // them would quietly make "25 free AI generations" mean 20.
  const f = fake(null);
  const r = await meterUsage(f.client, USER, "voiceover", 1, { provider: "elevenlabs" });
  assert.equal(r, null, "a trial user must not hit the consent wall");
  assert.equal(f.events[0].ai_credits_charged, 1, "charged at face value, not 1.25");
  assert.equal(f.events[0].billed_as, "trial");
});

console.log(`\n${passed} metering checks passed.\n`);
