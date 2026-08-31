#!/usr/bin/env node
/**
 * Applies the pricing-unification changes that are small, surgical edits to
 * existing large files. Files that were rewritten wholesale (plans.js,
 * Billing.jsx, Pricing.jsx, the check/test scripts, the new entities) are
 * uploaded directly instead — this script only handles the cases where
 * shipping the whole file would be many times larger than the change.
 *
 * Every edit asserts its anchor matches exactly once, so a partial or
 * double application fails loudly instead of silently corrupting a file.
 * Safe to re-run: it exits early if the work is already done.
 */
import { readFileSync, writeFileSync } from "node:fs";

let applied = 0;

/**
 * `marker` must be a string that appears ONLY in the new content — most
 * replacements deliberately contain their own anchor, so "is the anchor
 * still there?" cannot tell applied from unapplied. Getting this wrong
 * silently skips real edits, so the marker is required and is asserted to
 * be absent from the anchor.
 */
const edit = (path, marker, anchor, replacement) => {
  if (!marker || anchor.includes(marker)) {
    throw new Error(`${path}: marker must be unique to the new content`);
  }
  if (!replacement.includes(marker)) {
    throw new Error(`${path}: replacement does not contain its own marker`);
  }
  const s = readFileSync(path, "utf8");
  if (s.includes(marker)) {
    console.log(`  skip  ${path} (already applied)`);
    return;
  }
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error(`${path}: anchor matched ${n} times, expected exactly 1`);
  writeFileSync(path, s.replace(anchor, replacement));
  console.log(`  edit  ${path}`);
  applied++;
};

// ---------------------------------------------------------------------------
// 1. Inline the metering block into every paid endpoint.
// ---------------------------------------------------------------------------
console.log("\ninlining the metering block");
{
  const BEGIN = "// ── BEGIN METERING BLOCK ──────────────────────────────────────────────────";
  const END = "// ── END METERING BLOCK ────────────────────────────────────────────────────";
  const full = readFileSync("base44/_shared/metering.block.ts", "utf8");
  const block = full.slice(full.indexOf(BEGIN), full.indexOf(END) + END.length);
  if (!block.startsWith(BEGIN)) throw new Error("could not extract the metering block");

  const TARGETS = [
    "submitVideo", "submitMusic", "submitDubVideo", "submitDubAudio",
    "submitDubbingProject", "generateVoiceover", "generateMusic", "generateImage",
  ];
  for (const name of TARGETS) {
    const path = `base44/functions/${name}/entry.ts`;
    let src = readFileSync(path, "utf8");
    const b = src.indexOf(BEGIN), e = src.indexOf(END);
    if (b !== -1 && e !== -1) {
      src = src.slice(0, b) + src.slice(e + END.length);
      src = src.replace(/\n{3,}/g, "\n\n");
    }
    const at = src.indexOf("Deno.serve(");
    if (at === -1) throw new Error(`${path}: no Deno.serve anchor`);
    const lineStart = src.lastIndexOf("\n", at) + 1;
    writeFileSync(path, src.slice(0, lineStart) + block + "\n\n" + src.slice(lineStart));
    console.log(`  block ${path}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Charge each job at submit time, before any provider call.
// ---------------------------------------------------------------------------
console.log("\nwiring spend ceilings");

edit("base44/functions/submitVideo/entry.ts",
  'one Render Minute per 5-second scene',
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;`,
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    // SPEND CEILING. Charged before the worker is called, from the clip
    // length the caller asked for — one Render Minute per 5-second scene.
    // A job on the customer's own Replicate key costs them nothing here;
    // their provider bills them directly.
    const overBudget = await meterUsage(
      base44, user, 'ai_video_scene',
      Math.max(1, Math.ceil((Number(spec.durationSeconds) || 5) / 5)),
      { usedOwnKey: !!byok.replicateKey, provider: 'replicate' },
    );
    if (overBudget) return overBudget;`);

edit("base44/functions/submitMusic/entry.ts",
  'One MusicGen run per submission',
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;`,
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    // SPEND CEILING. One MusicGen run per submission.
    const overBudget = await meterUsage(base44, user, 'music_track', 1, {
      usedOwnKey: !!byok.replicateKey, provider: 'replicate',
    });
    if (overBudget) return overBudget;`);

edit("base44/functions/submitDubVideo/entry.ts",
  'stops one multi-hour file burning an unbounded',
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['elevenlabs', 'replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;`,
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['elevenlabs', 'replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    // SPEND CEILING. Priced off the source duration the caller declares —
    // this is the gate that stops one multi-hour file burning an unbounded
    // amount of provider money before anything counts it.
    {
      const minutes = Math.max(1, Math.ceil((Number(spec.sourceSeconds) || 0) / 60));
      const langs = Math.max(1, Array.isArray(spec.targetLangs) ? spec.targetLangs.length : 1);
      const ownKey = !!byok.elevenLabsKey;
      const overBudget = await meterUsage(base44, user, 'dubbing_minute', minutes * langs, {
        usedOwnKey: ownKey, provider: 'elevenlabs',
      });
      if (overBudget) return overBudget;
      if (spec.lipsync) {
        const lipOver = await meterUsage(base44, user, 'lipsync_minute', minutes * langs, {
          usedOwnKey: !!byok.replicateKey, provider: 'replicate',
        });
        if (lipOver) return lipOver;
      }
    }`);

edit("base44/functions/submitDubAudio/entry.ts",
  'Same duration-based gate as submitDubVideo',
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['elevenlabs']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    let workerRes: Response;`,
`    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['elevenlabs']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    // SPEND CEILING. Same duration-based gate as submitDubVideo — charged
    // before the worker is called, from the source length the caller
    // declares, multiplied by the number of target languages requested.
    {
      const minutes = Math.max(1, Math.ceil((Number(spec.sourceSeconds) || 0) / 60));
      const langs = Math.max(1, Array.isArray(spec.targetLangs) ? spec.targetLangs.length : 1);
      const overBudget = await meterUsage(base44, user, 'dubbing_minute', minutes * langs, {
        usedOwnKey: !!byok.elevenLabsKey, provider: 'elevenlabs',
      });
      if (overBudget) return overBudget;
    }

    let workerRes: Response;`);

edit("base44/functions/submitDubbingProject/entry.ts",
  'the single largest spend the platform can incur',
`    const lipSync = isVideo && !!project.lip_sync;

    const outputs: any[] = [];`,
`    const lipSync = isVideo && !!project.lip_sync;

    // SPEND CEILING. A feature-length project fanned out across languages is
    // the single largest spend the platform can incur, so it is charged up
    // front for the whole fan-out — source minutes × target languages —
    // before the first worker call. Note this route always runs on platform
    // keys: it does not carry a BYOK passthrough the way submitDubVideo/
    // submitDubAudio do, so usedOwnKey is deliberately not set. Adding BYOK
    // here means decrypting the caller's key into the spec first; charging
    // zero without that would spend platform money for free.
    {
      const minutes = Math.max(1, Math.ceil((Number(project.source_seconds) || 0) / 60));
      const langs = Math.max(1, targets.length);
      const overBudget = await meterUsage(base44, user, 'dubbing_minute', minutes * langs, {
        jobId: project_id, provider: 'elevenlabs',
      });
      if (overBudget) return overBudget;
      if (lipSync) {
        const lipOver = await meterUsage(base44, user, 'lipsync_minute', minutes * langs, {
          jobId: project_id, provider: 'replicate',
        });
        if (lipOver) return lipOver;
      }
    }

    const outputs: any[] = [];`);

edit("base44/functions/generateVoiceover/entry.ts",
  'One AI credit buys',
`    if (!chunks.length) return Response.json({ error: 'No speakable text.' }, { status: 400, headers: CORS });`,
`    if (!chunks.length) return Response.json({ error: 'No speakable text.' }, { status: 400, headers: CORS });

    // SPEND CEILING. ElevenLabs bills per character. One AI credit buys
    // 1,500 characters, so a long script costs proportionally more.
    {
      const overBudget = await meterUsage(
        base44, user, 'voiceover', Math.max(1, Math.ceil(limitedText.length / 1500)),
        { provider: 'elevenlabs' },
      );
      if (overBudget) return overBudget;
    }`);

edit("base44/functions/generateMusic/entry.ts",
  'never after — metering a job',
`    const result = provider === 'suno' ? await generateWithSuno(body) : await generateWithReplicate(body);`,
`    // SPEND CEILING. One generation run per call, on the platform key.
    // Charged before the provider is called, never after — metering a job
    // once the money has already been spent is not a ceiling.
    {
      const overBudget = await meterUsage(base44, user, 'music_track', 1, { provider });
      if (overBudget) return overBudget;
    }

    const result = provider === 'suno' ? await generateWithSuno(body) : await generateWithReplicate(body);`);

edit("base44/functions/generateImage/entry.ts",
  "Subscribers draw against their plan's monthly AI",
`      if (!hasPaidPlan) {
        let usedCount = 0;`,
`      // SPEND CEILING. Subscribers draw against their plan's monthly AI
      // credit allowance. Before this, any non-free tier meant unlimited
      // generations forever — a $19/mo Creator and a $499/mo Dubbing House
      // subscriber had identical access, and the allowances advertised on
      // the pricing page were enforced nowhere. The free-trial path below
      // is unchanged.
      if (hasPaidPlan) {
        const overBudget = await meterUsage(base44, user, 'ai_generation', 1, { provider: 'base44' });
        if (overBudget) return overBudget;
      }

      if (!hasPaidPlan) {
        let usedCount = 0;`);

// ---------------------------------------------------------------------------
// 3. Checkout: Enterprise becomes purchasable; metering window starts fresh.
// ---------------------------------------------------------------------------
console.log("\ncheckout");

edit("base44/functions/stripeCheckoutCREAM/entry.ts",
  'MIRROR OF src/config/plans.js',
`// Canonical prices for every self-serve plan — cents, USD. This is the
// single source of truth Pricing.jsx displays and recordCommission's PRICES
// map mirrors for affiliate commission math; keep all three in sync.
// Yearly = monthly × 12 × 0.8 (20% off), rounded to the nearest dollar.
// Lane-2 Enterprise ($1,499+/mo) is deliberately absent — negotiated/custom
// pricing, "Contact Sales" only, never a self-serve Stripe Checkout plan.`,
`// Prices in cents, USD. MIRROR OF src/config/plans.js — that file is the
// canonical catalog; this copy exists only because a Base44 function
// deployment cannot import a frontend module. \`npm run check:plans\` parses
// this map and fails the build if it drifts from the catalog, so do not
// hand-edit it without updating src/config/plans.js in the same commit.
// recordCommission's PRICES map is verified against the same source.
//
// Yearly = monthly × 12 × 0.8 (20% off), rounded to the nearest dollar.
//
// Enterprise IS self-serve purchasable at its $1,499 list price. It used to
// be marketing-page-only with no checkout path and no way to provision it,
// which is why the app had "no enterprise plan defined" despite advertising
// one. Sales-assisted custom volume is still available on top — see the
// sales_assisted flag in the catalog — but a customer who simply wants to
// pay list price with a card can now do so.`);

edit("base44/functions/stripeCheckoutCREAM/entry.ts",
  "enterprise:    { name: 'Enterprise'",
`  dubbing_house: { name: 'Dubbing House', price_monthly: 49900, price_yearly: 479000, tier: 'dubbing_house' },
  // BYOK — platform-access fee only; the user's own provider keys do the rest
  byok: { name: 'BYOK', price_monthly: 4900, price_yearly: 47000, tier: 'byok' },`,
`  dubbing_house: { name: 'Dubbing House', price_monthly: 49900,  price_yearly: 479000,  tier: 'dubbing_house' },
  enterprise:    { name: 'Enterprise',    price_monthly: 149900, price_yearly: 1439000, tier: 'enterprise' },
  // BYO Providers — platform-access fee only; the customer's own keys pay
  // for the actual generation, so this plan carries no usage allowance.
  byok: { name: 'BYO Providers', price_monthly: 4900, price_yearly: 47000, tier: 'byok' },`);

edit("base44/functions/stripeCheckoutCREAM/entry.ts",
  'Reset the allowance window at the moment payment clears',
`      await base44.entities.Subscription.update(sub.id, {
        status: 'active',`,
`      await base44.entities.Subscription.update(sub.id, {
        status: 'active',
        // Reset the allowance window at the moment payment clears, not at
        // the moment the pending record was created — a customer who sat on
        // the Stripe page for a day still gets a full first month.
        usage_period_start: new Date().toISOString(),
        ai_credits_used: 0,
        render_minutes_used: 0,
        overage_ai_credits: 0,
        overage_render_minutes: 0,`);

edit("base44/functions/stripeCheckoutCREAM/entry.ts",
  'fresh from the moment it goes active',
`        plan_tier: selectedPlan.tier,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });`,
`        plan_tier: selectedPlan.tier,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        // Start the metering window now so the plan's monthly allowance is
        // fresh from the moment it goes active.
        usage_period_start: new Date().toISOString(),
        ai_credits_used: 0,
        render_minutes_used: 0,
        overage_ai_credits: 0,
        overage_render_minutes: 0,
      });`);

edit("base44/functions/stripeCheckoutCREAM/entry.ts",
  '      usage_period_start: new Date().toISOString(),\n      ai_credits_used: 0,',
`      status: 'pending',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });`,
`      status: 'pending',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      usage_period_start: new Date().toISOString(),
      ai_credits_used: 0,
      render_minutes_used: 0,
      overage_ai_credits: 0,
      overage_render_minutes: 0,
    });`);

// ---------------------------------------------------------------------------
// 4. Subscription gains the counters the allowance is measured against.
// ---------------------------------------------------------------------------
console.log("\nSubscription schema");

edit("base44/entities/Subscription.jsonc",
  '"usage_period_start": {',
`    "credits_balance": {
      "type": "number",
      "default": 0,
      "description": "Pay-as-you-go AI generation credits. 1 credit = 1 AI image/video generation, consumed after the free-trial allowance is used up."
    },`,
`    "credits_balance": {
      "type": "number",
      "default": 0,
      "description": "Pay-as-you-go AI generation credits. 1 credit = 1 AI image/video generation, consumed after the free-trial allowance is used up."
    },
    "usage_period_start": {
      "type": "string",
      "format": "date-time",
      "description": "Start of the current monthly metering window. The submit functions roll this forward and zero the two counters below whenever it is more than 31 days old, so an allowance is a real monthly pool rather than a lifetime one."
    },
    "ai_credits_used": {
      "type": "number",
      "default": 0,
      "description": "AI credits consumed in the current metering window. Compared against the plan's allowance.ai_credits (src/config/plans.js)."
    },
    "render_minutes_used": {
      "type": "number",
      "default": 0,
      "description": "Render Minutes consumed in the current metering window. Compared against the plan's allowance.render_minutes. BYOK jobs never increment this — the customer's own provider key pays for those."
    },
    "overage_ai_credits": {
      "type": "number",
      "default": 0,
      "description": "AI credits consumed beyond the allowance in the current window, billed at the published overage rate."
    },
    "overage_render_minutes": {
      "type": "number",
      "default": 0,
      "description": "Render Minutes consumed beyond the allowance in the current window, billed at the published overage rate."
    },
    "overage_enabled": {
      "type": "boolean",
      "default": true,
      "description": "When false, jobs are rejected at submit once the allowance is exhausted instead of billing overage. Enterprise contracts that cap spend set this false."
    },`);

// ---------------------------------------------------------------------------
// 5. Remove the markup disclosures that were shipping in the public bundle.
// ---------------------------------------------------------------------------
console.log("\nmargin confidentiality");

edit("src/pages/HelpCenter.jsx",
  'billed per message at the rates shown on the Billing page',
`Sending is included up to your plan's monthly message quota. Beyond that, it's billed at provider cost plus a 30% platform usage fee — or bring your own SendGrid/Twilio/WhatsApp Business credentials for $0 platform fee. See Billing for current per-message rates.`,
`Sending is included up to your plan's monthly message quota. Beyond that it's billed per message at the rates shown on the Billing page — or bring your own SendGrid/Twilio/WhatsApp Business credentials and send at $0 platform fee.`);

edit("src/pages/SocialHub.jsx",
  'billed per message at the rate shown on the Billing page',
`Emails send via digitalstudios.app's built-in delivery (Base44 → Resend → SendGrid). Included in your plan's monthly quota; overage is billed at provider cost + 30% platform fee.`,
`Emails send via digitalstudios.app's built-in delivery (Base44 → Resend → SendGrid). Included in your plan's monthly quota; overage is billed per message at the rate shown on the Billing page.`);

edit("src/pages/DubbingStudio.jsx",
  "A cost estimate isn't available for this project yet",
`setError("Submitted. Cost estimates are unavailable — DUBBING_RATE_USD_PER_MINUTE is not configured on the app.");`,
`setError("Submitted. A cost estimate isn't available for this project yet.");`);

// ---------------------------------------------------------------------------
// 6. Marketing copy on the home page.
// ---------------------------------------------------------------------------
console.log("\nmarketing copy");

edit("src/pages/Home.jsx",
  '60 Render Minutes), Studio $399/mo (250)',
`PRICING: two lanes. Lane 1 Business (pooled AI credits) — Creator $19/mo, Starter $49/mo, Growth $149/mo, Agency $399/mo. Lane 2 Movie Maker Pro (weighted render-credits for per-scene AI video, dubbing, lip-sync) — Indie $99/mo, Studio $399/mo, Dubbing House $499/mo, Enterprise from $1,499/mo. A $49/mo BYOK add-on lets you bring your own Replicate/ElevenLabs/LLM key. All prices + applicable taxes. Free trial: 25 AI generations (~5 images or 3 short videos), no credit card required. Pay-as-you-go AI credits start at $10.`,
`PRICING: two lanes. Business (AI credits for images, short video, voiceover and campaigns) — Creator $19/mo (150 credits), Starter $49/mo (400), Growth $149/mo (1,250), Agency $399/mo (3,500). Studio & Dubbing (Render Minutes for per-scene AI video, commercial dubbing and lip-sync) — Indie $99/mo (60 Render Minutes), Studio $399/mo (250), Dubbing House $499/mo (400), Enterprise $1,499/mo (1,200, custom volume available). A $49/mo BYO Providers add-on lets you run jobs on your own Replicate/ElevenLabs/LLM keys; it is included free with Studio, Dubbing House and Enterprise. All prices + applicable taxes. Free trial: 25 AI generations (~5 images or 3 short videos), no credit card required. Pay-as-you-go AI credits start at $10.`);

// ---------------------------------------------------------------------------
// 7. npm scripts.
// ---------------------------------------------------------------------------
{
  const p = "package.json";
  const d = JSON.parse(readFileSync(p, "utf8"));
  d.scripts["check:plans"] = "node scripts/check-plans.mjs";
  d.scripts["test:metering"] = "node scripts/test-metering.mjs";
  d.scripts.verify = "npm run lint && npm run check:plans && npm run test:metering && npm run build";
  writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
  console.log("\n  edit  package.json (check:plans, test:metering, verify)");
}

console.log(`\n${applied} surgical edits applied.\n`);
