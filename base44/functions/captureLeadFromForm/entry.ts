import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // Use service role for public lead capture (no user auth required)
    const base44 = createClientFromRequest(req);

    const { client_id, funnel_id, form_data } = await req.json();
    if (!form_data) {
      return Response.json({ error: 'form_data is required' }, {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = typeof form_data === 'string' ? JSON.parse(form_data) : form_data;

    // Create LeadCapture record (service role — no auth needed)
    const lead = await base44.asServiceRole.entities.LeadCapture.create({
      client_id: client_id || '',
      funnel_id: funnel_id || '',
      full_name: data.full_name || data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      whatsapp: data.whatsapp || '',
      source: data.source || 'website',
      utm_source: data.utm_source || '',
      utm_campaign: data.utm_campaign || '',
      form_data: JSON.stringify(data),
      captured_at: new Date().toISOString(),
    });

    // Also create a MarketingContact
    try {
      await base44.asServiceRole.entities.MarketingContact.create({
        client_id: client_id || '',
        full_name: data.full_name || data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        whatsapp: data.whatsapp || '',
        source: data.source || 'website',
        funnel_stage: 'new',
        lead_score: 10,
        opted_in_email: true,
        last_contacted_at: new Date().toISOString(),
      });
    } catch (_) {
      // Contact creation is best-effort — don't fail the lead capture
    }

    return Response.json({ success: true, lead_id: lead.id }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    return Response.json({ error: error.message }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
});
