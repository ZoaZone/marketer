import { base44 } from '@/api/base44Client';

// Cashfree checks the domain the SDK is opened from against the merchant
// account's whitelist, not just the order's return_url. Opened from anywhere
// else — a preview build above all — its hosted page answers "Broken Link!
// <host> is not enabled or approved", which reads like a fault in the app.
// So the check happens here, where it can say what to do instead.
export const PAYMENT_HOST = 'digitalstudios.app';

export function paymentHostAllowed() {
  try {
    return window.location.hostname.toLowerCase() === PAYMENT_HOST;
  } catch {
    return false;
  }
}

/** The same page on the domain payments are approved for. */
export function livePaymentUrl() {
  try {
    return `https://${PAYMENT_HOST}${window.location.pathname}${window.location.search}`;
  } catch {
    return `https://${PAYMENT_HOST}/`;
  }
}

let loading;
function loadCashfree() {
  if (window.Cashfree) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = resolve;
    script.onerror = () => { loading = null; script.remove(); reject(new Error('Cashfree could not load. Please try again.')); };
    document.head.appendChild(script);
  });
  return loading;
}
export async function openCashfree(plan, billing, phone, creditAmount) {
  // Checked before the order is created, so a preview build never leaves an
  // unpayable order open on the merchant account.
  if (!paymentHostAllowed()) {
    let host = 'this address';
    try { host = window.location.hostname; } catch { /* keep the generic wording */ }
    throw new Error(
      `Payments can only be completed on ${PAYMENT_HOST}. You are on ${host}, ` +
      `which the payment gateway has not approved. Open ${livePaymentUrl()} and try again.`,
    );
  }
  await loadCashfree();
  const payload = creditAmount ? { kind: 'credits', amount_usd: creditAmount, customerPhone: phone } : { plan, billing, customerPhone: phone };
  const { data } = await base44.functions.invoke('cashfreeCheckout', payload);
  if (!data?.ok || !data.sessionId) throw new Error(data?.error || 'Unable to start checkout.');
  const result = await window.Cashfree({ mode: data.mode }).checkout({ paymentSessionId: data.sessionId, redirectTarget: '_self' });
  if (result?.error) throw new Error(result.error.message || 'Payment could not be completed.');
}