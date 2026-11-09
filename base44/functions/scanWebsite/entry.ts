import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  // Hoisted so the catch below can mark a half-finished scan as failed
  // rather than leaving it stuck at "scanning".
  let base44: any = null;
  let scan: any = null;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, client_id } = await req.json();
    if (!url) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    // Create scan record
    scan = await base44.entities.WebsiteScan.create({
      website_url: url,
      client_id: client_id || '',
      scan_status: 'scanning',
      scan_at: new Date().toISOString(),
    });

    // Fetch website content
    let pageContent = '';
    try {
      const response = await fetch(url.startsWith('http') ? url : `https://${url}`, {
        headers: { 'User-Agent': 'CREAM-Scanner/1.0' },
      });
      pageContent = await response.text();
      // Extract text from HTML (basic extraction)
      pageContent = pageContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 5000); // Limit content size
    } catch (fetchErr) {
      pageContent = `Could not fetch page. URL: ${url}`;
    }

    const analysisPrompt = `Analyze this website content and provide a business analysis. URL: ${url}\n\nPage content: ${pageContent}\n\nProvide: business summary, services offered, keywords, tone of voice, and potential competitors.`;
    const analysisSchema = {
      type: 'object',
      properties: {
        business_summary: { type: 'string' },
        services_found: { type: 'array', items: { type: 'string' } },
        keywords_found: { type: 'array', items: { type: 'string' } },
        tone: { type: 'string' },
        competitors: { type: 'array', items: { type: 'string' } },
      },
    };

    // LLM provider chain, same shape as generateMediaContent's: Base44's
    // built-in AI first, then an admin-configured OpenAI key as a
    // last-resort fallback. This scan is the first step of the Demo Video
    // and Auto-Demo flows, so a transient Base44 AI outage used to take out
    // the whole create path at step one.
    let analysis: any;
    try {
      analysis = await base44.integrations.Core.InvokeLLM({
        prompt: analysisPrompt,
        response_json_schema: analysisSchema,
      });
    } catch (_llmError) {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) throw new Error('Base44 built-in AI is unavailable and no fallback is configured.');
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          // OpenAI has no response_json_schema parameter on this endpoint;
          // json_object mode plus the schema spelled out in the prompt is
          // the equivalent, and the parse below is guarded either way.
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: `${analysisPrompt}\n\nRespond with JSON only, matching this schema exactly:\n${JSON.stringify(analysisSchema)}`,
          }],
        }),
      });
      if (!openaiRes.ok) throw new Error(`OpenAI fallback failed: ${await openaiRes.text()}`);
      const openaiData = await openaiRes.json();
      try {
        analysis = JSON.parse(openaiData.choices?.[0]?.message?.content ?? '');
      } catch (_parseError) {
        throw new Error('The AI fallback returned a response that could not be read as an analysis.');
      }
    }

    // Update scan record
    await base44.entities.WebsiteScan.update(scan.id, {
      scan_status: 'completed',
      pages_scanned: 1,
      business_summary: analysis.business_summary,
      services_found: analysis.services_found || [],
      keywords_found: analysis.keywords_found || [],
      tone: analysis.tone,
      competitors: analysis.competitors || [],
    });

    return Response.json({ success: true, scan_id: scan.id, analysis });
  } catch (error) {
    // A scan record is created before any of the work above, so a failure
    // anywhere after that used to leave it stuck at "scanning" forever —
    // the UI reads these back, and a permanently-in-progress row is
    // indistinguishable from one that is genuinely still running.
    if (base44 && scan?.id) {
      await base44.entities.WebsiteScan.update(scan.id, {
        scan_status: 'failed',
      }).catch(() => { /* the response below is what matters */ });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});