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

/** Format an INR amount with the ₹ symbol and Indian digit grouping (1,00,000) */
export function formatInr(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
