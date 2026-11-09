import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * affiliateDashboardData — everything AffiliatePortal.jsx needs in one call.
 * Runs as service role because Commission/Referral/PayoutBatch rows aren't
 * created_by the affiliate (Base44's default row scoping would otherwise
 * hide them from the affiliate's own client-side queries) — this function
 * is the authorization boundary instead: it only ever returns data for the
 * Affiliate row matching the calling user's own email.
 */

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

    const affiliates = await base44.asServiceRole.entities.Affiliate.filter({ user_id: user.email });
    const affiliate = affiliates[0];
    if (!affiliate) {
      return Response.json({ is_affiliate: false }, { headers: CORS });
    }

    const [referrals, commissions, payouts, pendingInvites] = await Promise.all([
      base44.asServiceRole.entities.Referral.filter({ affiliate_id: affiliate.id }),
      base44.asServiceRole.entities.Commission.filter({ affiliate_id: affiliate.id }, '-created_date', 200),
      base44.asServiceRole.entities.PayoutBatch.filter({ affiliate_id: affiliate.id }, '-created_date', 50),
      affiliate.tier === 1
        ? base44.asServiceRole.entities.AffiliateInvite.filter({ parent_affiliate_id: affiliate.id, status: 'pending' })
        : Promise.resolve([]),
    ]);

    const subAffiliates = affiliate.tier === 1
      ? await base44.asServiceRole.entities.Affiliate.filter({ parent_affiliate_id: affiliate.id })
      : [];

    return Response.json({
      is_affiliate: true,
      affiliate,
      clicks: referrals.length,
      conversions: referrals.filter((r: any) => r.converted).length,
      commissions,
      sub_affiliates: subAffiliates,
      payouts,
      pending_invites: pendingInvites,
    }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
