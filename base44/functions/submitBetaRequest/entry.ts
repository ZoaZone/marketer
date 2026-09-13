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
  // CORS preflight
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
    const base44 = createClientFromRequest(req);
    const ip = getClientIp(req);
    // `note` added so the public Agency Enquiry and Agent Program forms can
    // route through here instead of creating BetaRequest from the browser.
    // Client-side creation stopped being possible once BetaRequest.create was
    // locked to admin — those two forms silently broke until they were moved.
    const { full_name, email, company, use_case, note, turnstile_token } = await req.json();

    if (!full_name || !email) {
      return Response.json({ error: 'full_name and email are required' }, { status: 400, headers });
    }

    // Bot-abuse guard: public signup form, no auth. Turnstile is a no-op
    // until TURNSTILE_SECRET_KEY is set; the IP rate limit applies either way.
    if (!(await verifyTurnstile(turnstile_token, ip))) {
      return Response.json({ error: 'Verification failed. Please try again.' }, { status: 403, headers });
    }
    if (!(await checkRateLimit(base44, `beta_request_min:${ip}`, 5, 60 * 1000))) {
      return Response.json({ error: 'Too many requests. Please try again in a minute.' }, { status: 429, headers });
    }
    if (!(await checkRateLimit(base44, `beta_request_day:${ip}`, 30, 24 * 60 * 60 * 1000))) {
      return Response.json({ error: 'Daily submission limit reached for this address. Please try again tomorrow.' }, { status: 429, headers });
    }

    // Check for duplicate email (service role — no auth needed for public form)
    const existing = await base44.asServiceRole.entities.BetaRequest.filter({ email: String(email).trim().toLowerCase() });
    if (existing && existing.length > 0) {
      return Response.json({ success: true, message: 'Already registered' }, { headers });
    }

    // Create the record using service role (bypasses auth)
    const record = await base44.asServiceRole.entities.BetaRequest.create({
      full_name,
      email: String(email).trim().toLowerCase(),
      note: note || '',
      company: company || '',
      use_case: use_case || '',
      status: 'pending',
      invite_sent: false,
    });

    // Notify admin via SendGrid (Base44 SendEmail can't send to external addresses)
    try {
      const sgKey = Deno.env.get('SENDGRID_API_KEY');
      const sgFrom = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@digitalstudios.app';
      if (sgKey) {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: 'hellobizapp@gmail.com' }] }],
            from: { email: sgFrom, name: 'digitalstudios.app' },
            subject: `🚀 New Beta Request from ${full_name}`,
            content: [{ type: 'text/plain', value: `A new beta access request has been submitted:\n\nName: ${full_name}\nEmail: ${email}\nCompany: ${company || '—'}\nUse Case: ${use_case || '—'}\n\nReview and approve in your Admin Dashboard → Beta Invites tab.` }],
          }),
        });
      }
    } catch (emailErr) {
      console.error('Admin email notification failed (non-fatal):', emailErr);
    }

    return Response.json({ success: true, id: record.id }, { headers });
  } catch (error) {
    console.error('submitBetaRequest error:', error);
    return Response.json({ error: error.message }, { status: 500, headers });
  }
});