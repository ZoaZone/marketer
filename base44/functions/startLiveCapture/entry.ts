import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { captureWorkerAuthError } from '../../shared/captureWorkerAuth.ts';

/**
 * startLiveCapture — opens a live, interactive capture session on the
 * capture worker: a real headless browser the caller will see (as polled
 * JPEG frames) and control (via relayed clicks/keystrokes) to log into
 * their own site themselves. No username, password, or other credential
 * is ever sent to or through this function, or stored by the worker — the
 * person logs in exactly as they would in any browser tab; this just
 * relays where their input lands.
 *
 * Returns { sessionId, token, frameUrl, inputUrl, expiresInSeconds }.
 * frameUrl/inputUrl are the worker's own public endpoints with `token`
 * already appended as a query/body value the frontend can call directly —
 * CAPTURE_SHARED_SECRET itself never leaves this function, only the
 * session-scoped token the worker minted for this one session (see
 * server-capture/index.js's /live/start).
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
    if (!body || typeof body.url !== 'string' || !body.url.trim()) {
      return Response.json({ error: 'url is required' }, { status: 400, headers: CORS });
    }

    const base = workerUrl.replace(/\/+$/, '');
    let workerRes: Response;
    try {
      workerRes = await fetch(`${base}/live/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-capture-secret': sharedSecret },
        body: JSON.stringify({ url: body.url, userId: user.email }),
      });
    } catch (_networkError) {
      return Response.json({ error: 'capture_worker_unreachable' }, { status: 502, headers: CORS });
    }

    if (workerRes.status === 401) return captureWorkerAuthError(CORS);
    if (!workerRes.ok) {
      const detail = await workerRes.text().catch(() => `${workerRes.status} ${workerRes.statusText}`);
      return Response.json({ error: `Capture worker rejected the request: ${detail}` }, { status: workerRes.status, headers: CORS });
    }

    const data = await workerRes.json().catch(() => ({}));
    if (!data?.sessionId || !data?.token) {
      return Response.json({ error: 'Capture worker did not return a live session.' }, { status: 502, headers: CORS });
    }

    return Response.json(
      {
        sessionId: data.sessionId,
        token: data.token,
        frameUrl: `${base}/live/${encodeURIComponent(data.sessionId)}/frame?token=${encodeURIComponent(data.token)}`,
        inputUrl: `${base}/live/${encodeURIComponent(data.sessionId)}/input`,
        cancelUrl: `${base}/live/${encodeURIComponent(data.sessionId)}/cancel`,
        expiresInSeconds: data.expiresInSeconds,
      },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});