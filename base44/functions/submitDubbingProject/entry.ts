import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * submitDubbingProject — batch entry point for commercial dubbing.
 *
 * One DubbingProject fans out to one render-worker job per target language.
 * Existing submitDubVideo/submitDubAudio stay as the single-shot path used by
 * Movie Maker; this is the multi-language, glossary-aware, cost-estimated
 * front door for studio work.
 *
 * Body: { project_id: string }
 *
 * Why the fan-out lives server-side rather than in the browser: a feature-length
 * batch runs for hours across several languages. Submitting from the client
 * meant a closed tab abandoned the remaining languages. Here the jobs are all
 * registered with the worker before the response returns, and the project row
 * carries every job_id, so progress survives the tab, the session and a
 * worker redeploy (see server-render/jobstore.js).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Commercial dubbing is a Studio / Dubbing House / Enterprise capability.
// Mirrors submitDubVideo's gate — the two must not disagree, or this endpoint
// becomes the way around that one.
const DUBBING_ENTITLED_TIERS = ['byok', 'studio', 'dubbing_house', 'enterprise'];

async function assertEntitled(base44: any, user: any): Promise<Response | null> {
  if (user.role === 'admin') return null;
  const subs = await base44.asServiceRole.entities.Subscription
    .filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  const ok = !!sub && ['active', 'trialing'].includes(sub.status)
    && DUBBING_ENTITLED_TIERS.includes(sub.plan_tier);
  if (ok) return null;
  return Response.json(
    { error: 'Your plan does not include commercial dubbing.', code: 'upgrade_required', required_tiers: DUBBING_ENTITLED_TIERS },
    { status: 403, headers: CORS },
  );
}

/**
 * Cost estimate.
 *
 * The per-minute rates are NOT hardcoded — provider pricing changes and a
 * wrong number printed next to a Submit button is worse than no number. Set
 * DUBBING_RATE_USD_PER_MINUTE (and optionally LIPSYNC_RATE_USD_PER_MINUTE) from
 * the current provider contract; with neither set, the estimate is omitted and
 * the UI says so rather than showing a fabricated figure.
 */
function estimateCostUsd(sourceSeconds: number, langCount: number, lipSync: boolean): number | null {
  const dubRate = Number(Deno.env.get('DUBBING_RATE_USD_PER_MINUTE') || '');
  if (!Number.isFinite(dubRate) || dubRate <= 0) return null;
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) return null;

  const minutes = sourceSeconds / 60;
  let total = minutes * dubRate * langCount;

  const lipRate = Number(Deno.env.get('LIPSYNC_RATE_USD_PER_MINUTE') || '');
  if (lipSync && Number.isFinite(lipRate) && lipRate > 0) {
    total += minutes * lipRate * langCount;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Glossary → provider translation guidance.
 *
 * ElevenLabs Dubbing has no first-class glossary parameter, so terminology is
 * enforced the only way available: as explicit instruction text attached to the
 * job. Entries scoped to a different target language are filtered out so a
 * Tamil rule never leaks into the Hindi run.
 */
function buildGlossaryPrompt(glossary: any[], targetLang: string): string {
  const rules = (glossary || []).filter(
    (g) => g?.term && (!g.target_lang || g.target_lang === targetLang),
  );
  if (!rules.length) return '';
  const lines = rules.map((g) =>
    g.do_not_translate
      ? `- "${g.term}": leave untranslated, exactly as written.`
      : `- "${g.term}": always render as "${g.translation || g.term}".`,
  );
  return `Terminology that must be applied consistently throughout:\n${lines.join('\n')}`;
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const denied = await assertEntitled(base44, user);
    if (denied) return denied;

    const workerUrl = Deno.env.get('RENDER_WORKER_URL')?.trim();
    const sharedSecret = Deno.env.get('RENDER_SHARED_SECRET')?.trim();
    if (!workerUrl || !sharedSecret) {
      return Response.json({ error: 'RENDER_WORKER_URL/RENDER_SHARED_SECRET is not configured.' }, { status: 500, headers: CORS });
    }

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400, headers: CORS });
    }

    const project = await base44.asServiceRole.entities.DubbingProject.get(project_id).catch(() => null);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404, headers: CORS });
    }
    // Ownership is re-checked here even though RLS covers the entity: this
    // handler reads through asServiceRole, which bypasses RLS by design.
    if (project.owner_email !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const targets: string[] = Array.isArray(project.target_langs) ? project.target_langs.filter(Boolean) : [];
    if (!targets.length) {
      return Response.json({ error: 'The project has no target languages.' }, { status: 400, headers: CORS });
    }
    if (!project.source_url) {
      return Response.json({ error: 'The project has no source media.' }, { status: 400, headers: CORS });
    }
    // Re-submitting a running project would double-bill the source, which on a
    // feature-length film is expensive and silent. Block it explicitly.
    if (['queued', 'processing'].includes(project.status)) {
      return Response.json(
        { error: 'This project is already running. Wait for it to finish or cancel it first.', code: 'already_running' },
        { status: 409, headers: CORS },
      );
    }

    const isVideo = (project.source_kind || 'video') === 'video';
    const route = isVideo ? '/dub-video' : '/dub-audio';
    const lipSync = isVideo && !!project.lip_sync;

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

    const outputs: any[] = [];
    for (const targetLang of targets) {
      const glossaryPrompt = buildGlossaryPrompt(project.glossary, targetLang);

      const spec: Record<string, unknown> = {
        sourceUrl: project.source_url,
        targetLang,
        sourceLang: project.source_lang || undefined,
        numSpeakers: project.num_speakers || undefined,
        // The entity stores these as positive capabilities; the provider takes
        // the negatives. Inverting here keeps the confusing polarity in one
        // place instead of spread through the UI.
        dropBackgroundAudio: project.preserve_background_audio === false,
        disableVoiceCloning: project.voice_cloning === false,
        highestResolution: project.highest_resolution !== false,
        sourceSeconds: project.source_seconds || undefined,
        speakerMap: Array.isArray(project.speaker_map) ? project.speaker_map : undefined,
        glossaryPrompt: glossaryPrompt || undefined,
      };
      if (isVideo) {
        spec.lipSync = lipSync;
        spec.burnCaptions = !!project.burn_captions;
      }

      try {
        const workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-render-secret': sharedSecret },
          body: JSON.stringify(spec),
        });
        if (!workerRes.ok) {
          const detail = await workerRes.text().catch(() => `${workerRes.status}`);
          outputs.push({ target_lang: targetLang, status: 'failed', error: `Worker rejected: ${detail}`.slice(0, 500) });
          continue;
        }
        const data = await workerRes.json().catch(() => ({}));
        if (!data?.jobId) {
          outputs.push({ target_lang: targetLang, status: 'failed', error: 'Worker returned no job id.' });
          continue;
        }
        outputs.push({
          target_lang: targetLang,
          status: 'queued',
          job_id: data.jobId,
          progress: 0,
          started_at: new Date().toISOString(),
        });
      } catch (_networkError) {
        // One language failing must not abandon the rest of the batch.
        outputs.push({ target_lang: targetLang, status: 'failed', error: 'render_worker_unreachable' });
      }
    }

    const anyQueued = outputs.some((o) => o.status === 'queued');
    const estimate = estimateCostUsd(Number(project.source_seconds), outputs.filter((o) => o.status === 'queued').length, lipSync);

    const patch: Record<string, unknown> = {
      outputs,
      status: anyQueued ? 'queued' : 'failed',
    };
    if (estimate !== null) patch.estimated_cost_usd = estimate;

    await base44.asServiceRole.entities.DubbingProject.update(project_id, patch);

    return Response.json({
      project_id,
      status: patch.status,
      outputs,
      estimated_cost_usd: estimate,
      // Told plainly rather than hidden: an absent estimate means the rate env
      // var isn't configured, not that the run is free.
      estimate_available: estimate !== null,
    }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
