import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { cashfreeConfig, cashfreeRequest, fulfillCashfree } from '../../shared/cashfree.ts';

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const signature = req.headers.get('x-webhook-signature'), timestamp = req.headers.get('x-webhook-timestamp');
    if (!signature || !timestamp) return Response.json({ error: 'Invalid signature' }, { status: 401 });
    const raw = await req.text();
    const { key: secret } = cashfreeConfig();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    let signatureBytes;
    try { signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0)); }
    catch (_) { return Response.json({ error: 'Invalid signature' }, { status: 401 }); }
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(timestamp + raw));
    if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });
    const event = JSON.parse(raw);
    if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK') return Response.json({ received: true });
    const orderId = event.data?.order?.order_id;
    if (!/^ds_[a-f0-9-]{36}$/.test(orderId || '')) return Response.json({ received: true });
    // Re-fetch provider state: neither browser parameters nor webhook amounts
    // alone can activate a plan. Fulfillment is replay-safe for the same order.
    const order = await cashfreeRequest('/orders/' + encodeURIComponent(orderId));
    const result = await fulfillCashfree(createClientFromRequest(req), order);
    return Response.json({ received: true, confirmed: result.confirmed });
  } catch (_) {
    return Response.json({ error: 'Payment confirmation failed; retry required.' }, { status: 500 });
  }
}