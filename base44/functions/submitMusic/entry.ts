import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * submitMusic — server-side proxy that hands an AI music-generation job off
 * to the standalone render worker (server-render/, deployed separately,
 * e.g. on Railway — the same worker submitRender uses, just its /music
 * endpoint) and returns the job id it assigns.
 *
 * Mirrors submitRender/entry.ts exactly: same Deno.serve handler shape,
 * same CORS/OPTIONS handling, same createClientFromRequest +
 * base44.auth.me() auth guard, same { error } shape on failure.
 *
 * The request body IS the music spec as-is ({ prompt, durationSeconds,
 * model_version } — see server-render/music.js) — this function doesn't
 * interpret it, just forwards it to the worker with the shared secret it
 * needs to accept the job.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// BYOK (Work Package F): decrypt any stored user provider keys so the
// worker can bill the user's own account instead of the platform's. A
// decryption failure falls back to the platform key silently — a broken or
// rotated BYOK key must never break the job, only forfeit the BYOK pricing
// for that one run.
async function decryptSecret(stored: { ciphertext: string; iv: string }, keyB64: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const iv = Uint8Array.from(atob(stored.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(stored.ciphertext), (c) => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

async function buildByok(apiKeys: any, fields: Array<'replicate' | 'elevenlabs'>): Promise<Record<string, string>> {
  const encryptionKey = Deno.env.get('BYOK_ENCRYPTION_KEY');
  const byok: Record<string, string> = {};
  if (!encryptionKey) return byok;
  for (const field of fields) {
    const record = apiKeys[field];
    if (!record?.ciphertext) continue;
    try {
      const plain = await decryptSecret(record, encryptionKey);
      if (field === 'replicate') byok.replicateToken = plain;
      if (field === 'elevenlabs') byok.elevenLabsKey = plain;
    } catch (_) { /* ignore — fall back to platform key */ }
  }
  return byok;
}

// COST GATE. isByokEntitled below only decides WHOSE api key pays; it never
// gated access, so before this any authenticated user — free tier included —
// could call this endpoint directly and bill the platform. MusicGen bills per generation against the platform Replicate key.
// The eslint lane guard stops Lane 1 *code* importing Lane 2, but a lint rule
// is not an access control: it does nothing about a direct HTTP call.
const GENERATION_ENTITLED_TIERS = ["byok","indie","studio","dubbing_house","enterprise","agency"];
async function assertEntitled(base44: any, user: any): Promise<Response | null> {
  if (user.role === 'admin') return null;
  const subs = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  const ok = !!sub && ['active', 'trialing'].includes(sub.status) && GENERATION_ENTITLED_TIERS.includes(sub.plan_tier);
  if (ok) return null;
  return Response.json(
    { error: 'Your plan does not include AI music generation.', code: 'upgrade_required', required_tiers: GENERATION_ENTITLED_TIERS },
    { status: 403, headers: CORS },
  );
}

// A saved BYOK key is only honored for a user whose subscription actually
// covers it — the dedicated BYOK add-on, or any Lane-2 (Movie Maker Pro)
// tier. A Lane-1-only (or free) user's stored key, if any, is ignored and
// the job silently falls back to the platform key instead.
const BYOK_ENTITLED_TIERS = ['byok', 'indie', 'studio', 'dubbing_house', 'enterprise'];
async function isByokEntitled(base44: any, user: any): Promise<boolean> {
  if (user.role === 'admin') return true;
  const subs = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  return !!sub && ['active', 'trialing'].includes(sub.status) && BYOK_ENTITLED_TIERS.includes(sub.plan_tier);
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

  let sub: any = null;
  try {
    const subs = await base44.asServiceRole.entities.Subscription.filter(
      { owner_email: user.email }, '-created_date', 10,
    );
    sub = (subs || []).find((s: any) => ['active', 'trialing'].includes(s.status)) || null;
  } catch (_) { /* fall through — handled below */ }

  if (!sub) {
    return Response.json({
      error: 'An active subscription is required for this feature.',
      code: 'no_subscription',
    }, { status: 403 });
  }

  const rm = weight.rm * units;
  const ac = weight.ac * units;

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

    const spec = await req.json().catch(() => ({}));
    const entitled = await isByokEntitled(base44, user);
    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    // SPEND CEILING. One MusicGen run per submission.
    const overBudget = await meterUsage(base44, user, 'music_track', 1, {
      usedOwnKey: !!byok.replicateKey, provider: 'replicate',
    });
    if (overBudget) return overBudget;

    let workerRes: Response;
    try {
      workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}/music`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-render-secret': sharedSecret,
        },
        body: JSON.stringify(spec),
      });
    } catch (_networkError) {
      // The worker being unreachable (cold start, deploy in progress, host
      // down) is a distinct, expected failure mode — return a specific
      // error code the frontend can key off of to show a friendly retry
      // message, rather than a generic 500. Same code as submitRender's,
      // since it's the same underlying worker.
      return Response.json({ error: 'render_worker_unreachable' }, { status: 502, headers: CORS });
    }

    if (!workerRes.ok) {
      const detail = await workerRes.text().catch(() => `${workerRes.status} ${workerRes.statusText}`);
      return Response.json({ error: `Render worker rejected the request: ${detail}` }, { status: workerRes.status, headers: CORS });
    }

    const data = await workerRes.json().catch(() => ({}));
    if (!data?.jobId) {
      return Response.json({ error: 'Render worker did not return a job id.' }, { status: 502, headers: CORS });
    }

    return Response.json({ jobId: data.jobId }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
