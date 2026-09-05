import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * removeApiKey — Work Package F (BYOK). Deletes a provider's stored key from
 * user.settings.api_keys, reverting that provider to the platform fallback
 * key. Body: { provider: "replicate" | "elevenlabs" | "llm" | "suno" }.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PROVIDERS = ['replicate', 'elevenlabs', 'llm', 'suno'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const provider = body?.provider;
    if (!PROVIDERS.includes(provider)) {
      return Response.json({ error: 'provider must be one of: replicate, elevenlabs, llm, suno.' }, { status: 400, headers: CORS });
    }

    const currentSettings = user.settings || {};
    const currentApiKeys = { ...(currentSettings.api_keys || {}) };
    delete currentApiKeys[provider];

    await base44.auth.updateMe({ settings: { ...currentSettings, api_keys: currentApiKeys } });

    return Response.json({ success: true }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
