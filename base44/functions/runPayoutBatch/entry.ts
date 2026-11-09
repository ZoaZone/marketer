import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * runPayoutBatch — admin-triggered. Aggregates each affiliate's *approved*
 * commissions into a PayoutBatch and pays it out via the affiliate's chosen
 * rail (Stripe Connect transfer, or PayPal Payouts). Commissions still in
 * "pending" status are left alone — an admin must approve them first (see
 * AdminDashboard's ledger tab).
 *
 * Body: { affiliate_id? } — omit to run for every affiliate with an
 * approved balance.
 */

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_API_KEY') || '';
const PAYPAL_SECRET = Deno.env.get('PAYPAL_API_SECRET') || '';
const PAYPAL_ENV = Deno.env.get('PAYPAL_ENV') || 'live';
const PAYPAL_BASE = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function stripeTransfer(amountUsd: number, destinationAccount: string) {
  const res = await fetch('https://api.stripe.com/v1/transfers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount: String(Math.round(amountUsd * 100)),
      currency: 'usd',
      destination: destinationAccount,
    }),
  });
  return res.json();
}

async function paypalAccessToken(): Promise<string> {
  const creds = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function paypalPayout(amountUsd: number, receiverEmail: string) {
  const token = await paypalAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `aff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email_subject: 'You have an affiliate commission payout',
      },
      items: [{
        recipient_type: 'EMAIL',
        amount: { value: amountUsd.toFixed(2), currency: 'USD' },
        receiver: receiverEmail,
        note: 'Affiliate commission payout',
      }],
    }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required.' }, { status: 403, headers: CORS });
    }

    const { affiliate_id } = await req.json().catch(() => ({}));

    const approvedCommissions = await base44.asServiceRole.entities.Commission.filter({ status: 'approved' });
    const byAffiliate = new Map<string, any[]>();
    for (const c of approvedCommissions) {
      if (affiliate_id && c.affiliate_id !== affiliate_id) continue;
      if (!byAffiliate.has(c.affiliate_id)) byAffiliate.set(c.affiliate_id, []);
      byAffiliate.get(c.affiliate_id)!.push(c);
    }

    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const results = [];

    for (const [affId, commissions] of byAffiliate.entries()) {
      const total = Math.round(commissions.reduce((s, c) => s + (c.amount || 0), 0) * 100) / 100;
      if (total <= 0) continue;

      const affMatches = await base44.asServiceRole.entities.Affiliate.filter({ id: affId });
      const affiliate = affMatches[0];
      if (!affiliate) continue;

      const batch = await base44.asServiceRole.entities.PayoutBatch.create({
        period,
        affiliate_id: affId,
        total_amount: total,
        status: 'processing',
      });

      let providerRef = '';
      let paidOk = false;
      let failReason = '';

      try {
        if (affiliate.payout_method === 'stripe_connect' && affiliate.payout_account_ref && STRIPE_KEY) {
          const transfer = await stripeTransfer(total, affiliate.payout_account_ref);
          if (transfer?.id) { providerRef = transfer.id; paidOk = true; }
          else failReason = transfer?.error?.message || 'Stripe transfer failed.';
        } else if (affiliate.payout_method === 'paypal' && affiliate.payout_account_ref && PAYPAL_CLIENT_ID && PAYPAL_SECRET) {
          const payout = await paypalPayout(total, affiliate.payout_account_ref);
          if (payout?.batch_header?.payout_batch_id) { providerRef = payout.batch_header.payout_batch_id; paidOk = true; }
          else failReason = payout?.message || 'PayPal payout failed.';
        } else {
          failReason = 'No connected payout method for this affiliate.';
        }
      } catch (payoutError) {
        failReason = (payoutError as Error).message;
      }

      if (paidOk) {
        await base44.asServiceRole.entities.PayoutBatch.update(batch.id, {
          status: 'paid',
          provider_ref: providerRef,
          paid_at: new Date().toISOString(),
        });
        for (const c of commissions) {
          await base44.asServiceRole.entities.Commission.update(c.id, { status: 'paid', payout_batch_id: batch.id });
        }
        await base44.asServiceRole.entities.Affiliate.update(affiliate.id, {
          total_paid: (affiliate.total_paid || 0) + total,
          balance_due: Math.max(0, (affiliate.balance_due || 0) - total),
        });
        results.push({ affiliate_id: affId, batch_id: batch.id, status: 'paid', total });
      } else {
        await base44.asServiceRole.entities.PayoutBatch.update(batch.id, { status: 'failed' });
        results.push({ affiliate_id: affId, batch_id: batch.id, status: 'failed', total, error: failReason });
      }
    }

    return Response.json({ success: true, batches: results }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
