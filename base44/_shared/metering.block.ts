/**
 * CANONICAL METERING BLOCK — server side only.
 *
 * This file is NOT deployed. Base44 function deployments cannot import a
 * shared local module, so this block is copied verbatim into each submit
 * function between the BEGIN/END markers. `npm run check:plans` extracts
 * every copy and fails the build if any of them drifts from this file, or
 * if the allowance table drifts from src/config/plans.js.
 *
 * Everything here is commercially confidential — raw provider costs and the
 * platform margin. Never restate any of it under src/. See
 * base44/PRICING_INTERNAL.md for provenance on every rate.
 */

// ── BEGIN METERING BLOCK ──────────────────────────────────────────────────
const PLATFORM_MARGIN_PCT = 0.25;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Raw provider cost, USD. Env-overridable so a corrected provider price is
// a config change, not a deploy. Provenance table: base44/PRICING_INTERNAL.md.
const RAW = {
  ai_generation: num(Deno.env.get('AI_GENERATION_COST_USD'), 0.04),
  // One voiceover unit is 1,500 characters (what 1 AI credit buys), so the
  // per-1K-character provider rate is scaled by 1.5.
  voiceover: num(Deno.env.get('TTS_RATE_USD_PER_1K_CHARS'), 0.05) * 1.5,
  ai_video_scene: num(Deno.env.get('VIDEO_RATE_USD_PER_SCENE'), 0.35),
  music_track: num(Deno.env.get('MUSIC_RATE_USD_PER_RUN'), 0.10),
  // Real vocal song generation (Suno) — no confirmed platform-owned API
  // contract at time of writing, so this is a conservative estimate, not a
  // verified price. See base44/PRICING_INTERNAL.md.
  music_vocal_track: num(Deno.env.get('MUSIC_VOCAL_RATE_USD_PER_RUN'), 0.30),
  dubbing_minute: num(Deno.env.get('DUBBING_RATE_USD_PER_MINUTE'), 0.50),
  lipsync_minute: num(Deno.env.get('LIPSYNC_RATE_USD_PER_MINUTE'), 3.00),
};

// Weights users are allowed to see (mirrored in src/config/plans.js's
// RENDER_MINUTE_WEIGHTS). Render Minutes for Lane 2, AI credits for Lane 1.
const WEIGHTS: Record<string, { rm: number; ac: number }> = {
  ai_generation: { rm: 0, ac: 1 },
  voiceover: { rm: 0, ac: 1 },
  ai_video_scene: { rm: 1, ac: 0 },
  music_track: { rm: 0.25, ac: 0 },
  music_vocal_track: { rm: 1, ac: 0 },
  dubbing_minute: { rm: 1, ac: 0 },
  lipsync_minute: { rm: 6, ac: 0 },
};

// Monthly allowance per tier. MUST mirror src/config/plans.js's
// allowance blocks — check:plans enforces it.
const ALLOWANCE: Record<string, { ac: number; rm: number }> = {
  creator: { ac: 150, rm: 0 },
  starter: { ac: 400, rm: 0 },
  growth: { ac: 1250, rm: 0 },
  agency: { ac: 3500, rm: 25 },
  indie: { ac: 250, rm: 60 },
  studio: { ac: 1000, rm: 250 },
  dubbing_house: { ac: 1000, rm: 400 },
  enterprise: { ac: 4000, rm: 1200 },
  byok: { ac: 0, rm: 0 },
};

const PERIOD_MS = 31 * 24 * 60 * 60 * 1000;

// The signup offer, in AI credits. MUST equal FREE_TRIAL_GENERATIONS in
// src/config/plans.js — check:plans enforces it, because this number is
// quoted on the home page, /pricing and the Help Center.
const FREE_TRIAL_UNITS = 25;

/**
 * Charge a job before any provider call is made. Charging at submit is what
 * makes an allowance a real spend ceiling — charging on completion would let
 * one multi-hour job run unbounded before anything counted it.
 *
 * Returns null to proceed, or a Response to return to the caller.
 * `usedOwnKey` true means the job runs on the customer's BYOK credentials:
 * their provider bills them directly, so we charge zero and only record it.
 */
async function meterUsage(
  base44: any,
  user: any,
  kind: string,
  units: number,
  opts: { usedOwnKey?: boolean; jobId?: string; provider?: string } = {},
): Promise<Response | null> {
  const weight = WEIGHTS[kind];
  if (!weight || !(units > 0)) return null;

  // Admins are never blocked. Every assertEntitled gate in this codebase
  // already exempts them, so without the same exemption here the owner's
  // own account — which has no Subscription record — would start getting
  // 403s from its own app the moment metering shipped, including from the
  // internal demo-video and dubbing tooling. Admin usage is deliberately
  // not charged to anyone's allowance; treat it as house spend and watch it
  // through the provider dashboards.
  if (user?.role === 'admin') return null;

  // Declared before the free-trial branch below, which charges `ac`.
  const rm = weight.rm * units;
  const ac = weight.ac * units;

  let sub: any = null;
  try {
    const subs = await base44.asServiceRole.entities.Subscription.filter(
      { owner_email: user.email }, '-created_date', 10,
    );
    sub = (subs || []).find((s: any) => ['active', 'trialing'].includes(s.status)) || null;
  } catch (_) { /* fall through — handled below */ }

  // FREE TRIAL. The signup promise is "25 AI generations, no credit card",
  // and /pricing, the Help Center and the home page all repeat it — but
  // only generateImage ever honoured it. generateVoiceover demanded an
  // active subscription, so a trial user following the normal Quick Create
  // or Demo Video flow hit a hard 403 at the narration step and could not
  // finish a single video. The promise now covers credit-weighted (Lane 1)
  // work generally.
  //
  // Lane 2 stays subscription-only: dubbing, per-scene AI video, lip-sync
  // and music spend real per-minute provider money, and a free account is
  // exactly what an abuser would use to spend it.
  if (!sub) {
    if (weight.rm > 0) {
      return Response.json({
        error: 'An active subscription is required for this feature.',
        code: 'no_subscription',
      }, { status: 403 });
    }

    let trialUsed = 0;
    try {
      const prior = await base44.asServiceRole.entities.UsageEvent.filter(
        { owner_email: user.email, billed_as: 'trial' }, '-created_date', 200,
      );
      trialUsed = (prior || []).reduce((n: number, e: any) => n + Number(e.ai_credits_charged || 0), 0);
    } catch (_) {
      // Cannot read the counter — refuse rather than hand out an
      // uncountable trial.
      return Response.json({
        error: 'Could not check your free-trial balance. Please retry in a moment.',
        code: 'metering_unavailable',
      }, { status: 503 });
    }

    if (trialUsed + ac > FREE_TRIAL_UNITS) {
      return Response.json({
        error: `You've used all ${FREE_TRIAL_UNITS} free AI generations. Subscribe to a plan or purchase credits to keep creating.`,
        code: 'trial_limit_reached',
        used: trialUsed,
        limit: FREE_TRIAL_UNITS,
      }, { status: 403 });
    }

    const trialRaw = (RAW[kind as keyof typeof RAW] || 0) * units;
    try {
      const ev = await base44.asServiceRole.entities.UsageEvent.create({
        owner_email: user.email,
        kind,
        units,
        ai_credits_charged: ac,
        render_minutes_charged: 0,
        billed_as: 'trial',
        job_id: opts.jobId || '',
        provider: opts.provider || '',
      });
      await base44.asServiceRole.entities.UsageCost.create({
        usage_event_id: ev?.id || '',
        owner_email: user.email,
        kind,
        units,
        raw_provider_cost_usd: Number(trialRaw.toFixed(4)),
        platform_margin_usd: 0,
        charged_cost_usd: 0,
        rate_source: 'trial',
      });
    } catch (_) {
      // The counter is the ceiling here — without a recorded event the
      // trial is unbounded, so this one is load-bearing.
      return Response.json({
        error: 'Could not record your free-trial usage. Please retry in a moment.',
        code: 'metering_unavailable',
      }, { status: 503 });
    }
    return null;
  }

  // Roll the metering window forward if the current one has lapsed.
  const startedAt = sub.usage_period_start ? Date.parse(sub.usage_period_start) : 0;
  const stale = !startedAt || Date.now() - startedAt > PERIOD_MS;
  const usedRm = stale ? 0 : Number(sub.render_minutes_used || 0);
  const usedAc = stale ? 0 : Number(sub.ai_credits_used || 0);
  const overRm = stale ? 0 : Number(sub.overage_render_minutes || 0);
  const overAc = stale ? 0 : Number(sub.overage_ai_credits || 0);

  const allow = ALLOWANCE[sub.plan_tier] || { ac: 0, rm: 0 };

  // BYOK: the customer's own provider key pays. Record it for their usage
  // page, charge nothing, and never touch the allowance counters.
  let billedAs: string = 'allowance';
  let newRm = usedRm;
  let newAc = usedAc;
  let newOverRm = overRm;
  let newOverAc = overAc;

  if (opts.usedOwnKey) {
    billedAs = 'byok';
  } else {
    const rmAfter = usedRm + rm;
    const acAfter = usedAc + ac;
    const rmOver = Math.max(0, rmAfter - allow.rm);
    const acOver = Math.max(0, acAfter - allow.ac);
    const spillsOver = (rm > 0 && rmOver > overRm) || (ac > 0 && acOver > overAc);

    if (spillsOver && sub.overage_enabled === false) {
      return Response.json({
        error: 'This job would exceed your plan\'s monthly allowance, and overage billing is disabled on your account. Upgrade your plan or contact us to raise the cap.',
        code: 'allowance_exceeded',
        allowance: { ai_credits: allow.ac, render_minutes: allow.rm },
        used: { ai_credits: usedAc, render_minutes: usedRm },
        requested: { ai_credits: ac, render_minutes: rm },
      }, { status: 402 });
    }

    if (spillsOver) billedAs = 'overage';
    newRm = rmAfter;
    newAc = acAfter;
    newOverRm = Math.max(overRm, rmOver);
    newOverAc = Math.max(overAc, acOver);
  }

  // Load-bearing: the counters are the spend ceiling. If this write fails
  // the job is refused rather than run unmetered.
  try {
    await base44.asServiceRole.entities.Subscription.update(sub.id, {
      usage_period_start: stale ? new Date().toISOString() : sub.usage_period_start,
      render_minutes_used: newRm,
      ai_credits_used: newAc,
      overage_render_minutes: newOverRm,
      overage_ai_credits: newOverAc,
    });
  } catch (_) {
    return Response.json({
      error: 'Could not record usage for this job. Please retry in a moment.',
      code: 'metering_unavailable',
    }, { status: 503 });
  }

  // Reporting only — never block a paid-for job on a ledger write.
  const rawCost = (RAW[kind as keyof typeof RAW] || 0) * units;
  try {
    const ev = await base44.asServiceRole.entities.UsageEvent.create({
      owner_email: user.email,
      kind,
      units,
      ai_credits_charged: opts.usedOwnKey ? 0 : ac,
      render_minutes_charged: opts.usedOwnKey ? 0 : rm,
      billed_as: billedAs,
      job_id: opts.jobId || '',
      provider: opts.provider || '',
    });
    if (!opts.usedOwnKey) {
      await base44.asServiceRole.entities.UsageCost.create({
        usage_event_id: ev?.id || '',
        owner_email: user.email,
        kind,
        units,
        raw_provider_cost_usd: Number(rawCost.toFixed(4)),
        platform_margin_usd: Number((rawCost * PLATFORM_MARGIN_PCT).toFixed(4)),
        charged_cost_usd: Number((rawCost * (1 + PLATFORM_MARGIN_PCT)).toFixed(4)),
        rate_source: 'default',
      });
    }
  } catch (_) { /* best effort */ }

  return null;
}
// ── END METERING BLOCK ────────────────────────────────────────────────────

export { meterUsage };
