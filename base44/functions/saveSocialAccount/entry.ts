import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveSocialAccount — the only writer of social platform credentials.
 *
 * Previously Settings.jsx and BrandManager.jsx called
 * base44.entities.SocialAccount.create({ access_token }) straight from the
 * browser, so a live posting token for someone's Instagram or LinkedIn sat in
 * plaintext on a client-readable entity and shipped back to the browser on
 * every Social Hub page load. Meanwhile saveApiKey was already doing this
 * properly for BYOK provider keys — AES-256-GCM, never returning the secret.
 * This applies that same treatment to platform tokens.
 *
 * Body: { id?, brand_id?, platform, account_name, username?, access_token?,
 *         refresh_token?, page_id?, connection_method? }
 * Omitting access_token on an update leaves the stored credential untouched,
 * so editing an account's display name doesn't require re-entering its token.
 *
 * Returns the saved record WITHOUT any token field — only a 4-character hint.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PLATFORMS = [
  'instagram', 'facebook', 'tiktok', 'linkedin',
  'youtube', 'twitter_x', 'pinterest', 'whatsapp', 'email',
];

// Same scheme and same key as saveApiKey — one secret to rotate, not two.
async function encryptSecret(plaintext: string, keyB64: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext));
  return JSON.stringify({
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuf))),
    iv: btoa(String.fromCharCode(...iv)),
  });
}

/** Strip every credential field before anything goes back over the wire. */
function sanitize(record: any) {
  if (!record) return record;
  const {
    access_token: _a, refresh_token: _r,
    access_token_enc: _ae, refresh_token_enc: _re,
    ...safe
  } = record;
  return safe;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const encryptionKey = Deno.env.get('BYOK_ENCRYPTION_KEY');
    if (!encryptionKey) {
      // Refuse rather than silently storing plaintext. A missing key is a
      // deployment problem, and quietly degrading to the insecure behaviour is
      // exactly how the original issue would come back.
      return Response.json(
        { error: 'BYOK_ENCRYPTION_KEY is not configured — cannot store credentials securely.' },
        { status: 500, headers: CORS },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { id, brand_id, platform, account_name, username, access_token, refresh_token, page_id, connection_method } = body;

    if (!id) {
      if (!PLATFORMS.includes(platform)) {
        return Response.json({ error: `platform must be one of: ${PLATFORMS.join(', ')}` }, { status: 400, headers: CORS });
      }
      if (!account_name) {
        return Response.json({ error: 'account_name is required' }, { status: 400, headers: CORS });
      }
    }

    const patch: Record<string, unknown> = {};
    if (brand_id !== undefined) patch.brand_id = brand_id;
    if (platform !== undefined) patch.platform = platform;
    if (account_name !== undefined) patch.account_name = account_name;
    if (username !== undefined) patch.username = username;
    if (page_id !== undefined) patch.page_id = page_id;
    if (connection_method !== undefined) patch.connection_method = connection_method;

    // A token is only touched when one was actually supplied, so a rename does
    // not wipe a working credential.
    if (typeof access_token === 'string' && access_token.trim()) {
      const raw = access_token.trim();
      patch.access_token_enc = await encryptSecret(raw, encryptionKey);
      patch.token_hint = raw.slice(-4);
      patch.token_updated_at = new Date().toISOString();
      // Blank the legacy plaintext column on write, so saving an old record
      // migrates it off plaintext instead of leaving both copies around.
      patch.access_token = '';
    }
    if (typeof refresh_token === 'string' && refresh_token.trim()) {
      patch.refresh_token_enc = await encryptSecret(refresh_token.trim(), encryptionKey);
      patch.refresh_token = '';
    }

    let saved: any;
    if (id) {
      // Ownership check: this handler writes through asServiceRole, which
      // bypasses RLS, so the caller's claim to this record must be verified
      // explicitly rather than assumed.
      const existing = await base44.asServiceRole.entities.SocialAccount.get(id).catch(() => null);
      if (!existing) return Response.json({ error: 'Account not found' }, { status: 404, headers: CORS });
      if (existing.created_by !== user.email && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
      }
      saved = await base44.asServiceRole.entities.SocialAccount.update(id, patch);
    } else {
      // Created through the user's own client (not service role) so the
      // platform stamps created_by, which is what the ownership check above
      // and the entity's RLS both key on.
      saved = await base44.entities.SocialAccount.create({
        status: 'disconnected',
        connected_at: new Date().toISOString(),
        ...patch,
      });
    }

    return Response.json({ success: true, account: sanitize(saved) }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
