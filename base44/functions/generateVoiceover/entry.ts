import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * generateVoiceover — server-side TTS proxy.
 *
 * This handler preserves the existing frontend contract while switching the
 * audio generation backend to ElevenLabs. It accepts a JSON body with text,
 * lang, and an optional voiceId, then renders the narration in ~2500-character
 * chunks so longer scenes can be converted without the earlier Google TTS
 * limits.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_CHARS = 20000;
const CHUNK_CHARS = 2500;
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
// eleven_turbo_v2_5 reads more naturally (better prosody) and generates
// faster than eleven_multilingual_v2, at a small quality tradeoff on some
// non-English languages — still overridable via ELEVENLABS_MODEL_ID.
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';
// Baseline voice delivery. Lower stability + a non-zero `style` value lets
// the model vary intonation instead of reading in a flat monotone; raised
// similarity_boost keeps it close to the source voice despite that added
// expressiveness. `stability` and `style` can be overridden per request
// (see voiceSettings below); similarity_boost/use_speaker_boost are not
// exposed per-call since they rarely need tuning per narration.
const DEFAULT_VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };
// Note: ElevenLabs has no direct `speaking_rate`/speed parameter on this
// endpoint today — pacing is controlled by `stability`/`style` and by the
// text itself (punctuation, sentence length). If ElevenLabs adds a speed
// control to the TTS API later, it would go here alongside voice_settings.

function chunkText(text: string, maxLen = CHUNK_CHARS): string[] {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) return [];

  const sentences = normalizedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence) continue;

    if (sentence.length > maxLen) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }

      const words = sentence.split(/\s+/);
      let longChunk = '';
      for (const word of words) {
        const candidate = longChunk ? `${longChunk} ${word}` : word;
        if (candidate.length > maxLen && longChunk) {
          chunks.push(longChunk.trim());
          longChunk = word;
        } else {
          longChunk = candidate;
        }
      }
      if (longChunk.trim()) {
        current = longChunk.trim();
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// COST GATE. ElevenLabs TTS bills per character against the platform key. Every paid plan lists voiceover, so this allows any active subscription and blocks only tier-less/free accounts.
// Added because this endpoint authenticated the caller but never checked what
// their plan actually included — any signed-in user could bill the platform.
const VOICEOVER_ENTITLED_TIERS = ["creator","starter","growth","agency","indie","studio","dubbing_house","enterprise","byok"];
async function assertEntitled(base44: any, user: any): Promise<Response | null> {
  if (user.role === 'admin') return null;
  const subs = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  // A user with no subscription at all is a free-trial user, and the signup
  // offer ("25 AI generations, no credit card") covers narration — without
  // this, Quick Create and the Demo Video maker both died with a 403 at the
  // voiceover step and a trial user could never finish a single video.
  // meterUsage below enforces and counts the trial; this gate only has to
  // stop stopping them. A user WITH a subscription still needs an entitled
  // tier, so a lapsed or unentitled plan is still refused here.
  const hasAnySub = !!sub && ['active', 'trialing'].includes(sub.status);
  if (!hasAnySub) return null;
  const ok = VOICEOVER_ENTITLED_TIERS.includes(sub.plan_tier);
  if (ok) return null;
  return Response.json(
    { error: 'Your plan does not include AI voiceover.', code: 'upgrade_required', required_tiers: VOICEOVER_ENTITLED_TIERS },
    { status: 403, headers: CORS },
  );
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

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey?.trim()) {
      return Response.json({ error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 500, headers: CORS });
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      lang?: string;
      voiceId?: string;
      stability?: number;
      style?: number;
    };
    const text = body.text?.trim() ?? '';
    if (!text) return Response.json({ error: 'text is required' }, { status: 400, headers: CORS });

    const limitedText = text.slice(0, MAX_CHARS);
    // Chunks are requested one at a time below, each a separate ElevenLabs
    // call — the brief gap between chunk boundaries already reads as a
    // natural pause once concatenated, so no extra silence needs to be
    // inserted between them at the audio level.
    const chunks = chunkText(limitedText, CHUNK_CHARS);
    if (!chunks.length) return Response.json({ error: 'No speakable text.' }, { status: 400, headers: CORS });

    // SPEND CEILING. ElevenLabs bills per character. One AI credit buys
    // 1,500 characters, so a long script costs proportionally more.
    {
      const overBudget = await meterUsage(
        base44, user, 'voiceover', Math.max(1, Math.ceil(limitedText.length / 1500)),
        { provider: 'elevenlabs' },
      );
      if (overBudget) return overBudget;
    }

    const voiceId = body.voiceId?.trim() || Deno.env.get('ELEVENLABS_DEFAULT_VOICE_ID')?.trim() || DEFAULT_VOICE_ID;
    const modelId = Deno.env.get('ELEVENLABS_MODEL_ID')?.trim() || DEFAULT_MODEL_ID;
    const voiceSettings = {
      ...DEFAULT_VOICE_SETTINGS,
      stability: typeof body.stability === 'number' ? body.stability : DEFAULT_VOICE_SETTINGS.stability,
      style: typeof body.style === 'number' ? body.style : DEFAULT_VOICE_SETTINGS.style,
    };

    const parts: Uint8Array[] = [];
    for (const chunk of chunks) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: chunk,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      });

      if (!response.ok) {
        let detail = `${response.status} ${response.statusText}`;
        try {
          const errorText = await response.text();
          if (errorText) detail = errorText;
        } catch {
          // Fall back to the status line if the error body cannot be read.
        }
        throw new Error(`ElevenLabs TTS failed for a chunk: ${detail}`);
      }

      const audioBytes = new Uint8Array(await response.arrayBuffer());
      if (audioBytes.byteLength) parts.push(audioBytes);
    }

    const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    return Response.json(
      { success: true, audio_base64: toBase64(merged), mime: 'audio/mpeg' },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
