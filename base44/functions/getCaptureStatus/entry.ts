import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getCaptureStatus — polls the standalone capture worker for a capture
 * job's current status, on behalf of the frontend (which never talks to
 * the worker or its shared secret directly).
 *
 * Mirrors getRenderStatus/entry.ts's shape, but targets the capture
 * worker's own env vars/header/route (CAPTURE_WORKER_URL/
 * CAPTURE_SHARED_SECRET, x-capture-secret, GET /captures/:id) and forwards
 * the capture-specific fields the worker reports: stepIndex/stepTotal/
 * percent (granular walkthrough progress), durationSeconds and pageInfo
 * (only populated once status is "done"), hasCredentials (a safe boolean —
 * never the credentials themselves), and the extra "login_required"/
 * "login_failed" statuses the render worker's jobs never have (Phase 2 —
 * see server-capture/credentials.js).
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

    const { captureId } = await req.json().catch(() => ({}));
    if (!captureId) return Response.json({ error: 'captureId is required' }, { status: 400, headers: CORS });

    let workerRes: Response;
    try {
      workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}/captures/${encodeURIComponent(captureId)}`, {
        headers: { 'x-capture-secret': sharedSecret },
      });
    } catch (_networkError) {
      return Response.json({ error: 'capture_worker_unreachable' }, { status: 502, headers: CORS });
    }

    if (workerRes.status === 404) {
      return Response.json({ error: 'Capture not found' }, { status: 404, headers: CORS });
    }
    if (!workerRes.ok) {
      const detail = await workerRes.text().catch(() => `${workerRes.status} ${workerRes.statusText}`);
      return Response.json({ error: `Capture worker error: ${detail}` }, { status: workerRes.status, headers: CORS });
    }

    const job = await workerRes.json().catch(() => ({}));
    return Response.json(
      {
        status: job.status,
        stepIndex: job.stepIndex,
        stepTotal: job.stepTotal,
        percent: job.percent,
        videoUrl: job.videoUrl,
        durationSeconds: job.durationSeconds,
        pageInfo: job.pageInfo,
        hasCredentials: job.hasCredentials,
        error: job.error,
      },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
