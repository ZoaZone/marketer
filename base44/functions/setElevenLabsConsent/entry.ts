import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * setElevenLabsConsent — records (or withdraws) a customer's agreement to
 * the additional platform charge on ElevenLabs-backed generation.
 *
 * ElevenLabs runs on a platform key carry an extra margin on top of the
 * normal platform rate (see ELEVENLABS_SURCHARGE_PCT in the metering
 * block). Nobody is charged that surcharge without having agreed to it:
 * meterUsage refuses any surcharged run with
 * `code: 'elevenlabs_consent_required'` until this function has stored a
 * consent record, and the stored percentage has to cover the current one —
 * so raising the surcharge later asks again rather than quietly charging
 * more than what was agreed.
 *
 * Storage is `user.settings.elevenlabs_surcharge_consent`, written through
 * base44.auth.updateMe the same way saveApiKey stores BYOK records. It
 * hangs off the user rather than the Subscription because free-trial and
 * admin accounts have no Subscription row, and consent has to be
 * expressible for an account before it has a plan.
 *
 * POST { accepted: boolean } -> { success, consent }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// MUST equal ELEVENLABS_SURCHARGE_PCT in base44/_shared/metering.block.ts —
// `npm run check:plans` enforces it. If this drifts BELOW the block's value
// every consent it records is instantly stale and every ElevenLabs run is
// refused; if it drifts ABOVE, customers consent to a bigger number than
// they are actually charged. Neither is silent, but both are wrong.
const ELEVENLABS_SURCHARGE_PCT = 0.25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const body = await req.json().catch(() => ({}));
    if (typeof body?.accepted !== 'boolean') {
      return Response.json({ error: 'accepted (boolean) is required.' }, { status: 400, headers: CORS });
    }

    // Record the percentage that was actually shown and agreed to, not just
    // a bare "yes" — that is what makes a later increase re-ask instead of
    // inheriting consent given for a smaller charge.
    const consent = body.accepted
      ? {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        surchargePct: ELEVENLABS_SURCHARGE_PCT,
      }
      : {
        accepted: false,
        withdrawnAt: new Date().toISOString(),
        surchargePct: ELEVENLABS_SURCHARGE_PCT,
      };

    const currentSettings = user.settings || {};
    await base44.auth.updateMe({
      settings: { ...currentSettings, elevenlabs_surcharge_consent: consent },
    });

    return Response.json({ success: true, consent }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
