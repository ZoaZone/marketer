import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendEmailFallback — Sends transactional emails to ANY external address.
 *
 * Primary:  Resend (RESEND_API_KEY)
 *   From:   RESEND_FROM_EMAIL env var (default: noreply@media.aevoice.ai)
 *   Domain: media.aevoice.ai — verified & active in Resend ✅
 *
 * Fallback: SendGrid (SENDGRID_API_KEY)
 *   From:   SENDGRID_FROM_EMAIL env var (default: noreply@aevoice.ai)
 *
 * Set env vars:
 *   RESEND_API_KEY       — your Resend API key
 *   RESEND_FROM_EMAIL    — sender address (default: noreply@media.aevoice.ai)
 *   SENDGRID_API_KEY     — SendGrid key (fallback only)
 *   SENDGRID_FROM_EMAIL  — SendGrid from address (fallback only)
 */
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
    const { to, subject, body, text, html, from_name } = await req.json();
    if (!to || !subject || (!body && !text && !html)) {
      return Response.json({ error: 'to, subject, and body/text are required' }, {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const fromName = from_name || 'media.aevoice.ai';
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@media.aevoice.ai';
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

    const sgFromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@aevoice.ai';
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