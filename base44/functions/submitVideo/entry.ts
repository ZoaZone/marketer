import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * submitVideo — server-side proxy that hands an AI per-scene video-
 * generation job off to the standalone render worker (server-render/,
 * deployed separately, e.g. on Railway — the same worker submitRender and
 * submitMusic use, just its /video endpoint) and returns the job id it
 * assigns.
 *
 * Mirrors submitMusic/entry.ts exactly: same Deno.serve handler shape, same
 * CORS/OPTIONS handling, same createClientFromRequest + base44.auth.me()
 * auth guard, same { error } shape on failure.
 *
 * The request body IS the video spec as-is ({ prompt, imageUrl,
 * durationSeconds, aspectRatio } — see server-render/video.js) — this
 * function doesn't interpret it, just forwards it to the worker with the
 * shared secret it needs to accept the job.
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
// could call this endpoint directly and bill the platform. Kling/Minimax bill per clip against the platform Replicate key.
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
    { error: 'Your plan does not include AI video generation.', code: 'upgrade_required', required_tiers: GENERATION_ENTITLED_TIERS },
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

// Defense-in-depth: the Kling model (server-render/video.js's primary
// model) only accepts these specific duration values and snaps to the
// nearest one itself before calling Replicate — this is a second,
// independent clamp at the proxy boundary, in case a caller bypasses the
// MovieMaker.jsx UI entirely. MiniMax (the fallback) has no duration
// parameter, so this is harmless if the job ends up on that model instead.
const VALID_CLIP_DURATIONS = [5, 10];
function snapToValidClipDuration(seconds: number): number {
  return VALID_CLIP_DURATIONS.reduce((closest, candidate) =>
    Math.abs(candidate - seconds) < Math.abs(closest - seconds) ? candidate : closest
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

    const workerUrl = Deno.env.get('RENDER_WORKER_URL')?.trim();
    const sharedSecret = Deno.env.get('RENDER_SHARED_SECRET')?.trim();
    if (!workerUrl || !sharedSecret) {
      return Response.json({ error: 'RENDER_WORKER_URL/RENDER_SHARED_SECRET is not configured.' }, { status: 500, headers: CORS });
    }

    const spec = await req.json().catch(() => ({}));
    if (spec && typeof spec.durationSeconds !== 'undefined') {
      spec.durationSeconds = snapToValidClipDuration(Number(spec.durationSeconds) || 5);
    }
    const entitled = await isByokEntitled(base44, user);
    const byok = entitled ? await buildByok(user.settings?.api_keys || {}, ['replicate']) : {};
    if (Object.keys(byok).length) spec.byok = byok;

    let workerRes: Response;
    try {
      workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}/video`, {
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
      // message, rather than a generic 500. Same code as submitRender's and
      // submitMusic's, since it's the same underlying worker.
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
