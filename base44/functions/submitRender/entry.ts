import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * submitRender — server-side proxy that hands a movie project off to the
 * standalone render worker (server-render/, deployed separately, e.g. on
 * Railway) and returns the job id it assigns.
 *
 * Modeled on generateVoiceover/entry.ts: same Deno.serve handler shape,
 * same CORS/OPTIONS handling, same createClientFromRequest +
 * base44.auth.me() auth guard, same { error } shape on failure.
 *
 * The request body IS the project JSON as-is (title/ratio/titleCard/
 * scenes/musicUrl — see server-render/render.js for the schema) — this
 * function doesn't interpret it, just forwards it to the worker with the
 * shared secret it needs to accept the job.
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

    const project = await req.json().catch(() => ({}));

    let workerRes: Response;
    try {
      workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-render-secret': sharedSecret,
        },
        body: JSON.stringify(project),
      });
    } catch (_networkError) {
      // The worker being unreachable (cold start, deploy in progress, host
      // down) is a distinct, expected failure mode — return a specific
      // error code the frontend can key off of to show a friendly retry
      // message, rather than a generic 500.
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
