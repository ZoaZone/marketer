import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

  try {
    const base44 = createClientFromRequest(req);
    // `note` added so the public Agency Enquiry and Agent Program forms can
    // route through here instead of creating BetaRequest from the browser.
    // Client-side creation stopped being possible once BetaRequest.create was
    // locked to admin — those two forms silently broke until they were moved.
    const { full_name, email, company, use_case, note } = await req.json();

    if (!full_name || !email) {
      return Response.json({ error: 'full_name and email are required' }, {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Check for duplicate email (service role — no auth needed for public form)
    const existing = await base44.asServiceRole.entities.BetaRequest.filter({ email: String(email).trim().toLowerCase() });
    if (existing && existing.length > 0) {
      return Response.json({ success: true, message: 'Already registered' }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
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
      const sgFrom = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@aevoice.ai';
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

    return Response.json({ success: true, id: record.id }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    console.error('submitBetaRequest error:', error);
    return Response.json({ error: error.message }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
});