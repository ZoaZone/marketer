import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * finishLiveCapture — tells the capture worker the caller has finished
 * logging in during their live session. The worker exports that session's
 * cookies/localStorage (never a password — none was ever collected),
 * closes the interactive browser, and queues the real recorded walkthrough
 * against the now-authenticated session (server-capture/index.js's
 * POST /live/:id/finish). Returns { captureId } — poll it with the
 * existing getCaptureStatus function exactly like any other capture.
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
    if (!body.token || typeof body.token !== 'string') {
      return Response.json({ error: 'token is required' }, { status: 400, headers: CORS });
    }

    let plan;
    if (body.plan !== undefined) {
      if (!Array.isArray(body.plan) || !body.plan.length) {
        return Response.json({ error: 'plan, if provided, must be a non-empty array of steps.' }, { status: 400, headers: CORS });
      }
      plan = body.plan;
    }

    const base = workerUrl.replace(/\/+$/, '');
    let workerRes: Response;
    try {
      workerRes = await fetch(`${base}/live/${encodeURIComponent(body.sessionId)}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-capture-secret': sharedSecret },
        body: JSON.stringify({ token: body.token, plan }),
      });
    } catch (_networkError) {
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
