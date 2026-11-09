import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_PLANS } from '../src/config/plans.js';
import { usdToInr, isInIndia, planPrice, localizePlanPrices } from '../src/lib/geoPricing.js';
import { cashfreeQuote, cashfreeCreditQuote } from '../base44/shared/cashfreePlans.ts';

afterEach(() => vi.restoreAllMocks());
function region(india) {
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(india ? -330 : 0);
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: india ? 'Asia/Kolkata' : 'UTC' });
}
describe('India plan display and Cashfree pricing', () => {
  it('uses the requested $29 example and fixed rounding', () => {
    expect(usdToInr(29)).toBe(2750);
    expect(usdToInr(19)).toBe(1800);
    expect(usdToInr(49)).toBe(4650);
  });
  for (const plan of ALL_PLANS) for (const billing of ['monthly', 'yearly']) {
    it(`${plan.key} ${billing}: displayed base and backend charge match`, () => {
      const quote = cashfreeQuote(plan.key, billing);
      expect(quote.name).toBe(plan.name);
      expect(quote.subtotal).toBe(usdToInr(plan[`price_${billing}`]));
      expect(quote.total).toBe(Math.round(quote.subtotal * 118) / 100);
      expect(quote.gst).toBe(Math.round(quote.subtotal * 18) / 100);
    });
  }
  it('shows INR with the GST note in India', () => {
    region(true);
    expect(isInIndia()).toBe(true);
    expect(planPrice(49)).toBe('₹4,650 (exclusive of 18% GST)');
    expect(localizePlanPrices('Starter $49/mo, Enterprise $1,499/mo')).not.toContain('$');
  });
  it('leaves international prices in USD', () => {
    region(false);
    expect(isInIndia()).toBe(false);
    expect(planPrice(49)).toBe('$49');
    expect(localizePlanPrices('Starter $49/mo')).toBe('Starter $49/mo');
  });
  it('rejects unrecognized plans and billing periods', () => {
    expect(cashfreeQuote('__proto__', 'monthly')).toBeNull();
    expect(cashfreeQuote('starter', 'weekly')).toBeNull();
    expect(cashfreeCreditQuote(9)).toBeNull();
    expect(cashfreeCreditQuote(Infinity)).toBeNull();
  });
  it('uses the same rounded INR base and GST for credit packs', () => {
    for (const usd of [10, 25, 50, 100, 19.99]) {
      const q = cashfreeCreditQuote(usd);
      expect(q.subtotal).toBe(usdToInr(usd));
      expect(q.total).toBe(Math.round(q.subtotal * 118) / 100);
      expect(q.credits).toBe(Math.floor(usd / 0.06));
    }
  });
});