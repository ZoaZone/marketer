import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_URL = 'https://digitalstudios.app';
const RESEND_KEY = 're_LGvr9fVz_4egrT1qX9NKcfKShZ7SoXfEY';
const RESEND_FROM = 'digitalstudios.app <noreply@digitalstudios.app>';

const genToken = (): string => {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
};

const buildHtml = (url: string, note: string, name: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#0a0a0a;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:20px;border:1px solid #1f1f2e;overflow:hidden;max-width:540px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7,#ec4899);padding:32px 36px;text-align:center;">
    <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">digitalstudios.app</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">AI Marketing & Media Creation Platform</div>
  </td></tr>
  <tr><td style="padding:36px;">
    <h2 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 14px;">
      ${name ? `Hi ${name}, you're` : "You're"} invited to<br/>
      <span style="color:#a855f7;">digitalstudios.app Beta</span>
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
    <p style="color:#555;font-size:12px;margin:0;">Expires in 30 days · <a href="mailto:care@aevoice.ai" style="color:#a855f7;">care@aevoice.ai</a></p>
  </td></tr>
  <tr><td style="background:#0d0d14;padding:16px 36px;border-top:1px solid #1f1f2e;text-align:center;">
    <p style="color:#444;font-size:11px;margin:0;">© 2026 AEVOICE · <a href="https://digitalstudios.app" style="color:#555;text-decoration:none;">digitalstudios.app</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

const buildFreeTrialHtml = (url: string, note: string, name: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#0a0a0a;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:20px;border:1px solid #1f1f2e;overflow:hidden;max-width:540px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7,#ec4899);padding:32px 36px;text-align:center;">
    <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">digitalstudios.app</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">AI Marketing & Media Creation Platform</div>
  </td></tr>
  <tr><td style="padding:36px;">
    <h2 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 14px;">
      ${name ? `Hi ${name}, try` : "Try"} <span style="color:#a855f7;">digitalstudios.app — free</span>
    </h2>
    <p style="color:#999;font-size:14px;line-height:1.7;margin:0 0 20px;">No credit card required. Create your account and explore the full platform with a free trial allowance.</p>
    ${note ? `<div style="background:#1a1a2e;border-left:3px solid #a855f7;padding:12px 16px;border-radius:8px;margin-bottom:20px;"><p style="color:#ccc;font-size:13px;margin:0;font-style:italic;">"${note}"</p></div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;25 free AI generations (≈5 images or 3 short videos)</td></tr>
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;Full access to Studio, Brands, Social Hub & Funnels</td></tr>
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;Email · SMS · WhatsApp campaign tools</td></tr>
      <tr><td style="padding:3px 0;color:#bbb;font-size:13px;">✅ &nbsp;Upgrade anytime — plans start at $49/mo</td></tr>
    </table>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 44px;border-radius:12px;">🚀 Start My Free Trial</a>
    </div>
    <div style="background:#0a0a0a;border:1px solid #222;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
      <p style="color:#555;font-size:10px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Your invite link</p>
      <p style="color:#a855f7;font-size:12px;margin:0;word-break:break-all;">${url}</p>
    </div>
    <p style="color:#555;font-size:12px;margin:0;">Expires in 30 days · <a href="mailto:care@aevoice.ai" style="color:#a855f7;">care@aevoice.ai</a></p>
  </td></tr>
  <tr><td style="background:#0d0d14;padding:16px 36px;border-top:1px solid #1f1f2e;text-align:center;">
    <p style="color:#444;font-size:11px;margin:0;">© 2026 AEVOICE · <a href="https://digitalstudios.app" style="color:#555;text-decoration:none;">digitalstudios.app</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);

    // SECURITY: every write below runs through asServiceRole, so an
    // unauthenticated caller could mint a valid 30-day invite token for any
    // address, overwrite an existing BetaRequest, and send mail from the app's
    // domain. The only call site is AdminDashboard, which is already gated on
    // user.role === 'admin' in the browser — that gate has to be enforced here
    // too, since a client-side check protects nothing.
    const caller = await base44.auth.me();
    if (!caller) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    }
    if (caller.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403, headers: CORS });
    }

    const payload = await req.json().catch(() => ({}));
    const { email, note = '', invited_by = caller.email || 'admin', source = 'manual_invite', full_name = '' } = payload;

    if (!email) {
      return Response.json({ error: 'email is required' }, { status: 400, headers: CORS });
    }

    const token = genToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const isFreeInvite = source === 'free_invite';
    let inviteRecord: any = { id: 'unknown' };

    // Free-trial invites don't enter the Beta program's approve/reject queue —
    // they just get a regular account at the standard free-trial limits.
    if (!isFreeInvite) {
      try {
        const existing = await base44.asServiceRole.entities.BetaRequest.filter({ email });
        if (existing?.length > 0) {
          await base44.asServiceRole.entities.BetaRequest.update(existing[0].id, {
            invite_token: token, invite_expires_at: expiresAt,
            status: 'approved', invite_sent: true,
            notes: note || existing[0].notes || '',
          });
          inviteRecord = existing[0];
        } else {
          inviteRecord = await base44.asServiceRole.entities.BetaRequest.create({
            email, full_name: full_name || '', status: 'approved',
            notes: note, invite_token: token, invite_expires_at: expiresAt, invite_sent: true,
          });
        }
      } catch (e: any) { console.error('BetaRequest DB error:', e.message); }
    }

    try {
      await base44.asServiceRole.entities.BetaInvite.create({
        email, token, invited_by, note, source, status: 'pending', expires_at: expiresAt,
      });
    } catch (e: any) { console.warn('BetaInvite create skipped:', e.message); }

    const inviteUrl = `${APP_URL}/invite/${token}`;
    const firstName = full_name ? full_name.split(' ')[0] : '';
    const subject = isFreeInvite
      ? `🚀 Try digitalstudios.app free — no credit card required`
      : `🎉 You're personally invited — Free Beta Access to digitalstudios.app`;
    const text = isFreeInvite
      ? `Hi${firstName ? ` ${firstName}` : ''}!\n\nYou're invited to try digitalstudios.app for free — 25 free AI generations (about 5 images or 3 short videos), full access to the platform, no credit card required.\n\nGet started:\n${inviteUrl}\n\nExpires in 30 days.\n\n— The digitalstudios.app Team`
      : `Hi${firstName ? ` ${firstName}` : ''}!\n\nYou've been personally selected for beta access to digitalstudios.app — full Agency-tier, free for 1 year.\n\nClaim your access:\n${inviteUrl}\n\nExpires in 30 days.\n\n— The digitalstudios.app Team`;
    const html = isFreeInvite ? buildFreeTrialHtml(inviteUrl, note, firstName) : buildHtml(inviteUrl, note, firstName);

    let provider = 'none';
    let emailError = '';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: [email], subject, html, text }),
    });
    const body = await res.json().catch(() => ({}));
    console.log('Resend response:', res.status, JSON.stringify(body));

    if (res.ok && body.id) {
      provider = 'resend';
      console.log('✅ Invite sent from noreply@digitalstudios.app, id:', body.id);
    } else {
      emailError = body.message || JSON.stringify(body);
      console.error('❌ Resend failed:', emailError);
    }

    return Response.json({
      success: true, email, invite_url: inviteUrl, invite_id: inviteRecord?.id, provider,
      ...(provider === 'none' ? { email_error: emailError } : {}),
    }, { headers: CORS });

  } catch (error: any) {
    console.error('sendBetaInvite fatal:', error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }
});
