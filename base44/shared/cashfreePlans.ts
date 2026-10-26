// USD catalog mirrors src/config/plans.js; amounts in rupees, not paise.
export const cashfreePlans = {
  creator: { name: 'Creator', monthly: 19, yearly: 182 },
  starter: { name: 'Starter', monthly: 49, yearly: 470 },
  growth: { name: 'Growth', monthly: 149, yearly: 1430 },
  agency: { name: 'Agency', monthly: 399, yearly: 3830 },
  indie: { name: 'Indie', monthly: 99, yearly: 950 },
  studio: { name: 'Studio', monthly: 399, yearly: 3830 },
  dubbing_house: { name: 'Dubbing House', monthly: 499, yearly: 4790 },
  enterprise: { name: 'Enterprise', monthly: 1499, yearly: 14390 },
  byok: { name: 'BYO Providers', monthly: 49, yearly: 470 },
};
export function cashfreeCreditQuote(usd) {
  const amount = Number(usd);
  if (!Number.isFinite(amount) || amount < 10 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001) return null;
  const subtotal = Math.round(amount * 94.93 / 50) * 50;
  const gst = Math.round(subtotal * 18) / 100;
  return { name: 'AI Credits', subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100, credits: Math.floor(amount / 0.06) };
}
export function cashfreeQuote(plan, billing) {
  if (!Object.hasOwn(cashfreePlans, plan) || !['monthly', 'yearly'].includes(billing)) return null;
  const item = cashfreePlans[plan];
  const subtotal = Math.round(item[billing] * 94.93 / 50) * 50;
  const gst = Math.round(subtotal * 18) / 100;
  return { name: item.name, subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
}