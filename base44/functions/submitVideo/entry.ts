import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { chargeStudioCredits, creditsForSeconds, refundCredits } from '../../shared/base44Video.ts';
import { startVertexVideo, VERTEX_PREFIX, vertexSeconds } from '../../shared/vertexVideo.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(e => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const spec = await req.json().catch(() => null);
    if (!spec || typeof spec.prompt !== 'string' || !spec.prompt.trim() || spec.prompt.length > 8000 || (spec.imageUrl && (typeof spec.imageUrl !== 'string' || spec.imageUrl.length > 5000))) {
      return Response.json({ error: 'Enter a video prompt of up to 8,000 characters and a valid opening frame.' }, { status: 400, headers: CORS });
    }
    const credits = creditsForSeconds(vertexSeconds(spec.durationSeconds ?? 6));
    const denied = await chargeStudioCredits(base44, user, credits, 'video', 'vertex_veo');
    if (denied) return denied;
    try {
      const job = await startVertexVideo(base44, user, { ...spec, durationSeconds: spec.durationSeconds ?? 6 });
      return Response.json({ jobId: `${VERTEX_PREFIX}${job.id}`, provider: 'vertex' }, { status: 202, headers: CORS });
    } catch (error) {
      await refundCredits(base44, user, credits);
      return Response.json({ error: error.message || 'Could not start Google video generation.' }, { status: 502, headers: CORS });
    }
  } catch (error) {
    return Response.json({ error: error.message || 'Could not start video generation.' }, { status: 500, headers: CORS });
  }
}