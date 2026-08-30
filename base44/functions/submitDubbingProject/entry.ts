import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * submitDubbingProject — batch entry point for commercial dubbing.
 *
 * One DubbingProject fans out to one render-worker job per target language.
 * Existing submitDubVideo/submitDubAudio stay as the single-shot path used by
 * Movie Maker; this is the multi-language, glossary-aware, cost-estimated
 * front door for studio work.
 *
 * Body: { project_id: string }
 *
 * Why the fan-out lives server-side rather than in the browser: a feature-length
 * batch runs for hours across several languages. Submitting from the client
 * meant a closed tab abandoned the remaining languages. Here the jobs are all
 * registered with the worker before the response returns, and the project row
 * carries every job_id, so progress survives the tab, the session and a
 * worker redeploy (see server-render/jobstore.js).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Commercial dubbing is a Studio / Dubbing House / Enterprise capability.
// Mirrors submitDubVideo's gate — the two must not disagree, or this endpoint
// becomes the way around that one.
const DUBBING_ENTITLED_TIERS = ['byok', 'studio', 'dubbing_house', 'enterprise'];

async function assertEntitled(base44: any, user: any): Promise<Response | null> {
  if (user.role === 'admin') return null;
  const subs = await base44.asServiceRole.entities.Subscription
    .filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  const ok = !!sub && ['active', 'trialing'].includes(sub.status)
    && DUBBING_ENTITLED_TIERS.includes(sub.plan_tier);
  if (ok) return null;
  return Response.json(
    { error: 'Your plan does not include commercial dubbing.', code: 'upgrade_required', required_tiers: DUBBING_ENTITLED_TIERS },
    { status: 403, headers: CORS },
  );
}

/**
 * Cost estimate.
 *
 * The per-minute rates are NOT hardcoded — provider pricing changes and a
 * wrong number printed next to a Submit button is worse than no number. Set
 * DUBBING_RATE_USD_PER_MINUTE (and optionally LIPSYNC_RATE_USD_PER_MINUTE) from
 * the current provider contract; with neither set, the estimate is omitted and
 * the UI says so rather than showing a fabricated figure.
 */
function estimateCostUsd(sourceSeconds: number, langCount: number, lipSync: boolean): number | null {
  const dubRate = Number(Deno.env.get('DUBBING_RATE_USD_PER_MINUTE') || '');
  if (!Number.isFinite(dubRate) || dubRate <= 0) return null;
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) return null;

  const minutes = sourceSeconds / 60;
  let total = minutes * dubRate * langCount;

  const lipRate = Number(Deno.env.get('LIPSYNC_RATE_USD_PER_MINUTE') || '');
  if (lipSync && Number.isFinite(lipRate) && lipRate > 0) {
    total += minutes * lipRate * langCount;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Glossary → provider translation guidance.
 *
 * ElevenLabs Dubbing has no first-class glossary parameter, so terminology is
 * enforced the only way available: as explicit instruction text attached to the
 * job. Entries scoped to a different target language are filtered out so a
 * Tamil rule never leaks into the Hindi run.
 */
function buildGlossaryPrompt(glossary: any[], targetLang: string): string {
  const rules = (glossary || []).filter(
    (g) => g?.term && (!g.target_lang || g.target_lang === targetLang),
  );
  if (!rules.length) return '';
  const lines = rules.map((g) =>
    g.do_not_translate
      ? `- "${g.term}": leave untranslated, exactly as written.`
      : `- "${g.term}": always render as "${g.translation || g.term}".`,
  );
  return `Terminology that must be applied consistently throughout:\n${lines.join('\n')}`;
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

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400, headers: CORS });
    }

    const project = await base44.asServiceRole.entities.DubbingProject.get(project_id).catch(() => null);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404, headers: CORS });
    }
    // Ownership is re-checked here even though RLS covers the entity: this
    // handler reads through asServiceRole, which bypasses RLS by design.
    if (project.owner_email !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const targets: string[] = Array.isArray(project.target_langs) ? project.target_langs.filter(Boolean) : [];
    if (!targets.length) {
      return Response.json({ error: 'The project has no target languages.' }, { status: 400, headers: CORS });
    }
    if (!project.source_url) {
      return Response.json({ error: 'The project has no source media.' }, { status: 400, headers: CORS });
    }
    // Re-submitting a running project would double-bill the source, which on a
    // feature-length film is expensive and silent. Block it explicitly.
    if (['queued', 'processing'].includes(project.status)) {
      return Response.json(
        { error: 'This project is already running. Wait for it to finish or cancel it first.', code: 'already_running' },
        { status: 409, headers: CORS },
      );
    }

    const isVideo = (project.source_kind || 'video') === 'video';
    const route = isVideo ? '/dub-video' : '/dub-audio';
    const lipSync = isVideo && !!project.lip_sync;

    const outputs: any[] = [];
    for (const targetLang of targets) {
      const glossaryPrompt = buildGlossaryPrompt(project.glossary, targetLang);

      const spec: Record<string, unknown> = {
        sourceUrl: project.source_url,
        targetLang,
        sourceLang: project.source_lang || undefined,
        numSpeakers: project.num_speakers || undefined,
        // The entity stores these as positive capabilities; the provider takes
        // the negatives. Inverting here keeps the confusing polarity in one
        // place instead of spread through the UI.
        dropBackgroundAudio: project.preserve_background_audio === false,
        disableVoiceCloning: project.voice_cloning === false,
        highestResolution: project.highest_resolution !== false,
        sourceSeconds: project.source_seconds || undefined,
        speakerMap: Array.isArray(project.speaker_map) ? project.speaker_map : undefined,
        glossaryPrompt: glossaryPrompt || undefined,
      };
      if (isVideo) {
        spec.lipSync = lipSync;
        spec.burnCaptions = !!project.burn_captions;
      }

      try {
        const workerRes = await fetch(`${workerUrl.replace(/\/+$/, '')}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-render-secret': sharedSecret },
          body: JSON.stringify(spec),
        });
        if (!workerRes.ok) {
          const detail = await workerRes.text().catch(() => `${workerRes.status}`);
          outputs.push({ target_lang: targetLang, status: 'failed', error: `Worker rejected: ${detail}`.slice(0, 500) });
          continue;
        }
        const data = await workerRes.json().catch(() => ({}));
        if (!data?.jobId) {
          outputs.push({ target_lang: targetLang, status: 'failed', error: 'Worker returned no job id.' });
          continue;
        }
        outputs.push({
          target_lang: targetLang,
          status: 'queued',
          job_id: data.jobId,
          progress: 0,
          started_at: new Date().toISOString(),
        });
      } catch (_networkError) {
        // One language failing must not abandon the rest of the batch.
        outputs.push({ target_lang: targetLang, status: 'failed', error: 'render_worker_unreachable' });
      }
    }

    const anyQueued = outputs.some((o) => o.status === 'queued');
    const estimate = estimateCostUsd(Number(project.source_seconds), outputs.filter((o) => o.status === 'queued').length, lipSync);

    const patch: Record<string, unknown> = {
      outputs,
      status: anyQueued ? 'queued' : 'failed',
    };
    if (estimate !== null) patch.estimated_cost_usd = estimate;

    await base44.asServiceRole.entities.DubbingProject.update(project_id, patch);

    return Response.json({
      project_id,
      status: patch.status,
      outputs,
      estimated_cost_usd: estimate,
      // Told plainly rather than hidden: an absent estimate means the rate env
      // var isn't configured, not that the run is free.
      estimate_available: estimate !== null,
    }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
