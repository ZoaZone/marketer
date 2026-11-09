import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    const {
      client_id, social_account_id, platform, caption,
      media_url, media_type, scheduled_at, content_type, music_note
    } = await req.json();

    if (!platform || !caption) {
      return Response.json({ error: 'platform and caption are required' }, { status: 400, headers: CORS });
    }

    const post = await base44.entities.ScheduledPost.create({
      client_id: client_id || '',
      social_account_id: social_account_id || '',
      platform,
      caption,
      media_url: media_url || '',
      media_type: media_type || 'image',
      scheduled_at: scheduled_at || '',
      status: scheduled_at ? 'scheduled' : 'draft',
    });

    return Response.json({ success: true, post_id: post.id }, { headers: CORS });
  } catch (error: any) {
    console.error('scheduleSocialPost error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }
});
