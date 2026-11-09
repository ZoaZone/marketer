// paypalCheckout.ts — PayPal Live (India) payments
// App: media.aevoice.ai (Base44 App ID: 69c3c2f5acaefc3a7afad5fd)
const PAYPAL_API_KEY    = Deno.env.get("PAYPAL_API_KEY") || "";
const PAYPAL_API_SECRET = Deno.env.get("PAYPAL_API_SECRET") || "";
const PAYPAL_ENV        = Deno.env.get("PAYPAL_ENV") || "live";
const PAYPAL_BASE = PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const SUPPORTED_CURRENCIES = ["INR","USD","GBP","EUR","AUD","CAD","SGD","AED"];

async function getAccessToken(): Promise<string> {
  const creds = btoa(`${PAYPAL_API_KEY}:${PAYPAL_API_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Authorization": `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function ppFetch(path: string, method = "GET", body?: object) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: { raw: text } }; }
}

export default async function handler(req: Request) {
  const cors = { "Access-Control-Allow-Origin": req.headers.get("origin")||"*", "Access-Control-Allow-Methods": "POST,GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const respond = (d: object, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "health") {
      const tk = await getAccessToken().then(t=>({"ok":true,"prefix":t.slice(0,10)+"..."})).catch(e=>({"ok":false,"error":e.message}));
      return respond({ success: tk.ok, environment: PAYPAL_ENV, app: "media.aevoice.ai", supported_currencies: SUPPORTED_CURRENCIES, token: tk });
    }

    if (action === "create_order") {
      const { amount, currency="INR", description="Payment", return_url, cancel_url, plan_name="", customer_email="" } = body;
      if (!amount) return respond({ error: "amount required" }, 400);
      if (!SUPPORTED_CURRENCIES.includes(currency)) return respond({ error: `Unsupported currency` }, 400);
      const r = await ppFetch("/v2/checkout/orders", "POST", {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: currency, value: Number(amount).toFixed(2) }, description: plan_name ? `${description} — ${plan_name}` : description }],
        application_context: { brand_name: "Zoa Zone Services", locale: "en-IN", landing_page: "BILLING", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW",
          return_url: return_url || `https://media.aevoice.ai/PaymentSuccess`,
          cancel_url: cancel_url || `https://media.aevoice.ai/PaymentCancel` },
        ...(customer_email ? { payer: { email_address: customer_email } } : {}),
      });
      if (!r.ok) return respond({ error: r.data }, r.status);
      const approve = r.data.links?.find((l:any)=>l.rel==="approve")?.href;
      return respond({ success: true, order_id: r.data.id, status: r.data.status, approve_url: approve, environment: PAYPAL_ENV });
    }

    if (action === "capture_order") {
      const { order_id } = body;
      if (!order_id) return respond({ error: "order_id required" }, 400);
      const r = await ppFetch(`/v2/checkout/orders/${order_id}/capture`, "POST", {});
      if (!r.ok) return respond({ error: r.data }, r.status);
      const cap = r.data.purchase_units?.[0]?.payments?.captures?.[0];
      return respond({ success: true, order_id: r.data.id, status: r.data.status, capture_id: cap?.id, amount: cap?.amount, payer: r.data.payer, environment: PAYPAL_ENV });
    }

    if (action === "refund") {
      const { capture_id, amount, currency="INR", reason="Refund" } = body;
      if (!capture_id) return respond({ error: "capture_id required" }, 400);
      const rb: any = { note_to_payer: reason };
      if (amount) rb.amount = { value: Number(amount).toFixed(2), currency_code: currency };
      const r = await ppFetch(`/v2/payments/captures/${capture_id}/refund`, "POST", rb);
      if (!r.ok) return respond({ error: r.data }, r.status);
      return respond({ success: true, refund: r.data, environment: PAYPAL_ENV });
    }

    return respond({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return respond({ error: e.message || "Internal error" }, 500);
  }
}
