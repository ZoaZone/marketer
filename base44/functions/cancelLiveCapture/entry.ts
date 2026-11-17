import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cancelLiveCapture — closes a live login session the caller abandoned
 * (navigated away, clicked Cancel) without finishing, so the worker frees
 * its browser and concurrency slot immediately rather than waiting out the
 * full session timeout.
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

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body.sessionId !== 'string' || !body.sessionId.trim()) {
      return Response.json({ error: 'sessionId is required' }, { status: 400, headers: CORS });
    }

    const base = workerUrl.replace(/\/+$/, '');
    try {
      await fetch(`${base}/live/${encodeURIComponent(body.sessionId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-capture-secret': sharedSecret },
        body: JSON.stringify({}),
      });
    } catch (_networkError) {
      // Best-effort — the worker's own session timeout will clean it up
      // even if this particular request didn't land.
    }

    return Response.json({ ok: true }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
