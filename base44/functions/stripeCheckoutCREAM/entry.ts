import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const APP_URL = 'https://agentmarketer.base44.app';

const PLANS: Record<string, { name: string; price_monthly: number; price_yearly: number; tier: string }> = {
  starter: { name: 'Starter', price_monthly: 4900,  price_yearly: 47000, tier: 'starter' },
  growth:  { name: 'Growth',  price_monthly: 14900, price_yearly: 143000, tier: 'growth' },
  agency:  { name: 'Agency',  price_monthly: 39900, price_yearly: 383000, tier: 'agency' },
};

async function stripeRequest(endpoint: string, body: Record<string, unknown> | URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body instanceof URLSearchParams ? body : new URLSearchParams(body as Record<string, string>),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan, billing = 'monthly', client_id } = await req.json();
    const selectedPlan = PLANS[plan];
    if (!selectedPlan) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    if (!STRIPE_KEY) {
      // No Stripe key — create subscription record directly (demo/PayPal mode)
      const sub = await base44.entities.Subscription.create({
        owner_email: user.email,
        client_id: client_id || '',
        plan_name: selectedPlan.name,
        plan_tier: selectedPlan.tier,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return Response.json({ success: true, subscription_id: sub.id, message: `Subscribed to ${selectedPlan.name}`, demo: true });
    }

    const amount = billing === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly;

    // Create Stripe checkout session
    const params = new URLSearchParams({
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Agent Marketer ${selectedPlan.name}`,
      'line_items[0][price_data][recurring][interval]': billing === 'yearly' ? 'year' : 'month',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      customer_email: user.email,
      success_url: `${APP_URL}/billing?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${APP_URL}/pricing`,
      'metadata[plan]': plan,
      'metadata[user_email]': user.email,
      'metadata[billing]': billing,
    });

    const session = await stripeRequest('checkout/sessions', params);

    if (!session.url) return Response.json({ error: session.error?.message || 'Stripe session creation failed' }, { status: 500 });

    // Pre-create subscription record (will be confirmed by webhook or on success page)
    await base44.entities.Subscription.create({
      owner_email: user.email,
      client_id: client_id || '',
      plan_name: selectedPlan.name,
      plan_tier: selectedPlan.tier,
      stripe_customer_id: session.customer || '',
      stripe_subscription_id: session.subscription || '',
      status: 'pending',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return Response.json({ success: true, checkout_url: session.url, session_id: session.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
