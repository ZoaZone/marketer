import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { cashfreeQuote, cashfreeCreditQuote } from '../../shared/cashfreePlans.ts';
import { cashfreeConfig, cashfreeRequest, fulfillCashfree } from '../../shared/cashfree.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(e => e.status === 401 ? null : Promise.reject(e));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (body.action === 'confirm') {
      if (!/^ds_[a-f0-9-]{36}$/.test(body.order_id || '')) return Response.json({ error: 'Invalid order ID' }, { status: 400 });
      const order = await cashfreeRequest('/orders/' + encodeURIComponent(body.order_id));
      if (order.order_tags?.owner !== user.email) return Response.json({ error: 'Forbidden' }, { status: 403 });
      return Response.json(await fulfillCashfree(base44, order));
    }
    const { plan, billing = 'monthly', customerPhone } = body;
    const isCredits = body.kind === 'credits';
    const quote = isCredits ? cashfreeCreditQuote(body.amount_usd) : cashfreeQuote(plan, billing);
    if (!quote) return Response.json({ error: 'Invalid plan, billing period or credit amount' }, { status: 400 });
    if (!/^[6-9][0-9]{9}$/.test(String(customerPhone || ''))) return Response.json({ error: 'Enter a valid 10-digit Indian mobile number' }, { status: 400 });
    const config = cashfreeConfig();
    const orderId = 'ds_' + crypto.randomUUID();
    // Never insert a pending paid plan: abandoned checkouts must not replace
    // the current subscription or change existing generation entitlements.
    const existing = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }, null, 1);
    const sub = existing[0] || await base44.asServiceRole.entities.Subscription.create({ owner_email: user.email, plan_name: 'Free', plan_tier: 'free', status: 'active', credits_balance: 0 });
    const origin = new URL(req.headers.get('X-Base44-App-Url') || 'https://agentmarketer.base44.app').origin;
    const order = await cashfreeRequest('/orders', {
      order_id: orderId, order_currency: 'INR', order_amount: quote.total,
      customer_details: { customer_id: user.id, customer_email: user.email, customer_name: user.full_name || user.email, customer_phone: String(customerPhone) },
      order_meta: { return_url: `${origin}/billing?cashfree_order_id=${orderId}`, notify_url: 'https://agentmarketer.base44.app/functions/cashfreeWebhook' },
      order_note: `${quote.name}${isCredits ? '' : ' ' + billing}: INR ${quote.subtotal} + 18% GST INR ${quote.gst}`,
      order_tags: isCredits ? { owner: user.email, kind: 'credits', amount_usd: String(body.amount_usd), subscription_id: sub.id } : { owner: user.email, plan, billing, subscription_id: sub.id },
    });
    return Response.json({ ok: true, orderId, sessionId: order.payment_session_id, mode: config.mode, ...quote });
  } catch (_) {
    return Response.json({ error: 'Unable to process Cashfree checkout. Please check payment settings or try again.' }, { status: 500 });
  }
}