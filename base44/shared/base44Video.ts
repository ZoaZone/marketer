import OpenAI from 'npm:openai@6.45.0';

/**
 * Base44-first scene video. Used by submitVideo (start a clip) and
 * getVideoStatus (poll it). Job ids look like "b44:<StudioVideoJob id>" so the
 * status function can tell them apart from render-worker (Kling) job ids.
 */
export const BASE44_JOB_PREFIX = 'b44:';

// Price plan: one 5-second scene clip draws this many AI credits (retail
// $0.06 each). Mirrored in src/config/plans.js as BASE44_VIDEO_CREDITS_PER_5S.
export const CREDITS_PER_5S = 6;

// 6 credits per 5 s (1.2 per second, rounded up): 5 s = 6, 10 s = 12, 15 s = 18.
export const creditsForSeconds = (seconds: number) =>
  Math.max(CREDITS_PER_5S, Math.ceil(((Number(seconds) || 5) * CREDITS_PER_5S) / 5));

const FREE_TRIAL_CREDITS = 25;
// Monthly AI-credit allowance per tier. Mirrors ALLOWANCE in the metering block / src/config/plans.js.
const ALLOWANCE_AC: Record<string, number> = {
  creator: 150, starter: 400, growth: 1250, agency: 3500, indie: 250, studio: 1000, dubbing_house: 1000, enterprise: 4000, byok: 0,
};

/**
 * Charges AI credits for Studio (Create with Studio) generations. Free accounts
 * draw on the 25-credit free trial; subscribers draw on their monthly
 * allowance and then overage unless overage is switched off. Returns a Response
 * to send back when the charge is refused, otherwise null.
 */
export async function chargeStudioCredits(base44: any, user: any, credits: number, kind: string): Promise<Response | null> {
  if (user?.role === 'admin' || !(credits > 0)) return null;
  const db = base44.asServiceRole.entities;
  const subs = await db.Subscription.filter({ owner_email: user.email }, '-created_date', 10).catch(() => []);
  const sub = (subs || []).find((s: any) => ['active', 'trialing'].includes(s.status));
  const event = (billed_as: string) => db.UsageEvent.create({
    owner_email: user.email, kind: 'ai_generation', units: credits, ai_credits_charged: credits,
    render_minutes_charged: 0, billed_as, provider: `base44_${kind}`,
  }).catch(() => null);
  if (!sub) {
    const prior = await db.UsageEvent.filter({ owner_email: user.email, billed_as: 'trial' }, '-created_date', 200).catch(() => null);
    if (!prior) return Response.json({ error: 'Could not check your free credits. Please retry.', code: 'metering_unavailable' }, { status: 503 });
    const used = prior.reduce((n: number, e: any) => n + Number(e.ai_credits_charged || 0), 0);
    if (used + credits > FREE_TRIAL_CREDITS) {
      return Response.json({ error: `This needs ${credits} credits and you have ${Math.max(0, FREE_TRIAL_CREDITS - used)} free credits left. Subscribe or buy credits to keep creating.`, code: 'trial_limit_reached' }, { status: 403 });
    }
    await event('trial');
    return null;
  }
  const stale = !sub.usage_period_start || Date.now() - Date.parse(sub.usage_period_start) > 31 * 86400000;
  const used = stale ? 0 : Number(sub.ai_credits_used || 0);
  const over = used + credits > (ALLOWANCE_AC[sub.plan_tier] ?? 0);
  if (over && sub.overage_enabled === false) {
    return Response.json({ error: 'This would exceed your monthly AI credits and overage billing is off. Upgrade or buy credits.', code: 'allowance_exceeded' }, { status: 402 });
  }
  await db.Subscription.update(sub.id, {
    usage_period_start: stale ? new Date().toISOString() : sub.usage_period_start,
    ai_credits_used: used + credits,
    ...(over ? { overage_ai_credits: Math.max(Number(stale ? 0 : sub.overage_ai_credits || 0), used + credits - (ALLOWANCE_AC[sub.plan_tier] ?? 0)) } : {}),
  });
  await event(over ? 'overage' : 'allowance');
  return null;
}

// The Base44 video model offers 4/6/8/15 s clips; map the Movie Maker 5/10 s steps onto them.
const modelSeconds = (seconds: number) => (Number(seconds) > 5 ? 8 : 6);

const videosApi = (base44: any) => {
  const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
  return new OpenAI({ baseURL, apiKey: token, defaultHeaders: headers }).videos;
};

export async function startBase44Clip(base44: any, user: any, spec: any): Promise<string> {
  const ratio = spec.aspectRatio === '9:16' ? '9:16' : '16:9';
  const hasFrame = typeof spec.imageUrl === 'string' && spec.imageUrl.startsWith('https://');
  const prompt = `${String(spec.prompt || '').slice(0, 1500)}\nNo visible lettering, captions, watermarks or logos.` +
    (hasFrame ? '\nUse @Image1 as the opening frame. Keep its subject, style, lighting and colors identical and animate naturally from it.' : '');
  const video = await videosApi(base44).create({
    model: 'seedance_2_fast', seconds: modelSeconds(spec.durationSeconds), aspect_ratio: ratio,
    resolution: '720p', generate_audio: false, prompt,
    ...(hasFrame ? { input_references: [{ type: 'image_url', image_url: { url: spec.imageUrl } }] } : {}),
  }, { maxRetries: 0 });
  if (!video?.id) throw new Error('No video job was returned.');
  const job = await base44.asServiceRole.entities.StudioVideoJob.create({ owner_id: user.id, video_id: video.id, status: video.status });
  return `${BASE44_JOB_PREFIX}${job.id}`;
}

export async function base44ClipStatus(base44: any, user: any, jobId: string) {
  const job = await base44.asServiceRole.entities.StudioVideoJob.get(jobId.slice(BASE44_JOB_PREFIX.length));
  if (!job || job.owner_id !== user.id) return { status: 'error', error: 'Video job not found.' };
  const video = await videosApi(base44).retrieve(job.video_id, { maxRetries: 0 });
  if (video.status === 'completed') return { status: video.url ? 'done' : 'error', progress: 1, url: video.url, error: video.url ? undefined : 'No video file was returned.' };
  if (video.status === 'failed') return { status: 'error', error: video.error?.message || 'Video generation failed.' };
  return { status: video.status === 'queued' ? 'queued' : 'processing', progress: typeof video.progress === 'number' ? video.progress / 100 : undefined };
}

// Gives credits back when a Base44 clip could not even be started.
export async function refundCredits(base44: any, user: any, credits: number) {
  if (user?.role === 'admin') return;
  try {
    const subs = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }, '-created_date', 10);
    const sub = (subs || []).find((s: any) => ['active', 'trialing'].includes(s.status));
    if (sub) {
      await base44.asServiceRole.entities.Subscription.update(sub.id, { ai_credits_used: Math.max(0, Number(sub.ai_credits_used || 0) - credits) });
    } else {
      await base44.asServiceRole.entities.UsageEvent.create({
        owner_email: user.email, kind: 'ai_generation', units: -credits, ai_credits_charged: -credits,
        render_minutes_charged: 0, billed_as: 'trial', provider: 'base44_refund',
      });
    }
  } catch (_) { /* best effort */ }
}