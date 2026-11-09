import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * publishScheduledPosts — On-demand trigger (called from SocialHub UI)
 *
 * Flow:
 *  1. Authenticate the calling user (multi-tenant: only touches THEIR posts + accounts)
 *  2. Accept optional post_id to publish a single post, or publish ALL due scheduled posts for the user
 *  3. Resolve the SocialAccount for each post (user-owned)
 *  4. Hit the platform API with the stored access_token
 *  5. Update post status to "posted" or "failed"
 */

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);

    // Auth — must be a logged-in user (multi-tenant)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { post_id } = body; // Optional: publish a specific post by ID

    // Load user's social accounts (keyed by id for fast lookup)
    const userAccounts = await base44.entities.SocialAccount.list('-created_date', 50);
    const accountMap: Record<string, any> = {};
    for (const acc of userAccounts) {
      accountMap[acc.id] = acc;
    }

    // Load posts to publish
    let postsToPublish: any[] = [];
    if (post_id) {
      // Single post — user explicitly clicked "Publish Now"
      const allPosts = await base44.entities.ScheduledPost.filter({ id: post_id });
      postsToPublish = allPosts.filter((p: any) => p.created_by === user.email || !p.created_by);
    } else {
      // All scheduled posts that are due for this user
      const now = new Date();
      const scheduledPosts = await base44.entities.ScheduledPost.filter({ status: 'scheduled' });
      postsToPublish = scheduledPosts.filter((p: any) => {
        if (!p.scheduled_at) return false;
        return new Date(p.scheduled_at) <= now;
      });
    }

    let published = 0;
    let failed = 0;
    const results: Array<{ id: string; platform: string; status: string; error?: string; post_url?: string }> = [];

    for (const post of postsToPublish) {
      // Resolve social account — must belong to this user
      const account = post.social_account_id ? accountMap[post.social_account_id] : null;
      const token = account?.access_token;

      let postUrl = '';
      let status = 'posted';
      let errorMsg = '';

      if (!token) {
        errorMsg = `No access token found for the linked social account. Please reconnect your ${post.platform} account in Settings → Social Accounts.`;
        status = 'failed';
      } else {
        try {
          if (post.platform === 'instagram' && token) {
            if (post.media_url) {
              // Instagram: create media container, then publish
              const createRes = await fetch(
                `https://graph.instagram.com/me/media?image_url=${encodeURIComponent(post.media_url)}&caption=${encodeURIComponent(post.caption || '')}&access_token=${token}`,
                { method: 'POST' }
              );
              const createData = await createRes.json();
              if (createData.id) {
                const publishRes = await fetch(
                  `https://graph.instagram.com/me/media_publish?creation_id=${createData.id}&access_token=${token}`,
                  { method: 'POST' }
                );
                const publishData = await publishRes.json();
                if (publishData.id) {
                  postUrl = `https://www.instagram.com/p/${publishData.id}`;
                } else {
                  errorMsg = publishData.error?.message || 'Instagram publish failed';
                  status = 'failed';
                }
              } else {
                errorMsg = createData.error?.message || 'Instagram container creation failed';
                status = 'failed';
              }
            } else {
              // Text-only Instagram not supported via API
              errorMsg = 'Instagram requires a media URL (image or video).';
              status = 'failed';
            }
          } else if (post.platform === 'facebook' && token) {
            const fbRes = await fetch(`https://graph.facebook.com/me/feed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: post.caption || '',
                access_token: token,
                ...(post.media_url ? { link: post.media_url } : {}),
              }),
            });
            const fbData = await fbRes.json();
            if (fbData.id) {
              postUrl = `https://www.facebook.com/${fbData.id}`;
            } else {
              errorMsg = fbData.error?.message || 'Facebook post failed';
              status = 'failed';
            }
          } else if (post.platform === 'linkedin' && token) {
            // Get user URN
            const profileRes = await fetch('https://api.linkedin.com/v2/me', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const profile = await profileRes.json();
            if (!profile.id) {
              errorMsg = 'Could not fetch LinkedIn profile. Token may be expired.';
              status = 'failed';
            } else {
              const authorUrn = `urn:li:person:${profile.id}`;
              const liRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'X-Restli-Protocol-Version': '2.0.0',
                },
                body: JSON.stringify({
                  author: authorUrn,
                  lifecycleState: 'PUBLISHED',
                  specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                      shareCommentary: { text: post.caption || '' },
                      shareMediaCategory: post.media_url ? 'ARTICLE' : 'NONE',
                      ...(post.media_url ? {
                        media: [{ status: 'READY', originalUrl: post.media_url }],
                      } : {}),
                    },
                  },
                  visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
                }),
              });
              const liData = await liRes.json();
              if (liData.id) {
                postUrl = `https://www.linkedin.com/feed/update/${liData.id}`;
              } else {
                errorMsg = liData.message || JSON.stringify(liData);
                status = 'failed';
              }
            }
          } else if (post.platform === 'twitter_x' && token) {
            // Twitter/X v2 API
            const twRes = await fetch('https://api.twitter.com/2/tweets', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ text: post.caption || '' }),
            });
            const twData = await twRes.json();
            if (twData.data?.id) {
              postUrl = `https://twitter.com/i/web/status/${twData.data.id}`;
            } else {
              errorMsg = twData.title || twData.detail || 'Twitter/X post failed';
              status = 'failed';
            }
          } else if (post.platform === 'tiktok' && token) {
            // TikTok Content Posting API (video required)
            if (!post.media_url) {
              errorMsg = 'TikTok requires a video URL.';
              status = 'failed';
            } else {
              const ttRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({
                  post_info: { title: post.caption?.slice(0, 150) || '', privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
                  source_info: { source: 'PULL_FROM_URL', video_url: post.media_url },
                }),
              });
              const ttData = await ttRes.json();
              if (ttData.data?.publish_id) {
                postUrl = '';  // TikTok doesn't return a direct URL immediately
              } else {
                errorMsg = ttData.error?.message || 'TikTok post failed';
                status = 'failed';
              }
            }
          } else if (post.platform === 'youtube' && token) {
            errorMsg = 'YouTube publishing via API requires OAuth + video upload. Please use YouTube Studio directly for now.';
            status = 'failed';
          } else {
            errorMsg = `Platform "${post.platform}" not yet supported for direct publishing.`;
            status = 'failed';
          }
        } catch (err) {
          errorMsg = (err as Error).message;
          status = 'failed';
        }
      }

      // Update post record
      await base44.entities.ScheduledPost.update(post.id, {
        status,
        post_url: postUrl || null,
        ...(errorMsg ? { error_message: errorMsg } : {}),
      });

      if (status === 'posted') published++;
      else failed++;

      results.push({ id: post.id, platform: post.platform, status, post_url: postUrl, error: errorMsg || undefined });
    }

    return Response.json(
      { success: true, published, failed, total: postsToPublish.length, results },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
