// Redeems a single-use ecosystem exchange code (the `xcode` query param an
// ecosystem app's "switch apps" link carries) against the shared hub. See
// HelloBiz's base44/functions/zzRedeem for the same pattern.
const HUB_BASE_URL = Deno.env.get("ZZ_HUB_BASE_URL") || "https://zoa-payhub.base44.app";
const APP_CODE = "DIGITALSTUDIO";

export default async function handler(req) {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  try {
    const hubKey = Deno.env.get("HUB_API_KEY") || "";
    if (!hubKey) {
      return Response.json({ ok: false, error: "HUB_API_KEY not configured on this app" }, { status: 200 });
    }
    const body = await req.json().catch(() => ({}));
    if (!body.exchange_code) {
      return Response.json({ ok: false, error: "exchange_code is required" }, { status: 200 });
    }
    const res = await fetch(`${HUB_BASE_URL}/functions/exchangeSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-api-key": hubKey },
      body: JSON.stringify({ app_code: APP_CODE, exchange_code: body.exchange_code })
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: 200 });
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
