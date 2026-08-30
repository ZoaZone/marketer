import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncDubbingProject — reconcile a DubbingProject against the render worker.
 *
 * Polls every output's job, writes the results back onto the project row, and
 * rolls the per-output states up into the project status.
 *
 * The point of persisting this server-side rather than tracking it in the
 * browser: a feature-length batch outlives the tab that started it. Whoever
 * opens the project next — the same operator tomorrow, or a colleague — sees
 * real state, and the URLs are attached to the project rather than living only
 * in one client's memory.
 *
 * Body: { project_id: string }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Roll per-output states up into one project status. */
function rollUp(outputs: any[]): string {
  if (!outputs.length) return 'draft';
  const states = outputs.map((o) => o.status);
  if (states.some((s) => s === 'processing' || s === 'queued')) return 'processing';
  if (states.every((s) => s === 'failed')) return 'failed';
  // Mixed or all-done both land in 'review': a batch where some languages
  // succeeded still needs an operator to look before anything is delivered,
  // and calling that 'done' would overstate it.
  return 'review';
}

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

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400, headers: CORS });
    }

    const project = await base44.asServiceRole.entities.DubbingProject.get(project_id).catch(() => null);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404, headers: CORS });
    // asServiceRole bypasses RLS, so ownership is checked explicitly.
    if (project.owner_email !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const outputs = Array.isArray(project.outputs) ? [...project.outputs] : [];
    const base = workerUrl.replace(/\/+$/, '');
    let changed = false;

    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i];
      // Terminal states never need re-polling — and re-polling them would keep
      // hitting the worker for jobs whose records have already been cleaned up.
      if (!out?.job_id || ['done', 'failed', 'cancelled'].includes(out.status)) continue;

      try {
        const res = await fetch(`${base}/jobs/${encodeURIComponent(out.job_id)}`, {
          headers: { 'x-render-secret': sharedSecret },
        });

        if (res.status === 404) {
          // With the durable job store in place a 404 means the record really
          // is gone (cleaned up after retention), not that the worker
          // restarted. Treat it as terminal rather than polling forever.
          outputs[i] = { ...out, status: 'failed', error: 'The worker no longer has a record of this job.', finished_at: new Date().toISOString() };
          changed = true;
          continue;
        }
        if (!res.ok) continue; // transient — leave the row alone and retry next sync

        const job = await res.json().catch(() => null);
        if (!job) continue;

        const next: Record<string, unknown> = { ...out };
        if (typeof job.progress === 'number') next.progress = job.progress;
        // Carry the provider reference onto the project as soon as the worker
        // reports it: it is the handle that makes an interrupted multi-hour run
        // reattachable instead of re-billable.
        if (job.providerRef && !out.provider_ref) next.provider_ref = job.providerRef;

        if (job.status === 'done') {
          next.status = 'done';
          next.url = job.url || out.url;
          next.captions_url = job.captionsUrl || out.captions_url;
          next.progress = 1;
          next.finished_at = new Date().toISOString();
        } else if (job.status === 'error') {
          next.status = 'failed';
          next.error = String(job.error || 'Dubbing failed.').slice(0, 500);
          next.finished_at = new Date().toISOString();
        } else {
          next.status = job.status === 'queued' ? 'queued' : 'processing';
        }

        if (JSON.stringify(next) !== JSON.stringify(out)) {
          outputs[i] = next;
          changed = true;
        }
      } catch (_e) {
        // Network blip against the worker: leave this output untouched so the
        // next sync can pick it up. Never mark a job failed on a transport error.
        continue;
      }
    }

    const status = rollUp(outputs);
    if (changed || status !== project.status) {
      await base44.asServiceRole.entities.DubbingProject.update(project_id, { outputs, status });
    }

    return Response.json({
      project_id,
      status,
      outputs,
      // Convenience rollup so the UI doesn't recompute it.
      summary: {
        total: outputs.length,
        done: outputs.filter((o) => o.status === 'done').length,
        failed: outputs.filter((o) => o.status === 'failed').length,
        running: outputs.filter((o) => o.status === 'processing' || o.status === 'queued').length,
      },
    }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
