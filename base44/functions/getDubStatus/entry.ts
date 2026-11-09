import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getDubStatus — polls the standalone render worker for a dubbing job's
 * current status, on behalf of the frontend (which never talks to the
 * worker or its shared secret directly).
 *
 * Mirrors getVideoStatus/entry.ts exactly: same Deno.serve handler shape,
 * same CORS/OPTIONS handling, same createClientFromRequest +
 * base44.auth.me() auth guard, same { error } shape on failure. The job
 * record shape is identical to a render/music/video job's — GET /jobs/:id
 * on the worker is shared by all job kinds — plus captionsUrl, which is
 * only ever non-null for a dub-video job that requested burnCaptions.
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

    const workerUrl = Deno.env.get('RENDER_WORKER_URL')?.trim();
    const sharedSecret = Deno.env.get('RENDER_SHARED_SECRET')?.trim();
    if (!workerUrl || !sharedSecret) {
      return Response.json({ error: 'RENDER_WORKER_URL/RENDER_SHARED_SECRET is not configured.' }, { status: 500, headers: CORS });
    }

    const { jobId } = await req.json().catch(() => ({}));
    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400, headers: CORS });

    let workerRes: Response;
    try {
      workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}/jobs/${encodeURIComponent(jobId)}`, {
        headers: { 'x-render-secret': sharedSecret },
      });
    } catch (_networkError) {
      return Response.json({ error: 'render_worker_unreachable' }, { status: 502, headers: CORS });
    }

    if (workerRes.status === 404) {
      return Response.json({ error: 'Job not found' }, { status: 404, headers: CORS });
    }
    if (!workerRes.ok) {
      const detail = await workerRes.text().catch(() => `${workerRes.status} ${workerRes.statusText}`);
      return Response.json({ error: `Render worker error: ${detail}` }, { status: workerRes.status, headers: CORS });
    }

    const job = await workerRes.json().catch(() => ({}));
    return Response.json(
      { status: job.status, progress: job.progress, url: job.url, captionsUrl: job.captionsUrl, error: job.error },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
