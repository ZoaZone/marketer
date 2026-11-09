import { base44 } from "@/api/base44Client";

const COOKIE_KEY = "aff_cookie_id";

/**
 * A persistent anonymous id standing in for a server cookie — this is a
 * client-rendered SPA, so localStorage is simpler and more reliable than
 * document.cookie for same-origin attribution across the checkout redirect
 * round-trips (Stripe Checkout, PayPal approval).
 */
export function getOrCreateCookieId() {
  let id = localStorage.getItem(COOKIE_KEY);
  if (!id) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(COOKIE_KEY, id);
  }
  return id;
}

export function getStoredCookieId() {
  return localStorage.getItem(COOKIE_KEY) || "";
}

/** Call once per app load — no-ops unless ?ref=CODE is present. */
export async function trackReferralFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("ref");
  if (!code) return;
  const cookie_id = getOrCreateCookieId();
  try {
    await base44.functions.invoke("trackReferral", { code, cookie_id });
  } catch (_) {
    // A tracking failure should never block the page from loading.
  }
}

/** Best-effort — never throws, since a missed commission record shouldn't block a "you're subscribed" confirmation. */
export async function recordCommissionFor(subscriptionId) {
  const cookie_id = getStoredCookieId();
  if (!subscriptionId) return;
  try {
    await base44.functions.invoke("recordCommission", { subscription_id: subscriptionId, cookie_id });
  } catch (_) {
    // Best-effort — surfaced nowhere; the sale still succeeded regardless.
  }
}
