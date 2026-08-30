import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * lookupBetaInvite — public, pre-auth resolution of a beta invite.
 *
 * WHY THIS EXISTS
 * BetaOnboarding used to call BetaRequest.filter({ invite_token }) and
 * .filter({ email }) straight from the browser. For that to work, BetaRequest
 * read had to be open to everyone — which meant anyone, signed in or not, could
 * list EVERY BetaRequest row and read the `invite_token` column. Those are live,
 * redeemable invite tokens: enumerate them, redeem them, done. The same column
 * also holds the salted OTP digest written by sendAuthOTP.
 *
 * Moving the lookup here lets BetaRequest read be locked to admins. This handler
 * resolves the token server-side and returns ONLY what the onboarding screen
 * needs to render — never the token, never the OTP digest, never another row.
 *
 * Body: { token }  or  { email }
 *   - token: the normal path, from /invite/:token
 *   - email: the manual fallback for someone who lost their link. Deliberately
 *     returns nothing beyond whether an approved invite exists, so this cannot
 *     be used to enumerate who has been invited.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Only ever expose these fields. Notably absent: invite_token, note. */
function publicView(r: any) {
  return {
    id: r.id,
    full_name: r.full_name || '',
    email: r.email || '',
    company: r.company || '',
    status: r.status || 'pending',
    invite_expires_at: r.invite_expires_at || null,
  };
}

/** An OTP digest lives in the same column; it is never a redeemable invite. */
const isRealInviteToken = (t: string) =>
  !!t && !t.startsWith('OTPH:') && !t.startsWith('OTP:');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!token && !email) {
      return Response.json({ error: 'token or email is required.' }, { status: 400, headers: CORS });
    }

    let record: any = null;

    if (token) {
      // Guard against a caller passing an OTP digest as a token to fish a row out.
      if (!isRealInviteToken(token)) {
        return Response.json({ found: false }, { headers: CORS });
      }
      const rows = await base44.asServiceRole.entities.BetaRequest.filter({ invite_token: token });
      record = rows?.[0] || null;
      if (record && !isRealInviteToken(String(record.invite_token || ''))) record = null;
    } else {
      const rows = await base44.asServiceRole.entities.BetaRequest.filter({ email });
      // Email fallback resolves ONLY an already-approved invite. Anything else
      // would let a caller confirm whether an arbitrary address had applied.
      record = (rows || []).find(
        (r: any) => r.status === 'approved' && isRealInviteToken(String(r.invite_token || '')),
      ) || null;
    }

    if (!record) return Response.json({ found: false }, { headers: CORS });

    const expiresAt = record.invite_expires_at ? new Date(record.invite_expires_at).getTime() : 0;
    if (expiresAt && expiresAt < Date.now()) {
      return Response.json({ found: true, expired: true, invite: publicView(record) }, { headers: CORS });
    }

    return Response.json({ found: true, expired: false, invite: publicView(record) }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
