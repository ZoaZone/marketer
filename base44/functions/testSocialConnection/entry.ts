import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Tokens are AES-256-GCM encrypted in access_token_enc (written only by
 * saveSocialAccount). Falls back to the deprecated plaintext access_token so
 * pre-migration accounts can still be tested; remove the fallback once none
 * remain. Mirrors publishScheduledPosts' helper of the same name.
 */
async function decryptSecret(blob: string, keyB64: string): Promise<string> {
  const stored = JSON.parse(blob);
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const iv = Uint8Array.from(atob(stored.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(stored.ciphertext), (c) => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

async function resolveAccountToken(account: any): Promise<string> {
  if (!account) return '';
  if (account.access_token_enc) {
    const key = Deno.env.get('BYOK_ENCRYPTION_KEY');
    if (!key) return '';
    try {
      return await decryptSecret(account.access_token_enc, key);
    } catch {
      return '';
    }
  }
  return account.access_token || '';
}

/**
 * testSocialConnection — "Test Connection" action for Social Hub / Settings.
 *
 * Social accounts previously always showed as "active" the moment they were
 * created, regardless of whether they had a usable access token — so the UI
 * said "connected" right up until a real publish attempt failed. This
 * function makes a small real request to the platform's API using the
 * account's stored token and writes the *real* result back to
 * SocialAccount.status, so the badge in Social Hub reflects reality.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function checkToken(platform: string, token: string): Promise<{ ok: boolean; message: string }> {
  try {
    switch (platform) {
      case 'instagram':
      case 'facebook': {
        const res = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.id) return { ok: true, message: `Connected as ${data.name || data.id}.` };
        return { ok: false, message: data.error?.message || 'Facebook/Instagram rejected this token.' };
      }
      case 'linkedin': {
        const res = await fetch('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.id) return { ok: true, message: 'LinkedIn token verified.' };
        return { ok: false, message: data.message || 'LinkedIn rejected this token.' };
      }
      case 'twitter_x': {
        const res = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.data?.id) return { ok: true, message: `Connected as @${data.data.username || data.data.id}.` };
        return { ok: false, message: data.title || data.detail || 'Twitter/X rejected this token.' };
      }
      case 'youtube': {
        const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.items?.length) return { ok: true, message: 'YouTube channel verified.' };
        return { ok: false, message: data.error?.message || 'YouTube rejected this token.' };
      }
      case 'tiktok': {
        const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.data?.user) return { ok: true, message: 'TikTok token verified.' };
        return { ok: false, message: data.error?.message || 'TikTok rejected this token.' };
      }
      case 'pinterest': {
        const res = await fetch('https://api.pinterest.com/v5/user_account', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.username) return { ok: true, message: `Connected as ${data.username}.` };
        return { ok: false, message: data.message || 'Pinterest rejected this token.' };
      }
      default:
        return { ok: true, message: 'An access token is set, but this platform has no live verification check yet.' };
    }
  } catch (error) {
    return { ok: false, message: `Could not reach ${platform}: ${(error as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { account_id } = await req.json().catch(() => ({}));
    if (!account_id) return Response.json({ error: 'account_id is required' }, { status: 400, headers: CORS });

    const accounts = await base44.entities.SocialAccount.filter({ id: account_id });
    const account = accounts?.[0];
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404, headers: CORS });

    let status: string;
    let message: string;

    if (account.platform === 'email' || account.platform === 'whatsapp') {
      status = 'connected';
      message = account.platform === 'email'
        ? 'This entry is a sender label only. Email sending uses the SendGrid API key configured in Settings → API Keys.'
        : 'This entry is a sender label only. WhatsApp sending uses the WhatsApp Business (Twilio/BSP) credentials configured in Settings → API Keys.';
    } else if (account.connection_method === 'credentials' || !(account.access_token_enc || account.access_token)) {
      status = 'disconnected';
      message = account.connection_method === 'credentials'
        ? `${account.platform} accounts saved with a username/password can't be used to publish via the API. Reconnect with an API access token in Settings → Social Accounts.`
        : `No access token is set for this account. Reconnect it in Settings → Social Accounts.`;
    } else {
      const resolved = await resolveAccountToken(account);
      if (!resolved) {
        // A stored-but-undecryptable token is a distinct failure from no token
        // at all, and says something different about what to do next.
        // `CORS`, not `corsHeaders` — the latter is not defined in this
        // module, so this branch threw a ReferenceError that the outer catch
        // turned into a generic 500. An account whose token can't be
        // decrypted is exactly the case that most needs its real reason
        // shown, and it was the one case that never reached the user.
        //
        // This early return also skipped the status write below, so the
        // badge kept whatever it said before. Persist it here instead.
        await base44.entities.SocialAccount.update(account_id, { status: 'expired' });
        return Response.json({
          status: 'expired',
          message: 'The stored credential for this account could not be decrypted — the encryption key may have been rotated. Reconnect the account to store it again.',
        }, { headers: CORS });
      }
      const result = await checkToken(account.platform, resolved);
      status = result.ok ? 'active' : 'expired';
      message = result.message;
    }

    await base44.entities.SocialAccount.update(account_id, { status });

    return Response.json({ success: true, status, message }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
