import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveApiKey — Work Package F (BYOK). Validates a user-supplied API key with
 * a cheap read-only call to the provider, then encrypts it (AES-256-GCM) and
 * merges it into user.settings.api_keys.<provider>. Never returns the raw
 * key or the ciphertext — only a masked preview and a verified timestamp, so
 * even this function's own response can't leak the secret.
 *
 * Body: { provider: "replicate" | "elevenlabs" | "llm" | "suno", apiKey: string,
 *         llmProvider?, llmModel?, llmBaseUrl? }
 * (llmProvider/llmModel/llmBaseUrl only apply when provider === "llm".)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PROVIDERS = ['replicate', 'elevenlabs', 'llm', 'suno'];

async function encryptSecret(plaintext: string, keyB64: string): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext));
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuf))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// Cheap, read-only calls that confirm a key actually authenticates with the
// provider, without spending any generation credit.
async function validateKey(provider: string, apiKey: string, extra: { llmProvider?: string; llmBaseUrl?: string }): Promise<void> {
  if (provider === 'replicate') {
    const res = await fetch('https://api.replicate.com/v1/account', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error('Replicate rejected this key.');
    return;
  }
  if (provider === 'elevenlabs') {
    const res = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) throw new Error('ElevenLabs rejected this key.');
    return;
  }
  if (provider === 'suno') {
    // Suno has no official public API, so "the provider" here is whatever
    // third-party Suno API reseller SUNO_API_BASE_URL points at (defaults
    // to the same de facto community-standard contract server-render/
    // music.js's Suno branch targets — see its docstring). This calls that
    // reseller's read-only credit-balance endpoint, which is the cheapest
    // authenticated call most of them expose; if your chosen reseller uses
    // a different endpoint for this, update the URL below to match.
    const baseUrl = (Deno.env.get('SUNO_API_BASE_URL')?.trim() || 'https://api.sunoapi.org').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/api/v1/generate/credit`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error('The Suno API provider rejected this key.');
    return;
  }
  if (provider === 'llm') {
    const llmProvider = extra.llmProvider || 'anthropic';
    if (llmProvider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (!res.ok) throw new Error('Anthropic rejected this key.');
      return;
    }
    if (llmProvider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error('OpenAI rejected this key.');
      return;
    }
    // Custom OpenAI-compatible endpoint.
    const baseUrl = (extra.llmBaseUrl || '').trim().replace(/\/+$/, '');
    if (!baseUrl) throw new Error('A base URL is required for a custom LLM endpoint.');
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error('The custom endpoint rejected this key.');
    return;
  }
  throw new Error('Unknown provider.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const provider = body?.provider;
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!PROVIDERS.includes(provider)) {
      return Response.json({ error: 'provider must be one of: replicate, elevenlabs, llm, suno.' }, { status: 400, headers: CORS });
    }
    if (!apiKey) {
      return Response.json({ error: 'apiKey is required.' }, { status: 400, headers: CORS });
    }

    const encryptionKey = Deno.env.get('BYOK_ENCRYPTION_KEY');
    if (!encryptionKey) {
      return Response.json({ error: 'BYOK_ENCRYPTION_KEY is not configured on the server.' }, { status: 500, headers: CORS });
    }

    try {
      await validateKey(provider, apiKey, { llmProvider: body?.llmProvider, llmBaseUrl: body?.llmBaseUrl });
    } catch (validationError) {
      return Response.json({ error: (validationError as Error).message || 'This key was rejected by the provider.' }, { status: 400, headers: CORS });
    }

    const encrypted = await encryptSecret(apiKey, encryptionKey);
    const masked = `••••${apiKey.slice(-4)}`;
    const verifiedAt = new Date().toISOString();

    const record: Record<string, unknown> = { ...encrypted, masked, verifiedAt };
    if (provider === 'llm') {
      record.llmProvider = body?.llmProvider || 'anthropic';
      if (body?.llmModel) record.llmModel = body.llmModel;
      if (body?.llmBaseUrl) record.llmBaseUrl = body.llmBaseUrl;
    }

    const currentSettings = user.settings || {};
    const currentApiKeys = currentSettings.api_keys || {};
    await base44.auth.updateMe({
      settings: { ...currentSettings, api_keys: { ...currentApiKeys, [provider]: record } },
    });

    return Response.json({ success: true, masked, verifiedAt }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
