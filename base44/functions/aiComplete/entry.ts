import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { llmText, parseLooseJson } from '../_shared/byokLlm.block.ts';

/**
 * aiComplete — server-side LLM call for browser code.
 *
 * Why this exists
 * ---------------
 * Components used to call base44.integrations.Core.InvokeLLM directly. That
 * spends Base44 integration credits, and those are exhausted, so every such
 * call now fails and the feature silently renders nothing.
 *
 * Browser code cannot read provider credentials from the environment (anything
 * prefixed VITE_ is baked into the public bundle), so the call is proxied here
 * where Deno.env is private. Resolution order is the same everywhere else in
 * the portfolio: Anthropic, then OpenAI, then Base44's built-in AI.
 *
 * Body: { prompt, response_json_schema?, maxTokens?, tag? }
 * Returns: { result } — a string, or a parsed object when a schema was given,
 * matching what InvokeLLM returned so call sites need no reshaping.
 */
Deno.serve(async (req) => {
  // noop-probe
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();
    if (!prompt) {
      return Response.json({ error: 'prompt is required' }, { status: 400, headers: cors });
    }

    const tag = String(body?.tag || 'aiComplete').slice(0, 80);
    const maxTokens = Number(body?.maxTokens) > 0 ? Number(body.maxTokens) : 1500;

    // Web browsing is only available on Base44's own integration, so those
    // requests keep going straight to it.
    if (body?.add_context_from_internet) {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
      });
      return Response.json({ result: res }, { headers: cors });
    }

    const text = await llmText(base44, prompt, { tag, maxTokens });

    // A schema means the caller expects an object, not prose.
    if (body?.response_json_schema) {
      try {
        return Response.json({ result: parseLooseJson(text) }, { headers: cors });
      } catch (err) {
        console.error(`[${tag}] JSON parse failed:`, (err as Error)?.message);
        return Response.json({ result: text, parseError: true }, { headers: cors });
      }
    }

    return Response.json({ result: text }, { headers: cors });
  } catch (err) {
    console.error('[aiComplete] failed:', (err as Error)?.message || err);
    return Response.json({ error: 'AI request failed' }, { status: 500, headers: cors });
  }
});
