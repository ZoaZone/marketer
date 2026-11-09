import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * submitCapture — server-side proxy that hands a page-walkthrough capture
 * job off to the standalone capture worker (server-capture/, deployed
 * separately from server-render/ — its own Railway service, own shared
 * secret) and returns the job id it assigns.
 *
 * Mirrors submitVideo/entry.ts's shape (same Deno.serve handler, same
 * CORS/OPTIONS handling, same createClientFromRequest + base44.auth.me()
 * auth guard, same { error } shape on failure) but targets the capture
 * worker's own env vars/header/route — it is not the same worker as
 * server-render, so RENDER_WORKER_URL/RENDER_SHARED_SECRET don't apply
 * here. No BYOK handling: capture doesn't call Replicate/ElevenLabs.
 *
 * The request body IS the capture spec as-is ({ url, plan?, credentials? }
 * — see server-capture/capture.js) — this function doesn't interpret it
 * beyond requiring a url, just forwards it to the worker with the shared
 * secret it needs to accept the job, stamping the caller's own user id
 * onto it first (spec.userId, overwriting anything the client sent) so the
 * worker's per-user rate limit and concurrency cap (see
 * server-capture/index.js) are keyed by a real, server-verified identity
 * rather than anything the client could spoof.
 *
 * credentials (Phase 2, optional — see server-capture/credentials.js) pass
 * through completely untouched: this function never logs the request body,
 * never stores it, and never echoes it back — it's forwarded over HTTPS
 * and the worker encrypts it (AES-256-GCM) the instant it arrives there.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const workerUrl = Deno.env.get('CAPTURE_WORKER_URL')?.trim();
    const sharedSecret = Deno.env.get('CAPTURE_SHARED_SECRET')?.trim();
    if (!workerUrl || !sharedSecret) {
      return Response.json({ error: 'CAPTURE_WORKER_URL/CAPTURE_SHARED_SECRET is not configured.' }, { status: 500, headers: CORS });
    }

    const spec = await req.json().catch(() => ({}));
    if (!spec || typeof spec.url !== 'string' || !spec.url.trim()) {
      return Response.json({ error: 'url is required' }, { status: 400, headers: CORS });
    }
    // Server-verified identity, not whatever (if anything) the client put
    // in the body — the worker's rate limiting/concurrency cap depend on
    // this actually being trustworthy.
    spec.userId = user.email;

    // Session-token injection: when the caller asks to use their own
    // session (useSessionToken: true), extract the access token from the
    // request's Authorization header and forward it to the capture worker
    // as authToken. The worker injects it into the headless browser's
    // localStorage, bypassing the login form entirely — this works for
    // Base44 apps that use OTP/magic-link auth, where password-based
    // performLogin can't succeed (the /auth/login endpoint returns 400).
    if (spec.useSessionToken) {
      const authHeader = req.headers.get('authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (token) {
        spec.authToken = token;
        delete spec.useSessionToken;
        // authToken takes precedence — clear any credentials.
        delete spec.credentials;
      }
    }

    let workerRes: Response;
    try {
      workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-capture-secret': sharedSecret,
        },
        body: JSON.stringify(spec),
      });
    } catch (_networkError) {
      // Same idea as submitVideo's render_worker_unreachable — a distinct,
      // expected failure mode (cold start, deploy in progress, host down)
      // the frontend can key off of for a friendly retry message.
      return Response.json({ error: 'capture_worker_unreachable' }, { status: 502, headers: CORS });
    }

    if (!workerRes.ok) {
      const detail = await workerRes.text().catch(() => `${workerRes.status} ${workerRes.statusText}`);
      return Response.json({ error: `Capture worker rejected the request: ${detail}` }, { status: workerRes.status, headers: CORS });
    }

    const data = await workerRes.json().catch(() => ({}));
    if (!data?.captureId) {
      return Response.json({ error: 'Capture worker did not return a capture id.' }, { status: 502, headers: CORS });
    }

    return Response.json({ captureId: data.captureId }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});