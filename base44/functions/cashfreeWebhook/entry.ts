/**
 * cashfreeWebhook — ZoaZone standard Cashfree webhook receiver
 *
 * Verifies the x-webhook-signature header (HMAC-SHA256 of the raw body with
 * CASHFREE_SECRET_KEY) and then updates the app's payment entity.
 *
 * APP-SPECIFIC: update the entity name + status update in the marked section.
 */
import { createClientFromRequest } from "/runtime/runtime.ts";

const CASHFREE_SECRET_KEY = Deno.env.get("CASHFREE_SECRET_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function verifySignature(rawBody, signature) {
  if (!CASHFREE_SECRET_KEY || !signature) return false;
  const keyData = new TextEncoder().encode(CASHFREE_SECRET_KEY);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const raw = await req.text();
    const signature = req.headers.get("x-webhook-signature") || "";

    if (!(await verifySignature(raw, signature))) {
      console.error("[cashfreeWebhook] signature verification failed");
      return new Response("Invalid signature", { status: 401, headers: CORS });
    }

    const event = JSON.parse(raw);
    const data = event?.data || {};
    const orderId = data.order?.order_id || data.order_id;
    const paymentStatus = data.payment?.payment_status || data.payment_status;
    const cfPaymentId = data.payment?.cf_payment_id;

    console.log(`[cashfreeWebhook] type=${event.type} order=${orderId} status=${paymentStatus}`);

    if (!orderId) {
      return Response.json({ received: true }, { headers: CORS });
    }

    const base44 = await createClientFromRequest(req);
    const asAdmin = base44.asServiceRole ?? base44;

    // ─────────────────────────────────────────────────────────────
    // APP-SPECIFIC SECTION — adapt entity + fields per app
    // ─────────────────────────────────────────────────────────────
    // App-specific fulfilment not wired yet (log-only for now).
    // TODO: when wiring this app's checkout, update the app's payment/order entity for orderId here.
    console.log(`[cashfreeWebhook] verified event for order ${orderId} status=${paymentStatus} (fulfilment TODO)`);
    // ─────────────────────────────────────────────────────────────

    return Response.json({ received: true }, { headers: CORS });
  } catch (err) {
    console.error("[cashfreeWebhook] FATAL:", err?.message || String(err));
    return Response.json({ received: true }, { headers: CORS });
  }
}
