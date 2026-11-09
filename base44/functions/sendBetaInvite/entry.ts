import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendBetaInvite
 * Runs inside Marketer app (69c3c2f5acaefc3a7afad5fd).
 * 1. Creates BetaInvite record via asServiceRole
 * 2. Sends branded invite email: Base44 built-in → Resend → SendGrid
 * No auth.me() — admin guard is on the AdminDashboard frontend.
 */

const APP_URL = 'https://media.aevoice.ai';

const genToken = (): string => {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join('');
};

const buildHtml = (url: string, note: string, name: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#0a0a0a;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:20px;border:1px solid #1f1f2e;overflow:hidden;max-width:540px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7,#ec4899);padding:32px 36px;text-align:center;">
    <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">media.aevoice.ai</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">AI Marketing & Media Creation Platform</div>
  </td></tr>
  <tr><td style="padding:36px;">
    <h2 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 14px;">
      ${name ? `Hi ${name}, you're` : "You're"} invited to<br/>
      <span style="color:#a855f7;">media.aevoice.ai Beta</span>
    </h2>
    <p style="color:#999;font-size:14px;line-height:1.7;margin:0 0 20px;">You've been personally selected for exclusive early access — full Agency-tier, free for 1 year.</p>
    ${note ? `<div style="background:#1a1a2e;border-left:3px solid #a855f7;padding:12px 16px;border-radius:8px;margin-bottom:20px;"><p style="color:#ccc;font-size:13px;margin:0;font-style:italic;">"${note}"</p></div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;Full Agency-tier — all features unlocked</td></tr>
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;AI Media Studio — visuals, copy, video scripts</td></tr>
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;Email · SMS · WhatsApp · Social campaigns</td></tr>
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;Priority beta support & direct feedback channel</td></tr>
    </table>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 44px;border-radius:12px;">🚀 Claim My Free Access</a>
    </div>
    <div style="background:#0a0a0a;border:1px solid #222;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
      <p style="color:#555;font-size:10px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Your invite link</p>
      <p style="color:#a855f7;font-size:12px;margin:0;word-break:break-all;">${url}</p>
    </div>
    <p style="color:#555;font-size:12px;margin:0;">Expires in 30 days · <a href="mailto:hello@aevoice.ai" style="color:#a855f7;">hello@aevoice.ai</a></p>
  </td></tr>
  <tr><td style="background:#0d0d14;padding:16px 36px;border-top:1px solid #1f1f2e;text-align:center;">
    <p style="color:#444;font-size:11px;margin:0;">© 2026 AEVOICE · <a href="https://media.aevoice.ai" style="color:#555;text-decoration:none;">media.aevoice.ai</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

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
    const payload = await req.json().catch(() => ({}));
    const { email, note = '', invited_by = 'admin', source = 'manual_invite', full_name = '' } = payload;

    if (!email) {
      return Response.json({ error: 'email is required' }, {
        status: 400, headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // ── 1. Create BetaInvite record (service role = writes to Marketer app DB) ──
    const token = genToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const invite = await base44.asServiceRole.entities.BetaInvite.create({
      email,
      token,
      invited_by,
      note,
      status: 'pending',
      expires_at: expiresAt,
      source,
    });

    // ── 2. Build email content ────────────────────────────────────────────────
    const inviteUrl = `${APP_URL}/invite/${token}`;
    const firstName = full_name ? full_name.split(' ')[0] : '';
    const html = buildHtml(inviteUrl, note, firstName);
    const text = `Hi${firstName ? ` ${firstName}` : ''}!\n\nYou're invited to media.aevoice.ai Beta — full Agency-tier access, free.\n\nClaim your access:\n${inviteUrl}\n\nExpires in 30 days.\n\n— The media.aevoice.ai Team`;
    const subject = `🎉 You're personally invited — Free Beta Access to media.aevoice.ai`;

    // ── 3. Send email: Base44 built-in → Resend → SendGrid ───────────────────
    let provider = 'none';

    // PRIMARY: Base44 built-in (no key needed)
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject, body: text });
      provider = 'base44';
    } catch (e) {
      console.warn('Base44 SendEmail failed:', e.message);
    }

    // SECONDARY: Resend
    if (provider === 'none') {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@media.aevoice.ai';
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: `media.aevoice.ai <${fromEmail}>`, to: [email], subject, text, html }),
        });
        if (res.ok) {
          provider = 'resend';
        } else {
          console.error('Resend failed:', await res.text());
        }
      }
    }

    // TERTIARY: SendGrid
    if (provider === 'none') {
      const sgKey = Deno.env.get('SENDGRID_API_KEY');
      if (sgKey) {
        const sgFrom = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@aevoice.ai';
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: sgFrom, name: 'media.aevoice.ai' },
            subject,
            content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
          }),
        });
        if (sgRes.ok) {
          provider = 'sendgrid';
        } else {
          console.error('SendGrid failed:', await sgRes.text());
        }
      }
    }

    if (provider === 'none') {
      console.warn('All email providers failed — invite record created but email not sent');
    }

    return Response.json(
      { success: true, email, invite_id: invite.id, invite_url: inviteUrl, provider },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (error: any) {
    console.error('sendBetaInvite error:', error);
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
