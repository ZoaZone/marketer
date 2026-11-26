// byokLlm.block.ts — provider-first LLM text generation.
//
// ⚠️ DEPRECATED LOCATION — DO NOT IMPORT THIS FILE.
// Base44 Edge Functions cannot import a relative module from outside their
// own function directory unless it lives under a top-level `shared/` folder
// (no leading underscore). Every function that imported
// '.../_shared/byokLlm.block.ts' failed to bundle/deploy with "Relative
// imports can't reach outside the function" (discovered and fixed Nov 2026).
// The real, importable copy of this module now lives at
// base44/shared/byokLlm.block.ts — import from there instead. This file is
// kept only as historical design-doc reference and should not gain new
// importers.
//
// Why this exists
// ---------------
// Every AI feature in this app used to call base44.integrations.Core.InvokeLLM
// directly, which spends Base44 *integration credits*. When the platform's
// integration credit pool is exhausted, every one of those features stops:
// chat assistants, WhatsApp auto-replies, document verification, clinical
// summaries. The platform owner supplies their own provider keys so these
// routine features keep working regardless of the integration credit balance.
//
// Resolution order (first success wins)
// -------------------------------------
//   1. Anthropic  — ANTHROPIC_API_KEY
//   2. OpenAI     — OPENAI_API_KEY
//   3. Base44 built-in AI (InvokeLLM) — the old behaviour, last resort
//
// Design notes
// ------------
// * Keys are read from Deno.env only. Nothing is logged that could contain a
//   key, and provider error bodies are truncated before logging.
// * A provider failure is never fatal: it falls through to the next provider
//   and finally to InvokeLLM, so behaviour only ever degrades toward the
//   previous implementation.
// * Model ids are the ones verified live against this account's keys
//   (Nov 2026). claude-3-5-* is retired and will 404.

const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export interface LlmTextOptions {
  /** Optional system instruction. */
  system?: string;
  /** Max output tokens. Defaults to 1024. */
  maxTokens?: number;
  /** Override the Anthropic model. */
  anthropicModel?: string;
  /** Override the OpenAI model. */
  openaiModel?: string;
  /** Label used in logs, e.g. "healthai whatsappKbReply". */
  tag?: string;
  /** Passed through to InvokeLLM only (e.g. add_context_from_internet). */
  invokeParams?: Record<string, unknown>;
}

async function callAnthropic(prompt: string, key: string, o: LlmTextOptions): Promise<string> {
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

async function callOpenAI(prompt: string, key: string, o: LlmTextOptions): Promise<string> {
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

/**
 * Generate text using the owner's own provider keys first, falling back to
 * Base44's built-in AI. Always resolves to a string; throws only if every
 * path fails (callers already handle that as they did before).
 */
export async function llmText(db: any, prompt: string, o: LlmTextOptions = {}): Promise<string> {
  const tag = o.tag || "llm";

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    try {
      return await callAnthropic(prompt, anthropicKey, o);
    } catch (err) {
      console.error(`[${tag}] anthropic BYOK failed, trying next provider:`, (err as Error)?.message);
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try {
      return await callOpenAI(prompt, openaiKey, o);
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
