/**
 * geoPricing — ZoaZone standard India/INR detection utility
 *
 * Detects whether the visitor is in India and should see INR pricing.
 * Dual check: UTC offset (+5:30 → -330 minutes) OR explicit Indian timezone.
 * This is more precise than the old `startsWith("Asia/")` check, which
 * wrongly treated Japan/China/Singapore/UAE etc. as India.
 *
 * Usage:
 *   import { isInIndia, formatInr } from "@/lib/geoPricing";
 *   if (isInIndia()) showCashfreeCheckout(); else showStripeCheckout();
 */

const INDIAN_TIMEZONES = ["Asia/Calcutta", "Asia/Kolkata"];

export function isInIndia() {
  try {
    const offset = new Date().getTimezoneOffset();
    if (offset === -330) return true; // UTC+5:30 — India and Sri Lanka
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return INDIAN_TIMEZONES.includes(tz);
  } catch {
    return false;
  }
}

/** Fixed plan parity, mirrored by the server's Cashfree catalog. */
export const usdToInr = usd => Math.round(Number(usd) * 94.93 / 50) * 50;
export const GST_NOTE = "exclusive of 18% GST";
export const localizePlanPrices = text => isInIndia() ? text.replace(/\$(1,499|1499|499|399|149|99|49|19)(?![\d.,])/g, (_, usd) => planPrice(Number(usd.replace(/,/g, '')))) : text;
export const planPrice = usd => isInIndia() ? `${formatInr(usdToInr(usd))} (${GST_NOTE})` : `$${Number(usd).toLocaleString("en-US")}`;

/** Format an INR amount with the ₹ symbol and Indian digit grouping (1,00,000) */
export function formatInr(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}