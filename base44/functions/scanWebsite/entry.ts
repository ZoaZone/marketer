import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, client_id } = await req.json();
    if (!url) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    // Create scan record
    const scan = await base44.entities.WebsiteScan.create({
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

    // Use LLM to analyze
    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this website content and provide a business analysis. URL: ${url}\n\nPage content: ${pageContent}\n\nProvide: business summary, services offered, keywords, tone of voice, and potential competitors.`,
      response_json_schema: {
        type: 'object',
        properties: {
          business_summary: { type: 'string' },
          services_found: { type: 'array', items: { type: 'string' } },
          keywords_found: { type: 'array', items: { type: 'string' } },
          tone: { type: 'string' },
          competitors: { type: 'array', items: { type: 'string' } },
        },
      },
    });

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
    return Response.json({ error: error.message }, { status: 500 });
  }
});