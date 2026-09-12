import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Copied from base44/_shared/rateLimit.block.ts — keep in sync by hand.
// ── BEGIN RATE LIMIT BLOCK ──────────────────────────────────────────────
function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

async function checkRateLimit(base44: any, bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const windowIndex = Math.floor(Date.now() / windowMs);
  const key = `${bucket}:${windowIndex}`;
  try {
    const rows = await base44.asServiceRole.entities.RateLimitCounter.filter({ key });
    const row = rows?.[0];
    if (!row) {
      await base44.asServiceRole.entities.RateLimitCounter.create({ key, count: 1 });
      return true;
    }
    if (row.count >= limit) return false;
    await base44.asServiceRole.entities.RateLimitCounter.update(row.id, { count: row.count + 1 });
    return true;
  } catch (e) {
    console.warn('checkRateLimit: entity read/write failed, allowing request:', (e as Error).message);
    return true;
  }
}

async function verifyTurnstile(token: string | undefined | null, remoteIp: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // not configured — no-op by design
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    console.warn('verifyTurnstile: siteverify request failed, rejecting:', (e as Error).message);
    return false;
  }
}
// ── END RATE LIMIT BLOCK ────────────────────────────────────────────────

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

  const headers = { 'Access-Control-Allow-Origin': '*' };

  try {
    // Use service role for public lead capture (no user auth required)
    const base44 = createClientFromRequest(req);
    const ip = getClientIp(req);

    const { client_id, funnel_id, form_data, turnstile_token } = await req.json();
    if (!form_data) {
      return Response.json({ error: 'form_data is required' }, { status: 400, headers });
    }

    // Bot-abuse guard: this is a fully public, unauthenticated endpoint that
    // writes straight into LeadCapture/MarketingContact, so it is a natural
    // spam target. Turnstile is a no-op until TURNSTILE_SECRET_KEY is set;
    // the IP rate limit (10/min, 100/day per IP) applies either way.
    if (!(await verifyTurnstile(turnstile_token, ip))) {
      return Response.json({ error: 'Verification failed. Please try again.' }, { status: 403, headers });
    }
    if (!(await checkRateLimit(base44, `lead_capture_min:${ip}`, 10, 60 * 1000))) {
      return Response.json({ error: 'Too many requests. Please try again in a minute.' }, { status: 429, headers });
    }
    if (!(await checkRateLimit(base44, `lead_capture_day:${ip}`, 100, 24 * 60 * 60 * 1000))) {
      return Response.json({ error: 'Daily submission limit reached for this address. Please try again tomorrow.' }, { status: 429, headers });
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

    return Response.json({ success: true, lead_id: lead.id }, { headers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers });
  }
});
