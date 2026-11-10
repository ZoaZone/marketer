import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";

// Digital Studio's half of the Medha/AEVA ecosystem single-sign-on — see
// AEVA's base44/functions/zzSync.ts and AEVOICE's zzEcosystem for the same
// pattern. Reports the signed-in user to the shared hub, gets back a hub
// session_token, and immediately asks the hub which other ecosystem apps
// this account's plan includes (with a ready-to-click launch_url for each),
// so the frontend can render an "other apps in your plan" switcher.
// Requires HUB_API_KEY to be set in this app's secrets (shared with the hub
// and every other ecosystem app).
const HUB_BASE_URL = Deno.env.get("ZZ_HUB_BASE_URL") || "https://zoa-payhub.base44.app";
const APP_CODE = "DIGITALSTUDIO";

export default async function handler(req) {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.email) {
      return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const hubKey = Deno.env.get("HUB_API_KEY") || "";
    if (!hubKey) {
      return Response.json({ ok: false, error: "HUB_API_KEY not configured on this app" }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const hubHeaders = { "Content-Type": "application/json", "x-hub-api-key": hubKey };

    const syncRes = await fetch(`${HUB_BASE_URL}/functions/syncAccount`, {
      method: "POST",
      headers: hubHeaders,
      body: JSON.stringify({
        app_code: APP_CODE,
        email: user.email,
        full_name: user.full_name || "",
        plan: body.plan || "trial",
        status: body.status || "trialing",
        trial_ends_at: body.trial_ends_at || undefined
      })
    });
    const syncData = await syncRes.json().catch(() => ({}));
    if (!syncRes.ok || syncData.ok === false || !syncData.session_token) {
      return Response.json({ ok: false, error: syncData.error || `hub sync returned HTTP ${syncRes.status}` }, { status: 200 });
    }

    const appsRes = await fetch(`${HUB_BASE_URL}/functions/getEcosystemApps`, {
      method: "POST",
      headers: hubHeaders,
      body: JSON.stringify({ app_code: APP_CODE, session_token: syncData.session_token })
    });
    const appsData = await appsRes.json().catch(() => ({}));

    return Response.json({
      ok: true,
      entitlement: syncData.entitlement,
      ecosystem_plan: appsData.ecosystem_plan || null,
      apps: appsData.apps || []
    });
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
