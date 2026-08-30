import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * activateBetaInvite — finalizes a beta invite onboarding server-side.
 *
 * BetaRequest is now admin-only for all writes (see its RLS): the public
 * submitBetaRequest flow already creates the record through asServiceRole,
 * but BetaOnboarding's old "Activate Access" step updated the record
 * straight from the browser — which the locked RLS would now reject. This
 * handler owns that activation instead: it validates the invite, marks it
 * registered, and creates the Agency-tier subscription, all through
 * asServiceRole so neither entity's RLS gates it.
 *
 * Routing the Subscription creation through here (instead of the old
 * client-side base44.entities.Subscription.create) also removes a
 * case-sensitivity mismatch risk between the invite's email and the
 * logged-in user's email, and makes the whole step idempotent on retry.
 *
 * Body: { invite_id, token?, full_name?, company?, use_case? }
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

    const { invite_id, token, full_name, company, use_case } = await req.json().catch(() => ({}));
    if (!invite_id) return Response.json({ error: 'invite_id is required.' }, { status: 400, headers: CORS });

    const invite = await base44.asServiceRole.entities.BetaRequest.get(invite_id).catch(() => null);
    if (!invite) return Response.json({ error: 'Invite not found.' }, { status: 404, headers: CORS });

    // Bind the activation to the holder of the invite link when a token is
    // supplied (BetaOnboarding always has invite.invite_token available).
    if (token && invite.invite_token && invite.invite_token !== token) {
      return Response.json({ error: 'Invite token mismatch.' }, { status: 403, headers: CORS });
    }
    if (invite.invite_expires_at && new Date(invite.invite_expires_at).getTime() < Date.now()) {
      return Response.json({ error: 'This invite has expired.' }, { status: 400, headers: CORS });
    }
    if (invite.status === 'registered') {
      // Already activated — idempotent success so a page refresh / retry
      // doesn't look like a failure or mint a second subscription.
      return Response.json({ success: true, already_registered: true }, { headers: CORS });
    }

    await base44.asServiceRole.entities.BetaRequest.update(invite_id, {
      status: 'registered',
      full_name: full_name || invite.full_name || '',
      company: company || invite.company || '',
      use_case: use_case || invite.use_case || '',
    });

    // Idempotent subscription activation — skip if one is already active for
    // this owner, so a retry never stacks a second record.
    const existing = await base44.asServiceRole.entities.Subscription.filter({ owner_email: invite.email }).catch(() => []);
    const hasActive = (existing || []).some((s: any) => s.status === 'active' || s.status === 'trialing');
    if (!hasActive) {
      await base44.asServiceRole.entities.Subscription.create({
        owner_email: invite.email,
        plan_name: 'Beta Pro',
        plan_tier: 'agency',
        status: 'active',
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    return Response.json({ success: true }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});