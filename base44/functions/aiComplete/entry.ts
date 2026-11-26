import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---------------------------------------------------------------------------
// Inlined from base44/_shared/byokLlm.block.ts — Base44 Edge Functions can't
// import relative modules from outside their own directory (a bare import
// like '../_shared/byokLlm.block.ts' fails to bundle), so this canonical
// block is hand-copied into every function that needs it, same as the
// existing rateLimit.block.ts convention elsewhere in base44/functions.
// Keep this in sync by hand if base44/_shared/byokLlm.block.ts changes.
// ---------------------------------------------------------------------------
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

interface LlmTextOptions {
  system?: string;
  maxTokens?: number;
  anthropicModel?: string;
  openaiModel?: string;
  tag?: string;
  invokeParams?: Record<string, unknown>;
}

async function callAnthropicText(prompt: string, key: string, o: LlmTextOptions): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: o.anthropicModel || ANTHROPIC_DEFAULT_MODEL,
      max_tokens: o.maxTokens ?? 1024,
      ...(o.system ? { system: o.system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.content || []).map((c: any) => c?.text || "").join("").trim();
  if (!text) throw new Error("anthropic returned empty content");
  return text;
}

async function callOpenAiText(prompt: string, key: string, o: LlmTextOptions): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: o.openaiModel || OPENAI_DEFAULT_MODEL,
      max_tokens: o.maxTokens ?? 1024,
      messages: [
        ...(o.system ? [{ role: "system", content: o.system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openai ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("openai returned empty content");
  return text;
}

async function llmText(db: any, prompt: string, o: LlmTextOptions = {}): Promise<string> {
  const tag = o.tag || "llm";

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    try {
      return await callAnthropicText(prompt, anthropicKey, o);
    } catch (err) {
      console.error(`[${tag}] anthropic BYOK failed, trying next provider:`, (err as Error)?.message);
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try {
      return await callOpenAiText(prompt, openaiKey, o);
    } catch (err) {
      console.error(`[${tag}] openai BYOK failed, falling back to built-in AI:`, (err as Error)?.message);
    }
  }

  // Last resort: Base44 built-in AI (spends integration credits).
  return await db.integrations.Core.InvokeLLM({
    prompt,
    ...(o.invokeParams || {}),
  });
}

function parseLooseJson(text: string): any {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(cleaned); } catch (_e) { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_e) { /* fall through */ }
  }
  throw new Error("Could not parse JSON from model output");
}

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
