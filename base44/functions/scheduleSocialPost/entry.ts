import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { client_id, social_account_id, platform, caption, media_url, scheduled_at } = await req.json();
    if (!platform || !caption || !scheduled_at) {
      return Response.json({ error: 'platform, caption, and scheduled_at are required' }, { status: 400 });
    }

    const post = await base44.entities.ScheduledPost.create({
      client_id: client_id || '',
      social_account_id: social_account_id || '',
      platform,
      caption,
      media_url: media_url || '',
      scheduled_at,
      status: 'scheduled',
    });

    return Response.json({ success: true, post_id: post.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});