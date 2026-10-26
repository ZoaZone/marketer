import { secrets } from 'base44:runtime';
import { cashfreeQuote, cashfreeCreditQuote } from './cashfreePlans.ts';

export function cashfreeConfig() {
  const appId = secrets.get('CASHFREE_APP_ID'), key = secrets.get('CASHFREE_SECRET_KEY');
  const env = String(secrets.get('CASHFREE_ENV') || '').trim().toUpperCase();
  const sandbox = ['TEST', 'SANDBOX'].includes(env);
  if (!appId || !key || (!sandbox && !['PROD', 'PRODUCTION', 'LIVE'].includes(env))) throw new Error('Check Cashfree credentials and environment.');
  return { appId, key, mode: sandbox ? 'sandbox' : 'production', url: sandbox ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg' };
}
export async function cashfreeRequest(path, body) {
  const c = cashfreeConfig();
  const res = await fetch(c.url + path, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
    headers: { 'x-client-id': c.appId, 'x-client-secret': c.key, 'x-api-version': '2025-01-01', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error('Cashfree could not process the request. Please check payment settings or try again.');
  return res.json();
}
export async function fulfillCashfree(base44, order) {
  const tags = order.order_tags || {};
  const quote = tags.kind === 'credits' ? cashfreeCreditQuote(tags.amount_usd) : cashfreeQuote(tags.plan, tags.billing);
  if (!quote || order.order_currency !== 'INR' || Math.round(Number(order.order_amount) * 100) !== Math.round(quote.total * 100)) throw new Error('Payment amount does not match the plan.');
  if (order.order_status !== 'PAID') return { confirmed: false };
  const sub = await base44.asServiceRole.entities.Subscription.get(tags.subscription_id);
  if (sub.owner_email !== tags.owner || order.customer_details?.customer_email !== tags.owner) throw new Error('Payment owner does not match.');
  if (tags.kind === 'credits') {
    // Predicate and credit increment are one atomic update, so duplicate or
    // concurrent webhook/return confirmations cannot credit an order twice.
    await base44.asServiceRole.entities.Subscription.updateMany(
      { id: sub.id, owner_email: tags.owner, credited_stripe_sessions: { $nin: [order.order_id] } },
      { $inc: { credits_balance: quote.credits }, $addToSet: { credited_stripe_sessions: order.order_id } },
    );
    return { confirmed: true, kind: 'credits', subscription_id: sub.id };
  }
  // Reuse the current subscription and wallet. The atomic order marker keeps
  // duplicate callbacks from extending terms or reactivating a canceled plan.
  const end = new Date(order.created_at);
  if (Number.isNaN(end.getTime())) throw new Error('Invalid payment date.');
  if (tags.billing === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  if (end.getTime() > Date.now()) {
    await base44.asServiceRole.entities.Subscription.updateMany(
      { id: sub.id, owner_email: tags.owner, credited_stripe_sessions: { $nin: [order.order_id] } },
      { $set: { plan_name: quote.name, plan_tier: tags.plan, status: 'active', current_period_end: end.toISOString() }, $addToSet: { credited_stripe_sessions: order.order_id } },
    );
  }
  return { confirmed: true, subscription_id: sub.id };
}