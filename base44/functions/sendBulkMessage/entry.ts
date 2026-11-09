import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Copied from base44/_shared/rateLimit.block.ts — keep in sync by hand.
// This endpoint requires auth, but it is the actual bulk-send TRIGGER —
// a compromised or abused account (or a runaway retry loop in a client
// integration) could otherwise blast unlimited email/SMS/WhatsApp through
// the platform's own paid provider keys with no ceiling at all. Note: the
// plan catalog (src/config/plans.js) already defines a monthly
// `bulk_messages` allowance per tier, but nothing in this file enforces it
// today — that is a separate metering gap from the flat safety cap below,
// which exists purely to bound abuse regardless of plan.
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

// Same fixed-window counter as checkRateLimit, but returns the resulting
// count instead of a boolean pass/fail — bulk sends are capped by RECIPIENT
// VOLUME per day, not by call count, so the caller needs to know how much
// headroom is left in today's bucket before it starts sending.
async function addAndGetWindowCount(base44: any, bucket: string, amount: number, windowMs: number): Promise<number> {
  const windowIndex = Math.floor(Date.now() / windowMs);
  const key = `${bucket}:${windowIndex}`;
  try {
    const rows = await base44.asServiceRole.entities.RateLimitCounter.filter({ key });
    const row = rows?.[0];
    if (!row) {
      await base44.asServiceRole.entities.RateLimitCounter.create({ key, count: amount });
      return amount;
    }
    const next = row.count + amount;
    await base44.asServiceRole.entities.RateLimitCounter.update(row.id, { count: next });
    return next;
  } catch (e) {
    console.warn('addAndGetWindowCount: entity read/write failed, allowing request:', (e as Error).message);
    return 0;
  }
}
// ── END RATE LIMIT BLOCK ────────────────────────────────────────────────

// Flat daily safety ceiling on bulk-send recipient volume, per user,
// independent of plan tier — a last-resort backstop against runaway abuse.
const DAILY_RECIPIENT_SAFETY_CAP = 2000;

/**
 * Platform-managed email sending — used when the user hasn't configured
 * their own SendGrid key. Chain: Base44 built-in -> Resend -> SendGrid
 * (admin keys). Mirrors sendEmailFallback's provider order. Billed at the
 * platform's "managed sending" rate (provider cost + 30% usage margin) once
 * the account's plan-included quota is used up.
 */
// Platform brand — shared by every send path below (platform-managed Resend/
// SendGrid, and the BYO SendGrid fallback further down) so a customer's
// campaign email never shows a from-name/domain other than this app's own.
const PLATFORM_FROM_NAME = 'digitalstudios.app';
const PLATFORM_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@digitalstudios.app';

async function sendPlatformEmail(base44: any, { to, subject, html, text }: any): Promise<{ ok: boolean; error?: string }> {
  const fromName = PLATFORM_FROM_NAME;
  const fromEmail = PLATFORM_FROM_EMAIL;
  const plainText = text || '';
  const htmlContent = html || '<pre style="font-family:sans-serif;white-space:pre-wrap">' + plainText + '</pre>';

  // PRIMARY: Base44 built-in
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body: plainText });
    return { ok: true };
  } catch (_e) { /* try next provider */ }

  // SECONDARY: Resend
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, text: plainText, html: htmlContent }),
    });
    if (res.ok) return { ok: true };
  }

  // TERTIARY: SendGrid (platform/admin key)
  const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
  if (sendgridKey) {
    const sgFromEmail = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@digitalstudios.app';
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sendgridKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: sgFromEmail, name: fromName },
        subject,
        content: [{ type: 'text/plain', value: plainText }, { type: 'text/html', value: htmlContent }],
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await res.text() };
  }

  return { ok: false, error: 'No platform email provider configured (Base44 / Resend / SendGrid).' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req);
    // Bot-abuse guard: caps how often this trigger can be invoked at all,
    // regardless of account — a scripted/looping caller hitting it from one
    // source IP is stopped here before it ever reaches the send loop below.
    if (!(await checkRateLimit(base44, `bulk_send_min:${ip}`, 5, 60 * 1000))) {
      return Response.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
    }

    const { campaign_id, client_id } = await req.json();
    if (!campaign_id) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

    const campaigns = await base44.entities.MarketingCampaign.filter({ id: campaign_id, created_by: user.email });
    if (!campaigns.length) return Response.json({ error: 'Campaign not found' }, { status: 404 });
    const campaign = campaigns[0];

    const contacts = client_id
      ? await base44.entities.MarketingContact.filter({ client_id, created_by: user.email })
      : await base44.entities.MarketingContact.filter({ created_by: user.email }, '-created_date', 500);

    const channelFilter = {
      email:     (c) => c.opted_in_email && c.email,
      sms:       (c) => c.opted_in_sms && c.phone,
      whatsapp:  (c) => c.opted_in_whatsapp && (c.whatsapp || c.phone),
    };
    const filter = channelFilter[campaign.type] || channelFilter.email;
    const eligible = contacts.filter(filter);

    // Per-user/per-day send-volume safety cap. This is a flat abuse ceiling
    // (see DAILY_RECIPIENT_SAFETY_CAP above), not the plan's own monthly
    // bulk_messages allowance — a compromised or runaway account still gets
    // stopped even on a plan that would otherwise allow it. Reserve the
    // volume for today's window BEFORE sending anything.
    const todaysRecipientCount = await addAndGetWindowCount(
      base44, `bulk_send_day:${user.email}`, eligible.length, 24 * 60 * 60 * 1000,
    );
    if (todaysRecipientCount > DAILY_RECIPIENT_SAFETY_CAP) {
      return Response.json({
        error: `Daily bulk-send limit reached (${DAILY_RECIPIENT_SAFETY_CAP} recipients/day). Please try again tomorrow or contact support to raise this limit.`,
      }, { status: 429 });
    }

    // Retrieve "bring your own" keys from user settings — when present, the
    // user's own credentials/billing are used (no platform margin). When
    // absent, sends fall back to the platform's managed providers below
    // (admin env vars), billed per the cost+30% managed-sending rates.
    const userSettings = (user as any).settings || {};
    const apiKeys = userSettings.api_keys || {};
    const sendgridKey = apiKeys.sendgrid_key || '';
    const twilioSid   = apiKeys.twilio_sid   || Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const twilioToken = apiKeys.twilio_token || Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const twilioPhone = apiKeys.twilio_phone || Deno.env.get('TWILIO_PHONE_NUMBER') || '';
    const waToken     = apiKeys.whatsapp_token   || Deno.env.get('WHATSAPP_TOKEN') || '';
    const waPhoneId   = apiKeys.whatsapp_phone_id || Deno.env.get('WHATSAPP_PHONE_ID') || '';

    const smsIsByo = !!(apiKeys.twilio_sid && apiKeys.twilio_token);
    const waIsByo  = !!(apiKeys.whatsapp_token && apiKeys.whatsapp_phone_id);

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of eligible) {
      let status = 'pending';
      let errorMsg = '';
      let sentVia: 'byo' | 'platform' = 'platform';

      try {
        if (campaign.type === 'email') {
          if (sendgridKey) {
            // Bring-your-own SendGrid — sent on the user's own account/billing
            const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
              method: 'POST',
              headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: contact.email, name: contact.full_name || '' }] }],
                // Was hardcoded to 'noreply@agentmarketer.ai' / "Agent Marketer" —
                // a stale brand/domain from before this app was renamed to Digital
                // Studio, unrelated to the customer's own verified SendGrid sender
                // identity either way. Using the platform's own consistent brand
                // here at least stops advertising a dead, unrelated product name;
                // a customer sending on their OWN SendGrid key ideally supplies
                // their own from-address (no such setting exists yet — see the
                // hardening-pass report for this as a follow-up).
                from: { email: PLATFORM_FROM_EMAIL, name: PLATFORM_FROM_NAME },
                subject: campaign.subject || campaign.name,
                content: [{ type: 'text/html', value: campaign.body || campaign.subject || '' }],
              }),
            });
            status = sgRes.ok ? 'delivered' : 'failed';
            if (!sgRes.ok) errorMsg = await sgRes.text();
            sentVia = 'byo';
          } else {
            // Platform-managed sending (Base44 -> Resend -> SendGrid)
            const result = await sendPlatformEmail(base44, {
              to: contact.email,
              subject: campaign.subject || campaign.name,
              text: campaign.body || campaign.subject || '',
            });
            status = result.ok ? 'delivered' : 'pending';
            if (!result.ok) errorMsg = result.error || 'Platform email sending unavailable. Add your own SendGrid key in Settings.';
            sentVia = 'platform';
          }

        } else if (campaign.type === 'sms' && twilioSid && twilioToken) {
          // Twilio SMS — user's own account if configured, else platform Twilio
          const formData = new URLSearchParams({
            To: contact.phone,
            From: twilioPhone,
            Body: campaign.body || '',
          });
          const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: `Basic ${btoa(twilioSid + ':' + twilioToken)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
          });
          status = twRes.ok ? 'delivered' : 'failed';
          if (!twRes.ok) errorMsg = await twRes.text();
          sentVia = smsIsByo ? 'byo' : 'platform';

        } else if (campaign.type === 'whatsapp' && waToken && waPhoneId) {
          // WhatsApp Cloud API — user's own BSP token if configured, else platform
          const phone = (contact.whatsapp || contact.phone || '').replace(/\D/g, '');
          const waRes = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone,
              type: 'text',
              text: { body: campaign.body || '' },
            }),
          });
          status = waRes.ok ? 'delivered' : 'failed';
          if (!waRes.ok) errorMsg = await waRes.text();
          sentVia = waIsByo ? 'byo' : 'platform';

        } else {
          // No API keys configured for SMS/WhatsApp — queue for later
          status = 'pending';
          errorMsg = 'No API keys configured. Add keys in Settings.';
        }
      } catch (err) {
        status = 'failed';
        errorMsg = (err as Error).message;
        failedCount++;
      }

      await base44.entities.BulkMessage.create({
        client_id: client_id || '',
        campaign_id,
        channel: campaign.type,
        recipient_email: contact.email || '',
        recipient_phone: contact.phone || '',
        message_body: campaign.body || '',
        status,
        sent_via: sentVia,
        sent_at: new Date().toISOString(),
        error_message: errorMsg,
      });

      if (status === 'delivered' || status === 'pending') sentCount++;
    }

    await base44.entities.MarketingCampaign.update(campaign_id, {
      sent_count: (campaign.sent_count || 0) + sentCount,
      status: 'running',
    });

    return Response.json({ success: true, sent_count: sentCount, failed_count: failedCount, total_eligible: eligible.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
