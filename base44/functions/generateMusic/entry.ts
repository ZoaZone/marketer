import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * generateMusic — server-side AI background-music generation proxy.
 *
 * Modeled on generateVoiceover/entry.ts: same Deno.serve handler shape,
 * same CORS/OPTIONS handling, same createClientFromRequest + base44.auth.me()
 * auth guard, and the same { success: true, audio_base64, mime } / { error }
 * response contract.
 *
 * Music generation is long-running, and this function call is synchronous
 * end-to-end (create prediction, poll it, download the audio, return it) —
 * it has to fit inside Base44's function gateway timeout, which is much
 * shorter than MusicGen generation can take for a long clip. The duration
 * clamp below is deliberately tight (≤ ~15s of audio) specifically so a
 * generation is likely to finish inside that gateway window; this is a
 * stopgap, not a real fix for the underlying constraint.
 *
 * Option B (proper, later): convert this to the same async job pattern as
 * the render worker (server-render/) — a submit endpoint that starts the
 * Replicate prediction and returns a job id immediately, plus a separate
 * poll endpoint — so a long generation never has to complete inside a
 * single synchronous request. Not implemented yet; the tight duration
 * clamp is the interim workaround.
 *
 * Provider is selected by MUSIC_PROVIDER (defaults to "replicate" if unset):
 *   - "replicate": MusicGen (or whichever model REPLICATE_MUSIC_MODEL names)
 *     on Replicate. This is the only implemented path today.
 *   - "suno": stubbed — throws a clear "not yet configured" error. Suno has
 *     no official public API as of writing; this branch exists so the
 *     provider abstraction is ready to fill in if/when that changes,
 *     without having to guess at undocumented endpoints in the meantime.
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

// Combines genre/mood/prompt into one descriptive text prompt — MusicGen
// takes a single free-text description, not structured fields.
// `instrumental` and `lyrics` are accepted in the request body for API
// contract completeness (and so a future vocal-capable provider, e.g. a
// real Suno integration, has something to key off of) but are not used
// building this Replicate/MusicGen request: MusicGen has no vocal synthesis,
// so it's instrumental-only regardless of what's asked for here.
function buildPromptText(body: GenerateMusicBody): string {
  const genre = body.genre?.trim();
  const mood = body.mood?.trim() || 'cinematic';
  const prompt = body.prompt?.trim() || '';
  const segments = [genre ? `${genre} film score` : null, mood, prompt || null].filter(
    (s): s is string => !!s
  );
  return segments.join(', ') || 'cinematic instrumental background music';
}

function clampDuration(seconds: number | undefined): number {
  const n = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 10;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(n)));
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

/* ── Suno provider (stub) ─────────────────────────────────────────────── */

async function generateWithSuno(_body: GenerateMusicBody): Promise<{ audio_base64: string; mime: string }> {
  throw new Error('Suno provider not yet configured');
}

/* ── Handler ──────────────────────────────────────────────────────────── */

// COST GATE. MusicGen bills per generation against the platform Replicate key. Matches submitMusic so the sync and async paths cannot disagree.
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

    const body = (await req.json().catch(() => ({}))) as GenerateMusicBody;

    const provider = (Deno.env.get('MUSIC_PROVIDER')?.trim().toLowerCase()) || 'replicate';

    if (provider === 'replicate' && !Deno.env.get('REPLICATE_API_TOKEN')?.trim()) {
      return Response.json({ error: 'REPLICATE_API_TOKEN is not configured.' }, { status: 500, headers: CORS });
    }

    // SPEND CEILING. One generation run per call, on the platform key.
    // Charged before the provider is called, never after — metering a job
    // once the money has already been spent is not a ceiling.
    {
      const overBudget = await meterUsage(base44, user, 'music_track', 1, { provider });
      if (overBudget) return overBudget;
    }

    const result = provider === 'suno' ? await generateWithSuno(body) : await generateWithReplicate(body);

    return Response.json(
      { success: true, audio_base64: result.audio_base64, mime: result.mime || 'audio/mpeg' },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
