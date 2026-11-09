import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * trackReferral — public, called on first landing with ?ref=CODE. Records a
 * first-touch Referral row keyed by a client-generated cookie_id (this is a
 * browser SPA, so a persistent localStorage id stands in for a server
 * cookie). Never errors hard on a bad/typo'd code — a broken referral link
 * should never break page load for a visitor.
 *
 * Body: { code, cookie_id }
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
    const { code, cookie_id } = await req.json().catch(() => ({}));

    if (!code || !cookie_id) {
      return Response.json({ success: false, error: 'code and cookie_id are required.' }, { status: 400, headers: CORS });
    }

    // First-touch attribution only — if this browser already has a Referral
    // row, don't overwrite it with a different code on a later visit.
    const existing = await base44.asServiceRole.entities.Referral.filter({ cookie_id });
    if (existing.length) {
      return Response.json({ success: true, already_tracked: true }, { headers: CORS });
    }

    const affiliates = await base44.asServiceRole.entities.Affiliate.filter({ code, status: 'active' });
    const affiliate = affiliates[0];
    if (!affiliate) {
      // Not a real/active affiliate code — quietly no-op so a mistyped or
      // stale ?ref= link never surfaces an error to the visitor.
      return Response.json({ success: false, reason: 'unknown_code' }, { headers: CORS });
    }

    // Best-effort: if the visitor happens to already be logged in, capture
    // that now — recordCommission still resolves via cookie_id regardless.
    let referredUserId = '';
    try {
      const maybeUser = await base44.auth.me();
      if (maybeUser?.email) referredUserId = maybeUser.email;
    } catch (_) { /* anonymous visitor — expected */ }

    await base44.asServiceRole.entities.Referral.create({
      affiliate_id: affiliate.id,
      cookie_id,
      referred_user_id: referredUserId,
      landing_code: code,
      first_touch_at: new Date().toISOString(),
      converted: false,
      attribution_window_days: 30,
    });

    return Response.json({ success: true }, { headers: CORS });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
