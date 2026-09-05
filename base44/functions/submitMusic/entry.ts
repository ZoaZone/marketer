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
 * instrumental, lyrics, genre, mood, title, model_version } — see
 * server-render/music.js) — this function forwards it to the worker with
 * the shared secret it needs to accept the job, adding only a duration
 * clamp and the BYOK credentials. `byok` is the one field this function
 * supplies itself (see buildByok below); a caller-supplied `byok` is not
 * trusted or forwarded.
 *
 * The worker picks the provider for real; pickProvider below mirrors that
 * resolution exactly so this function can charge the right metering `kind`
 * (a vocal song costs 1 RM, an instrumental 0.25 RM) BEFORE the job runs.
 * The two must never disagree about what will run — see pickProvider's
 * note.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ElevenLabs Music's own limits (3s–600s per request). The worker clamps
// again per provider — the Replicate fallback's usable range is far
// narrower — so this is only the outer bound on what a browser can ask a
// single charged run to spend.
const MIN_DURATION_SECONDS = 3;
const MAX_DURATION_SECONDS = 600;

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

async function buildByok(apiKeys: any, fields: Array<'replicate' | 'elevenlabs' | 'suno'>): Promise<Record<string, string>> {
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
      if (field === 'suno') byok.sunoApiKey = plain;
    } catch (_) { /* ignore — fall back to platform key */ }
  }
  return byok;
}

/**
 * Which music provider the worker will actually use for this spec.
 *
 * MUST mirror pickProvider() in server-render/music.js. A Base44 function
 * deployment cannot import from the worker, so this is a hand-kept copy —
 * if the two drift, this function charges for one provider while a
 * different one runs, which is exactly how a BYOK user ends up billed for
 * a job their own key paid for.
 *
 *   1. Vocals requested + MUSIC_PROVIDER=suno + a Suno key -> "suno".
 *   2. An ElevenLabs key -> "elevenlabs" (covers instrumental and vocals
 *      alike, and is preferred for a vocals request even under
 *      MUSIC_PROVIDER=replicate, because MusicGen cannot sing).
 *   3. Otherwise -> "replicate", instrumental-only.
 */
function pickProvider(spec: any, byok: Record<string, string>): string {
  const wantsVocals = spec?.instrumental === false;
  const configured = Deno.env.get('MUSIC_PROVIDER')?.trim().toLowerCase() || 'elevenlabs';
  const sunoKey = byok.sunoApiKey || Deno.env.get('SUNO_API_KEY')?.trim();
  const elevenLabsKey = byok.elevenLabsKey || Deno.env.get('ELEVENLABS_API_KEY')?.trim();

  if (wantsVocals && configured === 'suno' && sunoKey) return 'suno';
  if (elevenLabsKey && (configured !== 'replicate' || wantsVocals)) return 'elevenlabs';
  return 'replicate';
}

/* ── Music brief: Base44 InvokeLLM (default) -> OpenAI -> verbatim ─────
 *
 * The provider chain for the AUDIO itself is ElevenLabs/Suno/Replicate —
 * those are the only ones that can render audio at all. Base44's InvokeLLM
 * and OpenAI's chat models produce text, so they cannot be music providers;
 * what they can do, and what this does, is turn the caller's thin request
 * ("Thriller film score, cinematic, matching: <story>") into a specific
 * musical brief — instrumentation, tempo, key, arrangement, production
 * feel — which is exactly the kind of prompt ElevenLabs Music renders well
 * and the kind a UI form cannot produce on its own.
 *
 * So the order the platform asked for holds, with each stage doing the part
 * it is actually capable of:
 *   1. Base44 InvokeLLM  — the default, and what AI Credits buy.
 *   2. OpenAI            — fallback when Base44's AI is unavailable.
 *   3. ElevenLabs        — renders the brief into audio (see the worker).
 *
 * Deliberately best-effort and NOT separately metered: it is one small
 * prompt-shaping call folded into a music run the caller is already charged
 * for, and double-charging one user action would be worse than absorbing
 * it. Any failure — quota, outage, a malformed response — returns null and
 * the caller's own prompt is used verbatim, so this can only ever improve a
 * generation, never block one. Set MUSIC_BRIEF_LLM=off to skip it entirely.
 * ──────────────────────────────────────────────────────────────────── */

const BRIEF_MAX_CHARS = 600;

function buildBriefInstruction(spec: any): string {
  const facets = [
    spec?.genre ? `Genre: ${spec.genre}` : null,
    spec?.mood ? `Mood: ${spec.mood}` : null,
    spec?.durationSeconds ? `Length: about ${spec.durationSeconds} seconds` : null,
    spec?.instrumental === false ? 'This is a sung song with vocals.' : 'Instrumental only — no vocals.',
  ].filter(Boolean).join('\n');

  return [
    'You are writing a prompt for a text-to-music model. Turn the request below into ONE vivid,',
    'concrete paragraph describing the music: instrumentation, tempo/BPM, key or tonality,',
    'arrangement and how it develops, and production feel.',
    '',
    'Rules:',
    `- Under ${BRIEF_MAX_CHARS} characters. Plain prose, no headings, no lists, no preamble.`,
    '- Describe only the music. Do not write lyrics, and do not restate these instructions.',
    '- Never name a real artist, band, or song — text-to-music models reject prompts that do.',
    '',
    facets,
    '',
    `Request: ${spec?.prompt || 'background music'}`,
  ].join('\n');
}

function sanitizeBrief(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < 20) return null; // an empty or one-word reply is not a brief
  return text.replace(/\s+/g, ' ').slice(0, BRIEF_MAX_CHARS);
}

async function composeMusicBrief(base44: any, spec: any): Promise<string | null> {
  if (Deno.env.get('MUSIC_BRIEF_LLM')?.trim().toLowerCase() === 'off') return null;
  if (!spec?.prompt?.trim()) return null;

  const instruction = buildBriefInstruction(spec);

  // 1. Base44 InvokeLLM — the platform default.
  try {
    const result = await base44.integrations.Core.InvokeLLM({ prompt: instruction });
    const brief = sanitizeBrief(result);
    if (brief) return brief;
  } catch (_baseError) { /* fall through to OpenAI */ }

  // 2. OpenAI — fallback when Base44's built-in AI is unavailable.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: instruction }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return sanitizeBrief(data?.choices?.[0]?.message?.content);
  } catch (_openaiError) {
    // 3. Neither LLM answered — the worker renders the caller's own prompt.
    return null;
  }
}

// COST GATE. isByokEntitled below only decides WHOSE api key pays; it never
// gated access, so before this any authenticated user — free tier included —
// could call this endpoint directly and bill the platform. Music generation bills per run against a platform provider key (ElevenLabs by default; Replicate or Suno when MUSIC_PROVIDER and the available keys say so — see pickProvider above).
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

    const spec = await req.json().catch(() => ({}));

    // Clamp here as well as in the worker: durationSeconds arrives straight
    // from the browser, and one run is charged the same whether it asks for
    // 30 seconds or ten minutes of provider time.
    if (spec.durationSeconds !== undefined) {
      const n = Number(spec.durationSeconds);
      spec.durationSeconds = Number.isFinite(n) && n > 0
        ? Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(n)))
        : undefined;
    }

    const entitled = await isByokEntitled(base44, user);
    // All three providers' keys are forwarded; which one the worker
    // actually reaches for is decided by pickProvider below (and, for real,
    // by the identical resolution in server-render/music.js).
    const byok = entitled
      ? await buildByok(user.settings?.api_keys || {}, ['replicate', 'elevenlabs', 'suno'])
      : {};
    if (Object.keys(byok).length) spec.byok = byok;

    const provider = pickProvider(spec, byok);
    // Vocals are only actually produced by Suno, or by ElevenLabs when
    // vocals were asked for. MusicGen cannot sing at all, so a vocals
    // request that lands there is charged — and reported — as the
    // instrumental it will be.
    const producesVocals = provider === 'suno' || (provider === 'elevenlabs' && spec?.instrumental === false);

    // SPEND CEILING. One generation run per submission, charged as the
    // vocal-song kind (1 RM) or the instrumental kind (0.25 RM) according
    // to what will actually run.
    //
    // `usedOwnKey` reads the field buildByok actually sets — replicateToken
    // / elevenLabsKey / sunoApiKey — and only the one paying for THIS run.
    // It used to read `byok.replicateKey`, which buildByok never writes, so
    // it was permanently false and every BYOK user was charged Render
    // Minutes for jobs their own provider account had already paid for.
    const usedOwnKey =
      provider === 'suno' ? !!byok.sunoApiKey
      : provider === 'elevenlabs' ? !!byok.elevenLabsKey
      : !!byok.replicateToken;

    const overBudget = await meterUsage(
      base44, user,
      producesVocals ? 'music_vocal_track' : 'music_track', 1,
      { usedOwnKey, provider },
    );
    if (overBudget) return overBudget;

    // Enrich the prompt only once the run is entitled and paid for, so a
    // job that is about to be refused never spends an LLM call.
    const brief = await composeMusicBrief(base44, spec);
    if (brief) spec.prompt = brief;

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
