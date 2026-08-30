import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendEmailFallback — Sends transactional emails to ANY external address.
 *
 * Primary:  Resend (RESEND_API_KEY)
 *   From:   RESEND_FROM_EMAIL env var (default: noreply@digitalstudios.app)
 *   Domain: digitalstudios.app — verified & active in Resend ✅
 *
 * Fallback: SendGrid (SENDGRID_API_KEY)
 *   From:   SENDGRID_FROM_EMAIL env var (default: noreply@digitalstudios.app)
 *
 * Set env vars:
 *   RESEND_API_KEY       — your Resend API key
 *   RESEND_FROM_EMAIL    — sender address (default: noreply@digitalstudios.app)
 *   SENDGRID_API_KEY     — SendGrid key (fallback only)
 *   SENDGRID_FROM_EMAIL  — SendGrid from address (fallback only)
 */
// Per-caller send throttle. Keyed by user email, holding the timestamps of
// that caller's sends inside the current window.
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_SENDS = 10;
const recentSends = new Map<string, number[]>();

function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hits = (recentSends.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX_SENDS) {
    recentSends.set(key, hits);
    return false;
  }
  hits.push(now);
  recentSends.set(key, hits);
  return true;
}

Deno.serve(async (req) => {
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
    const base44 = createClientFromRequest(req);

    // SECURITY: this handler sends mail from the app's own sending domain via
    // asServiceRole. Without a caller check it is an open relay — anyone on the
    // internet could POST arbitrary {to, subject, html} and have it delivered
    // as noreply@digitalstudios.app, burning the domain's reputation and
    // enabling phishing that looks genuinely first-party. Both real call sites
    // (AdminDashboard's tier-1 affiliate invite and AffiliatePortal's tier-2
    // sub-affiliate invite) run as a signed-in user, so requiring a session
    // costs nothing and closes the relay.
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // A signed-in non-admin can still name any recipient, so cap how often one
    // account may send. Ten per hour comfortably covers inviting sub-affiliates
    // and is useless as a spam channel. Admins are exempt.
    // NOTE: this counter is per warm instance — a cold start or a second
    // instance resets it. It is a speed bump, not a hard quota; move it to a
    // persisted counter if abuse is ever observed.
    const isAdmin = user.role === 'admin';
    if (!isAdmin && !underRateLimit(user.email)) {
      return Response.json(
        { error: 'Too many emails sent from this account. Please try again later.' },
        { status: 429, headers: { 'Access-Control-Allow-Origin': '*' } },
      );
    }

    const { to, subject, body, text, html, from_name } = await req.json();
    if (!to || !subject || (!body && !text && !html)) {
      return Response.json({ error: 'to, subject, and body/text are required' }, {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const fromName = from_name || 'digitalstudios.app';
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@digitalstudios.app';
    const plainText = text || body || '';
    const htmlContent = html || '<pre style="font-family:sans-serif;white-space:pre-wrap">' + plainText + '</pre>';

    let provider = 'none';

    // PRIMARY: Base44 built-in
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body: plainText });
      provider = 'base44';
    } catch (e) {
      console.warn('Base44 SendEmail failed, trying Resend:', e.message);
    }

    // SECONDARY: Resend
    if (provider === 'none') {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromName + ' <' + fromEmail + '>',
            to: [to],
            subject,
            text: plainText,
            html: htmlContent,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          provider = 'resend';
          return Response.json(
            { success: true, provider, id: data.id, to },
            { headers: { 'Access-Control-Allow-Origin': '*' } }
          );
        }
        console.error('Resend failed:', await res.text());
      }
    } else {
      return Response.json(
        { success: true, provider, to },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // TERTIARY: SendGrid
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
    if (!sendgridKey) {
      throw new Error('No email provider available. Set RESEND_API_KEY or SENDGRID_API_KEY.');
    }

  const sgFromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@digitalstudios.app';
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sendgridKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: sgFromEmail, name: fromName },
        subject,
        content: [
          { type: 'text/plain', value: plainText },
          { type: 'text/html', value: htmlContent },
        ],
      }),
    });

    if (!sgRes.ok) {
      throw new Error('SendGrid error ' + sgRes.status + ': ' + await sgRes.text());
    }

    return Response.json(
      { success: true, provider: 'sendgrid', to },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (error) {
    console.error('sendEmailFallback error:', error);
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});