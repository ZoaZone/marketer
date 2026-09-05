import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * generateMusic — server-side AI background-music generation proxy.
 *
 * Modeled on generateVoiceover/entry.ts: same Deno.serve handler shape,
 * same CORS/OPTIONS handling, same createClientFromRequest + base44.auth.me()
 * auth guard, and the same { success: true, audio_base64, mime } / { error }
 * response contract.
 *
 * This call is synchronous end-to-end, so whatever it does has to fit
 * inside Base44's function gateway timeout. The async job path
 * (submitMusic + getMusicStatus, running on server-render/) is what the
 * frontend actually uses and is the right place for a long generation;
 * this endpoint stays as a direct, single-request alternative and keeps a
 * duration clamp tight enough to finish inside the gateway window.
 *
 * Provider is selected by MUSIC_PROVIDER (defaults to "elevenlabs"):
 *   - "elevenlabs" (default): ElevenLabs Music, POST /v1/music. A single
 *     request that returns the finished audio bytes — no prediction to
 *     create, poll and then re-download, which is what made the Replicate
 *     path a poor fit for a gated synchronous function in the first place.
 *     It also synthesizes vocals, so `instrumental`/`lyrics` below are
 *     finally honoured rather than accepted and ignored.
 *   - "replicate": MusicGen (or whichever model REPLICATE_MUSIC_MODEL
 *     names). Kept as a fallback so a deployment can switch back with an
 *     env var. Instrumental-only.
 *   - "suno": falls through to "elevenlabs" here. The third-party Suno
 *     path exists only on the async worker (server-render/music.js), where
 *     a full ~2-4 minute song has room to render; it could never complete
 *     inside this gated synchronous call. ElevenLabs sings too, so a
 *     deployment set to "suno" still gets vocals from this endpoint rather
 *     than the error the old stub threw.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Poll every ~1s, give up after ~12s total. This budget is intentionally
// short — see the module docstring above: the whole function (create +
// poll + download) has to fit inside Base44's function gateway timeout
// (target ≤ ~15s end-to-end), so there's no room for a generous poll
// window here the way server-render/'s worker (a long-running process, not
// a gated function call) can afford.
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 12_000;

// MusicGen (and most Replicate audio models) reject durations outside a
// fairly narrow window; separately, the clip itself must stay short so
// generation has a realistic chance of finishing inside the gateway
// timeout above (generation time scales with requested audio length).
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;

// ElevenLabs accepts 3s–600s per request, but this endpoint is still
// synchronous and still gated, so the cap here is about the gateway
// window, not the provider's limit. Callers that want a full-length score
// use submitMusic (the async worker job), which clamps to the provider's
// real 600s ceiling instead.
const EL_MIN_DURATION_SECONDS = 3;
const EL_MAX_DURATION_SECONDS = 30;
const EL_DEFAULT_MODEL_ID = 'music_v1';
const EL_DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';

interface GenerateMusicBody {
  prompt?: string;
  durationSeconds?: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  lyrics?: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Combines genre/mood/prompt into one descriptive text prompt — both
// providers take a single free-text description, not structured fields.
// `instrumental`/`lyrics` are handled separately per provider: ElevenLabs
// takes a `force_instrumental` flag and can sing supplied lyrics (see
// generateWithElevenLabs), while MusicGen has no vocal synthesis at all and
// is instrumental-only no matter what's asked for.
function buildPromptText(body: GenerateMusicBody): string {
  const genre = body.genre?.trim();
  const mood = body.mood?.trim() || 'cinematic';
  const prompt = body.prompt?.trim() || '';
  const segments = [genre ? `${genre} film score` : null, mood, prompt || null].filter(
    (s): s is string => !!s
  );
  return segments.join(', ') || 'cinematic instrumental background music';
}

function clampDuration(
  seconds: number | undefined,
  min = MIN_DURATION_SECONDS,
  max = MAX_DURATION_SECONDS,
): number {
  const n = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 10;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// MUSIC_PROVIDER, normalized for THIS endpoint. "suno" maps to
// "elevenlabs" — see the module docstring: the Suno path is worker-only,
// and ElevenLabs covers the same vocal case within the gateway window.
function resolveProvider(): string {
  const raw = Deno.env.get('MUSIC_PROVIDER')?.trim().toLowerCase() || '';
  if (!raw || raw === 'suno') return 'elevenlabs';
  return raw;
}

/* ── Replicate provider ────────────────────────────────────────────────
 * Docs: https://replicate.com/docs/reference/http#predictions.create
 * Two ways to create a prediction, depending on how REPLICATE_MUSIC_MODEL
 * is set:
 *   - "owner/model" (no version hash, e.g. the default "meta/musicgen") —
 *     use the model-by-name endpoint, POST /v1/models/{owner}/{model}/predictions.
 *     This always runs that model's latest pushed version, so nothing needs
 *     to be pinned or updated when the model owner ships a new version.
 *   - "owner/model:versionhash" — an explicit version is pinned, so this
 *     falls back to the generic POST /v1/predictions with a `version` field,
 *     which is the only endpoint that accepts an explicit version hash.
 * ──────────────────────────────────────────────────────────────────────── */

async function createReplicatePrediction(
  model: string,
  token: string,
  promptText: string,
  duration: number
): Promise<any> {
  const input = {
    prompt: promptText,
    // meta/musicgen-specific input: selects the stereo, large-parameter
    // variant of the model for the best output quality this endpoint
    // offers. Other Replicate music models may not recognize this field —
    // if REPLICATE_MUSIC_MODEL is pointed at a different model, this input
    // schema may need to change to match.
    model_version: 'stereo-large',
    duration,
    output_format: 'mp3',
  };

  const versionHashIndex = model.indexOf(':');
  const hasVersionHash = versionHashIndex !== -1;

  const url = hasVersionHash
    ? 'https://api.replicate.com/v1/predictions'
    : `https://api.replicate.com/v1/models/${model}/predictions`;

  const body = hasVersionHash
    ? { version: model.slice(versionHashIndex + 1), input }
    : { input };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Replicate prediction creation failed: ${detail}`);
  }
  return res.json();
}

async function pollReplicatePrediction(prediction: any, token: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let current = prediction;

  while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled') {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for Replicate music generation to finish.');
    }
    await sleep(POLL_INTERVAL_MS);

    // Prefer the prediction's own `urls.get` (returned by the create call)
    // over reconstructing the polling URL ourselves — it's the URL
    // Replicate actually wants used, and stays correct even if their API
    // routing changes.
    const pollUrl = current.urls?.get || `https://api.replicate.com/v1/predictions/${current.id}`;
    const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      const detail = await pollRes.text().catch(() => `${pollRes.status} ${pollRes.statusText}`);
      throw new Error(`Replicate polling failed: ${detail}`);
    }
    current = await pollRes.json();
  }

  if (current.status !== 'succeeded') {
    // Surface Replicate's own error text verbatim — e.g. a "you must
    // purchase credit to continue" billing error should reach the caller
    // exactly as Replicate phrased it, not a generic "generation failed".
    const providerMessage = current.error ? String(current.error) : 'no further detail from the provider';
    throw new Error(`Replicate generation ${current.status}: ${providerMessage}`);
  }

  return current;
}

async function generateWithReplicate(body: GenerateMusicBody): Promise<{ audio_base64: string; mime: string }> {
  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token?.trim()) {
    throw new Error('REPLICATE_API_TOKEN is not configured.');
  }
  const model = Deno.env.get('REPLICATE_MUSIC_MODEL')?.trim() || 'meta/musicgen';

  const promptText = buildPromptText(body);
  const duration = clampDuration(body.durationSeconds);

  const created = await createReplicatePrediction(model, token, promptText, duration);
  const finished = await pollReplicatePrediction(created, token);

  // MusicGen returns either a single audio URL string or an array of URLs
  // (one per requested variant) — take the first either way.
  const output = finished.output;
  const audioUrl = Array.isArray(output) ? output[0] : output;
  if (!audioUrl || typeof audioUrl !== 'string') {
    throw new Error('Replicate finished successfully but returned no audio URL.');
  }

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download generated audio (${audioRes.status} ${audioRes.statusText})`);
  }
  const mime = audioRes.headers.get('content-type') || 'audio/mpeg';
  const bytes = new Uint8Array(await audioRes.arrayBuffer());
  return { audio_base64: toBase64(bytes), mime };
}

/* ── ElevenLabs provider (default) ─────────────────────────────────────
 * POST https://api.elevenlabs.io/v1/music?output_format=<fmt>
 *   headers: xi-api-key, Content-Type: application/json
 *   body:    { prompt, music_length_ms, model_id, force_instrumental }
 *   returns: raw audio bytes — no JSON envelope, no prediction to poll
 * ──────────────────────────────────────────────────────────────────── */

async function generateWithElevenLabs(
  body: GenerateMusicBody
): Promise<{ audio_base64: string; mime: string }> {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey?.trim()) {
    throw new Error('ELEVENLABS_API_KEY is not configured.');
  }

  const modelId = Deno.env.get('ELEVENLABS_MUSIC_MODEL_ID')?.trim() || EL_DEFAULT_MODEL_ID;
  const outputFormat =
    Deno.env.get('ELEVENLABS_MUSIC_OUTPUT_FORMAT')?.trim() || EL_DEFAULT_OUTPUT_FORMAT;
  const seconds = clampDuration(body.durationSeconds, EL_MIN_DURATION_SECONDS, EL_MAX_DURATION_SECONDS);

  // Lyrics only mean anything when vocals were actually asked for; a score
  // meant to sit under narration stays instrumental so it doesn't fight the
  // voiceover, which is why `force_instrumental` defaults to true.
  const basePrompt = buildPromptText(body);
  const lyrics = body.lyrics?.trim();
  const promptText =
    body.instrumental === false && lyrics
      ? `${basePrompt}\n\nSing the following lyrics:\n${lyrics}`
      : basePrompt;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        prompt: promptText,
        music_length_ms: seconds * 1000,
        model_id: modelId,
        force_instrumental: body.instrumental !== false,
      }),
    }
  );

  if (!res.ok) {
    // Surface ElevenLabs' own error text verbatim. Its music endpoint
    // returns a structured, actionable reason for the failures a user can
    // do something about — `bad_prompt` (the prompt named a real artist or
    // quoted copyrighted lyrics, and the body carries a `prompt_suggestion`)
    // and quota exhaustion — so collapsing it to "generation failed" would
    // throw away the only useful part.
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`ElevenLabs music generation failed (${res.status}): ${detail}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) {
    throw new Error('ElevenLabs returned an empty audio response.');
  }
  return { audio_base64: toBase64(bytes), mime: res.headers.get('content-type') || 'audio/mpeg' };
}

/* ── Handler ──────────────────────────────────────────────────────────── */

// COST GATE. Music generation bills per run against a platform provider key (ElevenLabs by default, Replicate when MUSIC_PROVIDER says so). Matches submitMusic so the sync and async paths cannot disagree.
// Added because this endpoint authenticated the caller but never checked what
// their plan actually included — any signed-in user could bill the platform.
const MUSIC_ENTITLED_TIERS = ["byok","indie","studio","dubbing_house","enterprise","agency"];
async function assertEntitled(base44: any, user: any): Promise<Response | null> {
  if (user.role === 'admin') return null;
  const subs = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  const ok = !!sub && ['active', 'trialing'].includes(sub.status) && MUSIC_ENTITLED_TIERS.includes(sub.plan_tier);
  if (ok) return null;
  return Response.json(
    { error: 'Your plan does not include AI music generation.', code: 'upgrade_required', required_tiers: MUSIC_ENTITLED_TIERS },
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

    const body = (await req.json().catch(() => ({}))) as GenerateMusicBody;

    const provider = resolveProvider();

    // Fail on a missing key before metering charges for the run — a job
    // that cannot possibly reach a provider must not cost the caller an
    // allowance unit.
    if (provider === 'replicate' && !Deno.env.get('REPLICATE_API_TOKEN')?.trim()) {
      return Response.json({ error: 'REPLICATE_API_TOKEN is not configured.' }, { status: 500, headers: CORS });
    }
    if (provider !== 'replicate' && !Deno.env.get('ELEVENLABS_API_KEY')?.trim()) {
      return Response.json({ error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 500, headers: CORS });
    }

    // SPEND CEILING. One generation run per call, on the platform key.
    // Charged before the provider is called, never after — metering a job
    // once the money has already been spent is not a ceiling.
    {
      const overBudget = await meterUsage(base44, user, 'music_track', 1, { provider });
      if (overBudget) return overBudget;
    }

    const result = provider === 'replicate'
      ? await generateWithReplicate(body)
      : await generateWithElevenLabs(body);

    return Response.json(
      { success: true, audio_base64: result.audio_base64, mime: result.mime || 'audio/mpeg' },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
