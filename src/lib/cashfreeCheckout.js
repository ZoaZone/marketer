import { base44 } from '@/api/base44Client';
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
  await loadCashfree();
  const payload = creditAmount ? { kind: 'credits', amount_usd: creditAmount, customerPhone: phone } : { plan, billing, customerPhone: phone };
  const { data } = await base44.functions.invoke('cashfreeCheckout', payload);
  if (!data?.ok || !data.sessionId) throw new Error(data?.error || 'Unable to start checkout.');
  const result = await window.Cashfree({ mode: data.mode }).checkout({ paymentSessionId: data.sessionId, redirectTarget: '_self' });
  if (result?.error) throw new Error(result.error.message || 'Payment could not be completed.');
}