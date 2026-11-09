import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * recordCommission — called by the buyer's own browser right after a
 * checkout actually completes (stripeCheckoutCREAM's demo path or its
 * action:"confirm" step; paypalCheckout's capture_order step). Resolves the
 * affiliate chain for the sale and writes split Commission rows.
 *
 * Security note: this endpoint is reachable by any authenticated user, so
 * nothing here trusts client-supplied money numbers. sale_amount is always
 * derived server-side from the Subscription's own plan_tier (never from the
 * request body); the caller must own the subscription_id they name; and
 * writing is idempotent per subscription_id so repeat calls can't mint
 * duplicate commissions.
 *
 * Body: { subscription_id, cookie_id }
 *
 * Split math (2-tier, no deeper):
 *  - Sale referred directly by a tier-1 affiliate: one Commission row,
 *    role "direct", pct = affiliate.commission_pct (the admin-set pool).
 *  - Sale referred by a tier-2 sub-affiliate: two rows —
 *    "direct" to the sub-affiliate at their effective_pool_pct (parent's
 *    pool × their share), and "override" to the tier-1 parent for the rest
 *    of the pool (parent.commission_pct − sub.effective_pool_pct). The two
 *    rows always sum to exactly the admin-set pool — never more.
 */

// Monthly USD list prices — mirrors stripeCheckoutCREAM's PLANS map (the
// canonical source) and Pricing.jsx's displayed prices. Commission is always
// computed off this canonical USD amount, never off a client-supplied figure
// or a foreign-currency capture amount (PayPal charges in INR) — that keeps
// commission accounting currency-stable. Lane-2 Enterprise ($1,499+/mo) is
// negotiated/custom pricing outside self-serve Stripe Checkout — $1,499 here
// is only a floor for the rare case an admin manually sets that tier; it
// won't reflect an actual negotiated deal.
const PRICES: Record<string, number> = {
  creator: 19, starter: 49, growth: 149, agency: 399,
  indie: 99, studio: 399, dubbing_house: 499, enterprise: 1499,
  byok: 49,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { subscription_id, cookie_id } = await req.json().catch(() => ({}));
    if (!subscription_id) {
      return Response.json({ error: 'subscription_id is required.' }, { status: 400, headers: CORS });
    }

    const subs = await base44.asServiceRole.entities.Subscription.filter({ id: subscription_id });
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'Subscription not found.' }, { status: 404, headers: CORS });
    if (sub.owner_email !== user.email) {
      return Response.json({ error: 'Forbidden.' }, { status: 403, headers: CORS });
    }
    if (sub.status !== 'active') {
      return Response.json({ success: true, skipped: 'not_active' }, { headers: CORS });
    }

    // Idempotent — a subscription can only ever generate one set of
    // commission rows, no matter how many times this is called.
    const existingCommissions = await base44.asServiceRole.entities.Commission.filter({ subscription_id });
    if (existingCommissions.length) {
      return Response.json({ success: true, already_recorded: true }, { headers: CORS });
    }

    if (!cookie_id) {
      return Response.json({ success: true, no_referral: true }, { headers: CORS });
    }

    const referrals = await base44.asServiceRole.entities.Referral.filter({ cookie_id, converted: false });
    const referral = referrals[0];
    if (!referral) {
      return Response.json({ success: true, no_referral: true }, { headers: CORS });
    }

    const windowMs = (referral.attribution_window_days || 30) * 24 * 60 * 60 * 1000;
    const firstTouchMs = referral.first_touch_at ? new Date(referral.first_touch_at).getTime() : 0;
    if (!firstTouchMs || Date.now() - firstTouchMs > windowMs) {
      return Response.json({ success: true, no_referral: true, reason: 'attribution_window_expired' }, { headers: CORS });
    }

    const affiliates = await base44.asServiceRole.entities.Affiliate.filter({ code: referral.landing_code, status: 'active' });
    const affiliate = affiliates[0];
    if (!affiliate) {
      return Response.json({ success: true, no_referral: true, reason: 'affiliate_inactive' }, { headers: CORS });
    }

    const saleAmount = PRICES[sub.plan_tier] ?? PRICES[(sub.plan_name || '').toLowerCase()] ?? 0;
    if (!saleAmount) {
      return Response.json({ success: true, no_referral: true, reason: 'unrecognized_plan' }, { headers: CORS });
    }

    const rows: Array<{ affiliate_id: string; role: string; pct_applied: number; amount: number }> = [];

    if (affiliate.tier === 1) {
      rows.push({
        affiliate_id: affiliate.id,
        role: 'direct',
        pct_applied: affiliate.commission_pct,
        amount: Math.round(saleAmount * affiliate.commission_pct) / 100,
      });
    } else {
      const directPct = affiliate.effective_pool_pct || 0;
      rows.push({
        affiliate_id: affiliate.id,
        role: 'direct',
        pct_applied: directPct,
        amount: Math.round(saleAmount * directPct) / 100,
      });

      const parentMatches = await base44.asServiceRole.entities.Affiliate.filter({ id: affiliate.parent_affiliate_id, status: 'active' });
      const parent = parentMatches[0];
      if (parent) {
        const overridePct = Math.max(0, (parent.commission_pct || 0) - directPct);
        if (overridePct > 0) {
          rows.push({
            affiliate_id: parent.id,
            role: 'override',
            pct_applied: overridePct,
            amount: Math.round(saleAmount * overridePct) / 100,
          });
        }
      }
    }

    const created = [];
    for (const row of rows) {
      const commission = await base44.asServiceRole.entities.Commission.create({
        subscription_id,
        plan: sub.plan_name || sub.plan_tier || '',
        sale_amount: saleAmount,
        affiliate_id: row.affiliate_id,
        role: row.role,
        pct_applied: row.pct_applied,
        amount: row.amount,
        currency: 'usd',
        status: 'pending',
      });
      created.push(commission);

      const affMatches = await base44.asServiceRole.entities.Affiliate.filter({ id: row.affiliate_id });
      const aff = affMatches[0];
      if (aff) {
        await base44.asServiceRole.entities.Affiliate.update(aff.id, {
          total_earned: (aff.total_earned || 0) + row.amount,
          balance_due: (aff.balance_due || 0) + row.amount,
        });
      }
    }

    await base44.asServiceRole.entities.Referral.update(referral.id, {
      converted: true,
      referred_user_id: user.email,
    });

    return Response.json({ success: true, commissions: created }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
