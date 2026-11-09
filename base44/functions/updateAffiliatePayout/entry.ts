import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * updateAffiliatePayout — lets an affiliate connect/switch their own payout
 * rail. Affiliate rows aren't created_by the affiliate (acceptAffiliateInvite
 * writes them via asServiceRole), so a plain base44.entities.Affiliate.update
 * call from the affiliate's own browser would be blocked by this app's
 * row-scoping — this function is the authorization boundary instead: it
 * only ever touches the Affiliate row matching the caller's own email.
 *
 * Body: { method: "paypal" | "stripe_connect", paypal_email? }
 */

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const APP_URL = 'https://digitalstudios.app';

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

    const { method, paypal_email } = await req.json().catch(() => ({}));
    if (method !== 'paypal' && method !== 'stripe_connect') {
      return Response.json({ error: 'method must be "paypal" or "stripe_connect".' }, { status: 400, headers: CORS });
    }

    const matches = await base44.asServiceRole.entities.Affiliate.filter({ user_id: user.email });
    const affiliate = matches[0];
    if (!affiliate) return Response.json({ error: 'You are not an affiliate.' }, { status: 404, headers: CORS });

    if (method === 'paypal') {
      const email = (paypal_email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return Response.json({ error: 'A valid PayPal email is required.' }, { status: 400, headers: CORS });
      }
      await base44.asServiceRole.entities.Affiliate.update(affiliate.id, {
        payout_method: 'paypal',
        payout_account_ref: email,
      });
      return Response.json({ success: true }, { headers: CORS });
    }

    // stripe_connect
    if (!STRIPE_KEY) {
      return Response.json({ error: 'Stripe is not configured on this platform yet.' }, { status: 500, headers: CORS });
    }

    let accountId = affiliate.payout_method === 'stripe_connect' ? affiliate.payout_account_ref : '';
    if (!accountId) {
      const account = await stripeRequest('accounts', new URLSearchParams({
        type: 'express',
        email: user.email,
        'capabilities[transfers][requested]': 'true',
      }));
      if (!account?.id) {
        return Response.json({ error: account?.error?.message || 'Could not create a Stripe Connect account.' }, { status: 500, headers: CORS });
      }
      accountId = account.id;
    }

    const link = await stripeRequest('account_links', new URLSearchParams({
      account: accountId,
      refresh_url: `${APP_URL}/affiliate?onboarding=refresh`,
      return_url: `${APP_URL}/affiliate?onboarding=done`,
      type: 'account_onboarding',
    }));
    if (!link?.url) {
      return Response.json({ error: link?.error?.message || 'Could not start Stripe onboarding.' }, { status: 500, headers: CORS });
    }

    await base44.asServiceRole.entities.Affiliate.update(affiliate.id, {
      payout_method: 'stripe_connect',
      payout_account_ref: accountId,
    });

    return Response.json({ success: true, onboarding_url: link.url }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
