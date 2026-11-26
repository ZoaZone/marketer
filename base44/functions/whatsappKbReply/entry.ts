/**
 * whatsappKbReply — Digital Studio's answer source for the shared Zoa Bot
 * WhatsApp number (+91 63099 82983). Called server-to-server by AEVOICE's
 * medhaRouter once a WhatsApp conversation has been routed to Digital
 * Studio (see AEVOICE's base44/functions/medhaRouter/entry.ts). Auth'd with
 * a Bearer token that must match the ZOABOT_RELAY_SECRET app secret (the
 * shared relay secret used across the Medha.io ecosystem), not a Base44
 * user session. Always fails safe to an empty reply.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

// ---------------------------------------------------------------------------
// Inlined from base44/_shared/byokLlm.block.ts — Base44 Edge Functions can't
// import relative modules from outside their own directory, so this is
// hand-copied here (same convention as rateLimit.block.ts elsewhere in
// base44/functions). Keep in sync by hand if the shared version changes.
// ---------------------------------------------------------------------------
async function byokCallAnthropic(prompt: string, key: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = (data?.content || []).map((c: any) => c?.text || "").join("").trim();
  if (!text) throw new Error("anthropic returned empty content");
  return text;
}

async function byokCallOpenAi(prompt: string, key: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = (data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("openai returned empty content");
  return text;
}

async function llmText(db: any, prompt: string, o: { tag?: string; maxTokens?: number } = {}): Promise<string> {
  const tag = o.tag || "llm";
  const maxTokens = o.maxTokens ?? 1024;

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    try { return await byokCallAnthropic(prompt, anthropicKey, maxTokens); }
    catch (err) { console.error(`[${tag}] anthropic BYOK failed, trying next provider:`, (err as Error)?.message); }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try { return await byokCallOpenAi(prompt, openaiKey, maxTokens); }
    catch (err) { console.error(`[${tag}] openai BYOK failed, falling back to built-in AI:`, (err as Error)?.message); }
  }

  return await db.integrations.Core.InvokeLLM({ prompt });
}

const RELAY_SECRET = Deno.env.get("ZOABOT_RELAY_SECRET") || "";

async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!RELAY_SECRET || bearer !== RELAY_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const message = String(body?.message || "").trim();
  if (!message) return Response.json({ reply: "" });

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const prompt = `You are the WhatsApp assistant for Digital Studio / Chitra Medha (chitra.medha.io), an AI content and marketing creation platform on the Medha.io ecosystem (social posts, images, campaigns). A prospective or existing user has sent this WhatsApp message:

"${message}"

Answer helpfully in at most 60 words. Explain what the platform does, how to get started (sign up at chitra.medha.io), or answer their question directly. This is a text message, not a report, so keep it short and conversational, with no markdown formatting. If you genuinely cannot help, say a Medha.io team member will follow up.`;

  try {
    const answer = await llmText(db, prompt, { tag: "digitalstudio whatsappKbReply" });
    return Response.json({ reply: String(answer || "").trim().slice(0, 1500) });
  } catch (err) {
    console.error("[digitalstudio whatsappKbReply] InvokeLLM error:", (err as Error)?.message || err);
    return Response.json({ reply: "" });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }
  try {
    return await handle(req);
  } catch (err) {
    console.error("[digitalstudio whatsappKbReply] unhandled error:", (err as Error)?.message || err);
    return Response.json({ reply: "" });
  }
});
