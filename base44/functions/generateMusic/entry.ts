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

    const result = provider === 'suno' ? await generateWithSuno(body) : await generateWithReplicate(body);

    return Response.json(
      { success: true, audio_base64: result.audio_base64, mime: result.mime || 'audio/mpeg' },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
