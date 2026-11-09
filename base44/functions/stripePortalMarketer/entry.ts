import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { return_url } = await req.json();

    if (!STRIPE_KEY) {
      return Response.json({ error: 'Stripe not configured. Contact care@aevoice.ai to manage your subscription.' }, { status: 400 });
    }

    // Find subscription for stripe_customer_id
    const subs = await base44.entities.Subscription.filter({ owner_email: user.email }, null, 1);
    const customerId = subs[0]?.stripe_customer_id;

    if (!customerId) {
      return Response.json({ error: 'No billing record found. Please subscribe first.' }, { status: 404 });
    }

    const params = new URLSearchParams({
      customer: customerId,
      return_url: return_url || 'https://agentmarketer.base44.app/billing',
    });

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await res.json();

    if (!session.url) return Response.json({ error: session.error?.message || 'Portal creation failed' }, { status: 500 });

    return Response.json({ success: true, url: session.url });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
