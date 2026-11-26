import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { llmText, parseLooseJson } from '../../_shared/byokLlm.block.ts';

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