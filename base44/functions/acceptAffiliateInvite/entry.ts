import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * acceptAffiliateInvite — activates an Affiliate from a pending
 * AffiliateInvite, generates a unique referral code, and (best-effort)
 * kicks off Stripe Connect Express onboarding so the affiliate can receive
 * payouts. Stripe collects KYC/tax details itself during that hosted flow —
 * this function never touches bank details directly.
 *
 * Body: { token }
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

function slugify(email: string): string {
  return (email.split('@')[0] || 'AFF').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) || 'AFF';
}

async function generateUniqueCode(base44: any, email: string): Promise<string> {
  const prefix = slugify(email);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const candidate = `${prefix}${suffix}`;
    const existing = await base44.asServiceRole.entities.Affiliate.filter({ code: candidate });
    if (!existing.length) return candidate;
  }
  // Astronomically unlikely fallback — still unique enough given the entropy above.
  return `${prefix}${Date.now().toString(36).toUpperCase()}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { token } = await req.json().catch(() => ({}));
    if (!token) return Response.json({ error: 'token is required.' }, { status: 400, headers: CORS });

    const invites = await base44.asServiceRole.entities.AffiliateInvite.filter({ token });
    const invite = invites[0];
    if (!invite) return Response.json({ error: 'Invite not found.' }, { status: 404, headers: CORS });

    // SECURITY: the invite must belong to the person redeeming it.
    //
    // Without this check, possession of a token was the ONLY requirement, and
    // the Affiliate below is created with user_id = the CALLER's email. Any
    // signed-in user who obtained a token — a forwarded link, or (until the
    // matching RLS was added) simply listing AffiliateInvite from the browser —
    // could redeem an invite issued to someone else and become an affiliate at
    // a commission rate an admin had authorised for a different person. That is
    // direct financial fraud, so it is checked before anything else is touched.
    const inviteEmail = String(invite.email || '').trim().toLowerCase();
    const callerEmail = String(user.email || '').trim().toLowerCase();
    if (!inviteEmail || inviteEmail !== callerEmail) {
      return Response.json(
        { error: 'This invite was issued to a different email address. Sign in with the invited account to accept it.' },
        { status: 403, headers: CORS },
      );
    }

    // One affiliate record per person. Otherwise a user holding two invites
    // could stack accounts and pick whichever pays better per referral.
    const existingForUser = await base44.asServiceRole.entities.Affiliate
      .filter({ user_id: user.email }).catch(() => []);
    if (existingForUser.length) {
      return Response.json(
        { error: 'This account is already registered as an affiliate.', code: 'already_affiliate' },
        { status: 409, headers: CORS },
      );
    }

    if (invite.status === 'accepted') return Response.json({ error: 'This invite has already been accepted.' }, { status: 400, headers: CORS });
    if (invite.status === 'expired' || (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now())) {
      return Response.json({ error: 'This invite has expired.' }, { status: 400, headers: CORS });
    }

    // Recompute effective_pool_pct server-side — never trust a stored
    // client value for the number that determines real payouts.
    // Clamp the stored share before it is used for money. createAffiliateInvite
    // validates this on the way in, but a record written before that validation
    // existed — or edited by any other path — must not be able to mint an
    // out-of-range rate here.
    const storedSharePct = Number(invite.proposed_share_pct);
    if (!Number.isFinite(storedSharePct) || storedSharePct <= 0 || storedSharePct > 100) {
      return Response.json(
        { error: 'This invite has an invalid commission share and cannot be accepted. Ask an admin to reissue it.' },
        { status: 400, headers: CORS },
      );
    }

    let effectivePoolPct = storedSharePct;
    if (invite.proposed_tier === 2) {
      if (!invite.parent_affiliate_id) {
        return Response.json({ error: 'This sub-affiliate invite is missing its parent affiliate.' }, { status: 400, headers: CORS });
      }
      const parentMatches = await base44.asServiceRole.entities.Affiliate.filter({ id: invite.parent_affiliate_id }).catch(() => []);
      const parent = parentMatches[0];
      if (!parent || parent.status !== 'active') {
        return Response.json({ error: 'The inviting affiliate is no longer active.' }, { status: 400, headers: CORS });
      }
      effectivePoolPct = (parent.commission_pct * storedSharePct) / 100;
    }

    const code = await generateUniqueCode(base44, user.email);

    const affiliate = await base44.asServiceRole.entities.Affiliate.create({
      user_id: user.email,
      code,
      status: 'active',
      tier: invite.proposed_tier,
      parent_affiliate_id: invite.parent_affiliate_id || '',
      commission_pct: storedSharePct,
      effective_pool_pct: effectivePoolPct,
      payout_method: 'stripe_connect',
      payout_account_ref: '',
      total_earned: 0,
      total_paid: 0,
      balance_due: 0,
    });

    await base44.asServiceRole.entities.AffiliateInvite.update(invite.id, { status: 'accepted' });

    let onboardingUrl: string | null = null;
    if (STRIPE_KEY) {
      try {
        const account = await stripeRequest('accounts', new URLSearchParams({
          type: 'express',
          email: user.email,
          'capabilities[transfers][requested]': 'true',
        }));
        if (account?.id) {
          await base44.asServiceRole.entities.Affiliate.update(affiliate.id, { payout_account_ref: account.id });
          const link = await stripeRequest('account_links', new URLSearchParams({
            account: account.id,
            refresh_url: `${APP_URL}/affiliate?onboarding=refresh`,
            return_url: `${APP_URL}/affiliate?onboarding=done`,
            type: 'account_onboarding',
          }));
          onboardingUrl = link?.url || null;
        }
      } catch (_stripeError) {
        // Non-fatal — the affiliate is still activated; they can connect a
        // payout method later from the portal (Stripe or PayPal).
      }
    }

    return Response.json({
      success: true,
      affiliate_id: affiliate.id,
      code,
      tier: invite.proposed_tier,
      onboarding_url: onboardingUrl,
    }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
