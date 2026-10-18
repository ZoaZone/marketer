/**
 * cashfreeCheckout — ZoaZone standard Cashfree order creation
 *
 * Payment gateway for Indian business (Zoa Zone Services Pvt Ltd).
 * Stripe remains the gateway for international customers.
 *
 * POST body:
 *   { amount: number (INR), customerName, customerEmail, customerPhone,
 *     customerId?, orderId?, plan?, appId, meta? }
 *
 * Returns:
 *   { ok: true, paymentLink, orderId, sessionId } on success
 *   { ok: false, error } on failure
 */
import { createClientFromRequest } from "/runtime/runtime.ts";

const APP_ID = "69c3c2f5acaefc3a7afad5fd";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const CASHFREE_APP_ID = Deno.env.get("CASHFREE_APP_ID") || "";
const CASHFREE_SECRET_KEY = Deno.env.get("CASHFREE_SECRET_KEY") || "";
const CASHFREE_ENV = (Deno.env.get("CASHFREE_ENV") || "production").toUpperCase();
const API_BASE = CASHFREE_ENV === "TEST" ? "https://sandbox-api.cashfree.com/pg" : "https://api.cashfree.com/pg";

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return Response.json({ ok: false, error: "Cashfree not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing)" }, { status: 500, headers: CORS });
    }

    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount < 1) {
      return Response.json({ ok: false, error: "Invalid amount" }, { status: 400, headers: CORS });
    }
    if (!body.customerEmail || !body.customerPhone) {
      return Response.json({ ok: false, error: "customerEmail and customerPhone are required by Cashfree" }, { status: 400, headers: CORS });
    }

    const origin = new URL(req.url).origin;
    const orderId = body.orderId || `cf_${APP_ID}_${Date.now()}`;

    const cfRes = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: {
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: body.customerId || body.customerEmail,
          customer_email: body.customerEmail,
          customer_phone: String(body.customerPhone),
          customer_name: body.customerName || body.customerEmail,
        },
        order_meta: {
          return_url: `${origin}/payment/result?order_id=${orderId}`,
          notify_url: `${origin}/api/apps/${APP_ID}/functions/cashfreeWebhook`,
        },
        order_tags: { app: APP_ID, plan: body.plan || "standard" },
      }),
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok) {
      console.error("[cashfreeCheckout] order creation failed:", cfRes.status, JSON.stringify(cfData));
      return Response.json({ ok: false, error: cfData?.message || "Failed to create payment order" }, { status: 502, headers: CORS });
    }

    return Response.json({
      ok: true,
      orderId,
      sessionId: cfData.payment_session_id,
      paymentLink: `https://payments.cashfree.com/order/#${cfData.payment_session_id}`,
    }, { headers: CORS });
  } catch (err) {
    console.error("[cashfreeCheckout] FATAL:", err?.message || String(err));
    return Response.json({ ok: false, error: "Internal server error" }, { status: 500, headers: CORS });
  }
}
