#!/usr/bin/env node
/**
 * Plan-catalog drift check.
 *
 * src/config/plans.js is canonical. Two Deno function deployments keep their
 * own copies of the price map (they cannot import a frontend module), and
 * eight of them carry an inlined copy of the metering block. Before this
 * script those copies were "kept in sync by comment discipline" — which is
 * exactly how Pricing.jsx came to advertise 9 plans while Billing.jsx sold
 * 3, and how Enterprise ended up on the marketing page with no checkout
 * path behind it.
 *
 * Fails non-zero on any divergence. Wire into CI.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const problems = [];
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };

const catalog = await import(pathToFileURL("src/config/plans.js").href);
const { ALL_PLANS, PLAN_BY_KEY, RENDER_MINUTE_WEIGHTS } = catalog;

// ---------------------------------------------------------------------------
// 1. stripeCheckoutCREAM's PLANS map must match the catalog, in cents.
// ---------------------------------------------------------------------------
console.log("\nstripeCheckoutCREAM price map");
{
  const src = readFileSync("base44/functions/stripeCheckoutCREAM/entry.ts", "utf8");
  const body = src.slice(src.indexOf("const PLANS"), src.indexOf("\n};", src.indexOf("const PLANS")));
  const found = new Map();
  for (const m of body.matchAll(
    /(\w+):\s*\{\s*name:\s*'([^']*)',\s*price_monthly:\s*(\d+),\s*price_yearly:\s*(\d+),\s*tier:\s*'([^']*)'/g,
  )) {
    found.set(m[1], { name: m[2], monthly: +m[3], yearly: +m[4], tier: m[5] });
  }

  for (const plan of ALL_PLANS) {
    const f = found.get(plan.key);
    if (!f) { bad(`${plan.key} is in the catalog but has no checkout entry — it cannot be bought`); continue; }
    if (f.monthly !== plan.price_monthly * 100) bad(`${plan.key} monthly: checkout ${f.monthly}c vs catalog ${plan.price_monthly * 100}c`);
    else if (f.yearly !== plan.price_yearly * 100) bad(`${plan.key} yearly: checkout ${f.yearly}c vs catalog ${plan.price_yearly * 100}c`);
    else if (f.tier !== plan.key) bad(`${plan.key} tier mismatch: checkout '${f.tier}'`);
    else ok(`${plan.key} $${plan.price_monthly}/mo · $${plan.price_yearly}/yr`);
  }
  for (const key of found.keys()) {
    if (!PLAN_BY_KEY[key]) bad(`checkout sells '${key}' but the catalog does not define it`);
  }
}

// ---------------------------------------------------------------------------
// 2. recordCommission's PRICES map — affiliate payouts are computed off it,
//    so a stale entry pays the wrong commission on a real transaction.
// ---------------------------------------------------------------------------
console.log("\nrecordCommission price map");
{
  const src = readFileSync("base44/functions/recordCommission/entry.ts", "utf8");
  const idx = src.search(/const PRICES\b/);
  if (idx === -1) {
    bad("no PRICES map found — commission math may not be reading plan prices at all");
  } else {
    const body = src.slice(idx, src.indexOf("\n};", idx));
    const found = new Map();
    for (const m of body.matchAll(/(\w+):\s*\{?\s*(?:monthly:\s*)?(\d+)/g)) found.set(m[1], +m[2]);
    for (const plan of ALL_PLANS) {
      if (!found.has(plan.key)) { bad(`${plan.key} missing from commission prices — affiliates earn 0 on it`); continue; }
      const v = found.get(plan.key);
      if (v !== plan.price_monthly && v !== plan.price_monthly * 100) bad(`${plan.key} commission price ${v} matches neither $${plan.price_monthly} nor ${plan.price_monthly * 100}c`);
      else ok(`${plan.key} ${v}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Subscription.plan_tier enum must cover every catalog key.
// ---------------------------------------------------------------------------
console.log("\nSubscription.plan_tier enum");
{
  const raw = readFileSync("base44/entities/Subscription.jsonc", "utf8");
  const schema = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const enumv = schema.properties.plan_tier.enum || [];
  for (const plan of ALL_PLANS) {
    if (!enumv.includes(plan.key)) bad(`plan_tier enum is missing '${plan.key}' — subscriptions cannot be recorded for it`);
  }
  for (const f of ["usage_period_start", "ai_credits_used", "render_minutes_used"]) {
    if (!schema.properties[f]) bad(`Subscription is missing '${f}' — allowances cannot be metered`);
  }
  if (!problems.length) ok(`${enumv.length} tiers, metering fields present`);
}

// ---------------------------------------------------------------------------
// 4. Every inlined metering block must be byte-identical to the canonical one.
// ---------------------------------------------------------------------------
console.log("\ninlined metering blocks");
{
  const BEGIN = "// ── BEGIN METERING BLOCK";
  const END = "// ── END METERING BLOCK";
  const canonSrc = readFileSync("base44/_shared/metering.block.ts", "utf8");
  const canon = canonSrc.slice(canonSrc.indexOf(BEGIN), canonSrc.indexOf(END));

  // Allowances inside the block must equal the catalog's.
  for (const plan of ALL_PLANS) {
    const re = new RegExp(`${plan.key}:\\s*\\{\\s*ac:\\s*(\\d+),\\s*rm:\\s*(\\d+)\\s*\\}`);
    const m = canon.match(re);
    if (!m) { bad(`metering block has no allowance row for '${plan.key}'`); continue; }
    if (+m[1] !== plan.allowance.ai_credits) bad(`${plan.key} ai_credits: block ${m[1]} vs catalog ${plan.allowance.ai_credits}`);
    else if (+m[2] !== plan.allowance.render_minutes) bad(`${plan.key} render_minutes: block ${m[2]} vs catalog ${plan.allowance.render_minutes}`);
  }

  // Public weights must equal the block's Render-Minute weights.
  for (const [kind, weight] of Object.entries(RENDER_MINUTE_WEIGHTS)) {
    const m = canon.match(new RegExp(`${kind}:\\s*\\{\\s*rm:\\s*([\\d.]+)`));
    if (!m) { bad(`metering block has no weight for '${kind}'`); continue; }
    if (Number(m[1]) !== weight) bad(`${kind} weight: block ${m[1]} vs public catalog ${weight}`);
  }

  let copies = 0;
  for (const dir of readdirSync("base44/functions")) {
    const p = `base44/functions/${dir}/entry.ts`;
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    const b = src.indexOf(BEGIN);
    if (b === -1) continue;
    copies++;
    const copy = src.slice(b, src.indexOf(END, b));
    if (copy !== canon) bad(`${dir} metering block has drifted from base44/_shared/metering.block.ts`);
  }
  if (copies === 0) bad("no function carries the metering block — nothing is metered");
  else ok(`${copies} functions, blocks identical, allowances and weights match the catalog`);
}

// ---------------------------------------------------------------------------
// 5. The margin must never reach the browser bundle.
// ---------------------------------------------------------------------------
console.log("\nmargin confidentiality");
{
  const leaks = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(e.name)) continue;
      const src = readFileSync(p, "utf8");
      // Identifiers…
      if (/PLATFORM_MARGIN|raw_provider_cost|platform_margin_usd|MARGIN_PCT/.test(src)) { leaks.push(`${p} (identifier)`); continue; }
      // …and prose. /pricing shipped the line "resold at +30–50% over
      // provider cost" to every visitor, which discloses the markup just as
      // effectively as a constant would.
      // Matches a percentage within ~60 chars of "provider cost" / "platform
      // fee" in EITHER order — the shipped copy said both
      // "resold at +30–50% over provider cost" and
      // "provider cost plus a 30% platform usage fee".
      const prose = [
        /\d+\s*(?:[–-]\s*\d+\s*)?%[^\n]{0,60}?(?:provider cost|platform (?:fee|margin|usage fee))/i,
        /(?:provider cost|platform (?:fee|margin|usage fee))[^\n]{0,60}?\d+\s*(?:[–-]\s*\d+\s*)?%/i,
        /(?:markup|margin) of\s*\d+\s*%/i,
      ];
      // Env-var names for the confidential rate table must not ship either —
      // they name the cost model to anyone reading the bundle.
      const rateIdents = /DUBBING_RATE_USD|LIPSYNC_RATE_USD|VIDEO_RATE_USD|AI_GENERATION_COST_USD|TTS_RATE_USD|MUSIC_RATE_USD/;
      if (prose.some((re) => re.test(src))) leaks.push(`${p} (prose discloses the markup)`);
      else if (rateIdents.test(src)) leaks.push(`${p} (names a confidential rate env var)`);
    }
  };
  walk("src");
  if (leaks.length) for (const l of leaks) bad(`${l} references the platform margin — it would ship in the public bundle`);
  else ok("no margin or raw-cost identifiers under src/");
}

console.log("");
if (problems.length) {
  console.error(`${problems.length} plan-catalog problem(s). Fix src/config/plans.js and its mirrors.\n`);
  process.exit(1);
}
console.log("Plan catalog consistent across all surfaces.\n");
