import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { campaign_id, client_id } = await req.json();
    if (!campaign_id) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

    const campaigns = await base44.entities.MarketingCampaign.filter({ id: campaign_id });
    if (!campaigns.length) return Response.json({ error: 'Campaign not found' }, { status: 404 });
    const campaign = campaigns[0];

    const contacts = client_id
      ? await base44.entities.MarketingContact.filter({ client_id })
      : await base44.entities.MarketingContact.list('-created_date', 500);

    const channelFilter = {
      email:     (c) => c.opted_in_email && c.email,
      sms:       (c) => c.opted_in_sms && c.phone,
      whatsapp:  (c) => c.opted_in_whatsapp && (c.whatsapp || c.phone),
    };
    const filter = channelFilter[campaign.type] || channelFilter.email;
    const eligible = contacts.filter(filter);

    // Retrieve API keys from user settings
    const userSettings = (user as any).settings || {};
    const apiKeys = userSettings.api_keys || {};
    const sendgridKey = apiKeys.sendgrid_key || Deno.env.get('SENDGRID_API_KEY') || '';
    const twilioSid   = apiKeys.twilio_sid   || Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const twilioToken = apiKeys.twilio_token || Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const twilioPhone = apiKeys.twilio_phone || Deno.env.get('TWILIO_PHONE_NUMBER') || '';
    const waToken     = apiKeys.whatsapp_token   || Deno.env.get('WHATSAPP_TOKEN') || '';
    const waPhoneId   = apiKeys.whatsapp_phone_id || Deno.env.get('WHATSAPP_PHONE_ID') || '';

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of eligible) {
      let status = 'pending';
      let errorMsg = '';

      try {
        if (campaign.type === 'email' && sendgridKey) {
          // Real SendGrid email
          const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: contact.email, name: contact.full_name || '' }] }],
              from: { email: 'noreply@agentmarketer.ai', name: 'Agent Marketer' },
              subject: campaign.subject || campaign.name,
              content: [{ type: 'text/html', value: campaign.body || campaign.subject || '' }],
            }),
          });
          status = sgRes.ok ? 'delivered' : 'failed';
          if (!sgRes.ok) errorMsg = await sgRes.text();

        } else if (campaign.type === 'sms' && twilioSid && twilioToken) {
          // Real Twilio SMS
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

        } else if (campaign.type === 'whatsapp' && waToken && waPhoneId) {
          // Real WhatsApp Cloud API
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

        } else {
          // No API keys configured — mark as pending (queue for later)
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
