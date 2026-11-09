import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * createAffiliateInvite — 2-tier affiliate program (Affiliate/Sub-Affiliate,
 * no deeper).
 *
 * Two callers, two shapes:
 *  - Admin creates a tier-1 invite: { email, proposed_tier: 1, proposed_share_pct }
 *    — proposed_share_pct is the admin-set pool % of every sale this
 *    affiliate refers.
 *  - An active tier-1 affiliate creates a tier-2 (sub-affiliate) invite:
 *    { email, proposed_tier: 2, proposed_share_pct } — proposed_share_pct is
 *    the % SHARE OF THE INVITER'S OWN POOL being granted, not a % of sale.
 *    The server enforces proposed_share_pct <= 100 — a parent can never mint
 *    commission the admin didn't authorize, and tier-2 affiliates cannot
 *    invite further (no tier-3).
 */

const APP_URL = 'https://digitalstudios.app';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function genToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const body = await req.json().catch(() => ({}));
    const email = (body?.email || '').trim().toLowerCase();
    const proposedTier = Number(body?.proposed_tier);
    const proposedSharePct = Number(body?.proposed_share_pct);

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'A valid email is required.' }, { status: 400, headers: CORS });
    }
    // No self-invites. A tier-1 affiliate inviting their own address would
    // create a second affiliate record under themselves and let them collect
    // the parent override on their own referrals — a closed loop paying twice
    // on one sale.
    if (email === String(user.email || '').trim().toLowerCase()) {
      return Response.json({ error: 'You cannot send an affiliate invite to your own account.' }, { status: 400, headers: CORS });
    }
    // Don't reissue to someone who is already an affiliate.
    const alreadyAffiliate = await base44.asServiceRole.entities.Affiliate
      .filter({ user_id: email }).catch(() => []);
    if (alreadyAffiliate.length) {
      return Response.json({ error: 'That account is already registered as an affiliate.' }, { status: 409, headers: CORS });
    }
    if (proposedTier !== 1 && proposedTier !== 2) {
      return Response.json({ error: 'proposed_tier must be 1 or 2.' }, { status: 400, headers: CORS });
    }
    if (!Number.isFinite(proposedSharePct) || proposedSharePct <= 0) {
      return Response.json({ error: 'proposed_share_pct must be a positive number.' }, { status: 400, headers: CORS });
    }

    let inviterId = user.email;
    let parentAffiliateId = '';

    if (proposedTier === 1) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Only an admin can create a tier-1 affiliate invite.' }, { status: 403, headers: CORS });
      }
      if (proposedSharePct > 100) {
        return Response.json({ error: 'proposed_share_pct cannot exceed 100.' }, { status: 400, headers: CORS });
      }
    } else {
      // Tier-2 (sub-affiliate) invite — the caller must be an active tier-1
      // affiliate. Tier-2 affiliates have no parent_affiliate to invite
      // under, so they are structurally unable to create tier-3 invites.
      const own = await base44.asServiceRole.entities.Affiliate.filter({ user_id: user.email });
      const parent = own.find((a: any) => a.tier === 1 && a.status === 'active');
      if (!parent && user.role !== 'admin') {
        return Response.json({ error: 'Only an active tier-1 affiliate can invite a sub-affiliate.' }, { status: 403, headers: CORS });
      }
      // The ceiling rule: a parent can only sub-allocate a slice of their
      // own admin-granted pool — never more than 100% of it.
      if (proposedSharePct > 100) {
        return Response.json({ error: 'A sub-affiliate share cannot exceed 100% of your pool.' }, { status: 400, headers: CORS });
      }
      if (parent) {
        inviterId = parent.id;
        parentAffiliateId = parent.id;
      }
    }

    const token = genToken();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const invite = await base44.asServiceRole.entities.AffiliateInvite.create({
      inviter_id: inviterId,
      email,
      proposed_tier: proposedTier,
      proposed_share_pct: proposedSharePct,
      parent_affiliate_id: parentAffiliateId,
      token,
      status: 'pending',
      expires_at: expiresAt,
    });

    const inviteLink = `${APP_URL}/affiliate?invite_token=${token}`;

    return Response.json({ success: true, invite_id: invite.id, token, invite_link: inviteLink }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
