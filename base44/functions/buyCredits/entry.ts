import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const APP_URL = 'https://digitalstudios.app';

// $0.06 per AI generation credit — roughly a 50% platform margin over the
// ~$0.04 raw provider cost of one image/video-scene generation.
const PRICE_PER_CREDIT = 0.06;
const MIN_PURCHASE_USD = 10;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function stripeRequest(endpoint: string, body: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const body = await req.json();

    // Stripe Checkout has no webhook receiver in this codebase (see
    // stripeCheckoutCREAM's "confirm" action for the subscription side of
    // this same gap). Before this action existed, a real (non-demo) credit
    // purchase redirected back to /billing?credits_purchased=N with NO
    // server-side step that ever actually credited the ledger — customers
    // paid Stripe and got nothing added to their balance. This mirrors
    // stripeCheckoutCREAM's confirm flow: verify the session with Stripe
    // directly (never trust the redirect alone), then apply it exactly once.
    if (body?.action === 'confirm') {
      const sessionId = body?.session_id;
      if (!sessionId) return Response.json({ error: 'session_id is required.' }, { status: 400, headers: CORS });
      if (!STRIPE_KEY) return Response.json({ error: 'Stripe is not configured.' }, { status: 500, headers: CORS });

      const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${STRIPE_KEY}` },
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok) return Response.json({ error: session?.error?.message || 'Could not verify session.' }, { status: 400, headers: CORS });
      if (session.payment_status !== 'paid') {
        return Response.json({ success: true, confirmed: false }, { headers: CORS });
      }
      if (session.metadata?.type !== 'credits') {
        return Response.json({ error: 'Not a credits checkout session.' }, { status: 400, headers: CORS });
      }
      if (session.metadata?.user_email && session.metadata.user_email !== user.email) {
        return Response.json({ error: 'Session does not belong to this user.' }, { status: 403, headers: CORS });
      }

      const creditsToApply = parseInt(session.metadata?.credits || '0', 10);
      if (!creditsToApply) {
        return Response.json({ error: 'No credits recorded on this session.' }, { status: 400, headers: CORS });
      }

      const existingForConfirm = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email });
      const subForConfirm = existingForConfirm?.[0];

      // Idempotency: a session already recorded here is never credited
      // twice — covers a page refresh, a double-fired effect, or the user
      // revisiting the success URL from browser history.
      const appliedSessions: string[] = subForConfirm?.credited_stripe_sessions || [];
      if (appliedSessions.includes(sessionId)) {
        return Response.json({ success: true, confirmed: false, already_applied: true }, { headers: CORS });
      }

      let confirmedBalance: number;
      if (subForConfirm) {
        confirmedBalance = (subForConfirm.credits_balance || 0) + creditsToApply;
        await base44.asServiceRole.entities.Subscription.update(subForConfirm.id, {
          credits_balance: confirmedBalance,
          credited_stripe_sessions: [...appliedSessions, sessionId],
        });
      } else {
        confirmedBalance = creditsToApply;
        await base44.asServiceRole.entities.Subscription.create({
          owner_email: user.email,
          plan_name: 'Free',
          plan_tier: 'free',
          status: 'active',
          credits_balance: confirmedBalance,
          credited_stripe_sessions: [sessionId],
        });
      }

      return Response.json({
        success: true, confirmed: true, credits_added: creditsToApply, credits_balance: confirmedBalance,
      }, { headers: CORS });
    }

    const { amount_usd, client_id } = body;
    const amount = Math.round(Number(amount_usd) * 100) / 100;
    if (!amount || amount < MIN_PURCHASE_USD) {
      return Response.json({ error: `Minimum credit purchase is $${MIN_PURCHASE_USD}` }, { status: 400, headers: CORS });
    }

    const credits = Math.floor(amount / PRICE_PER_CREDIT);

    if (!STRIPE_KEY) {
      // No Stripe key — credit the ledger directly (demo/PayPal mode).
      // The user's Subscription record doubles as the credit ledger.
      const existing = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email });
      let newBalance: number;
      if (existing?.length) {
        const sub = existing[0];
        newBalance = (sub.credits_balance || 0) + credits;
        await base44.asServiceRole.entities.Subscription.update(sub.id, { credits_balance: newBalance });
      } else {
        newBalance = credits;
        await base44.asServiceRole.entities.Subscription.create({
          owner_email: user.email,
          client_id: client_id || '',
          plan_name: 'Free',
          plan_tier: 'free',
          status: 'active',
          credits_balance: newBalance,
        });
      }
      return Response.json({
        success: true, demo: true, credits_added: credits, credits_balance: newBalance,
        message: `Added ${credits.toLocaleString()} credits for $${amount.toFixed(2)}`,
      }, { headers: CORS });
    }

    // Stripe configured — create a checkout session first. Credits are only
    // applied once payment is confirmed (webhook / success-page handler), so
    // a cancelled checkout never grants free credits.
    const params = new URLSearchParams({
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `digitalstudios.app — ${credits.toLocaleString()} AI Generation Credits`,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][quantity]': '1',
      mode: 'payment',
      customer_email: user.email,
      success_url: `${APP_URL}/billing?session_id={CHECKOUT_SESSION_ID}&type=credits&credits_purchased=${credits}`,
      cancel_url: `${APP_URL}/billing`,
      'metadata[type]': 'credits',
      'metadata[credits]': String(credits),
      'metadata[user_email]': user.email,
      // Same Stripe Tax wiring as stripeCheckoutCREAM — this is real money
      // through the same checkout system, so it gets taxed the same way.
      'automatic_tax[enabled]': 'true',
      billing_address_collection: 'required',
    });

    const session = await stripeRequest('checkout/sessions', params);
    if (!session.url) return Response.json({ error: session.error?.message || 'Stripe session creation failed' }, { status: 500, headers: CORS });

    return Response.json({ success: true, checkout_url: session.url, credits_added: credits }, { headers: CORS });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }
});
