import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

async function llmText(db: any, prompt: string, o: { tag?: string; maxTokens?: number; invokeParams?: Record<string, unknown> } = {}): Promise<string> {
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

  return await db.integrations.Core.InvokeLLM({ prompt, ...(o.invokeParams || {}) });
}

function parseLooseJson(text: string): any {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(cleaned); } catch (_e) { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch (_e) { /* fall through */ } }
  throw new Error("Could not parse JSON from model output");
}

// Provider-first JSON call. Integration credits are exhausted, so InvokeLLM
// alone always fails. llmText tries Anthropic then OpenAI and keeps InvokeLLM
// as the last resort; parseLooseJson handles a markdown-fenced reply.
// The call keeps the original shape, so no paren changes were needed.
const invokeJson = async (db: any, params: any, tag: string) => {
  const out = await llmText(db, params?.prompt || "", { tag, invokeParams: params });
  if (out && typeof out === "object") return out;
  try { return parseLooseJson(String(out)); } catch { return { raw: String(out || "") }; }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { funnel_id } = await req.json();
    if (!funnel_id) {
      return Response.json({ error: 'funnel_id is required' }, { status: 400 });
    }

    const funnels = await base44.entities.Funnel.filter({ id: funnel_id, created_by: user.email });
    if (funnels.length === 0) {
      return Response.json({ error: 'Funnel not found' }, { status: 404 });
    }
    const funnel = funnels[0];

    const stages = await base44.entities.FunnelStage.filter({ funnel_id, created_by: user.email });

    const stageData = stages.map(s => ({
      name: s.name,
      order: s.stage_order,
      entries: s.entry_count || 0,
      exits: s.exit_count || 0,
      action: s.action_type,
    }));

    const insights = await invokeJson(base44, {
      prompt: `Analyze this marketing funnel and provide actionable insights:\n\nFunnel: ${funnel.name}\nTotal leads: ${funnel.total_leads}\nConverted: ${funnel.converted_leads}\nConversion rate: ${funnel.conversion_rate}%\n\nStages:\n${stageData.map(s => `- ${s.name} (order ${s.order}): ${s.entries} entered, ${s.exits} exited, action: ${s.action}`).join('\n')}\n\nProvide: drop-off analysis, best-performing channels, recommended improvements, and optimal follow-up timing.`,
      response_json_schema: {
        type: 'object',
        properties: {
          drop_off_analysis: { type: 'string' },
          best_channels: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
          optimal_timing: { type: 'string' },
          overall_score: { type: 'number' },
        },
      },
    });

    return Response.json({ success: true, insights });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});