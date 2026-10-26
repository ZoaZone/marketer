import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { recordCommissionFor } from '@/utils/affiliate';

export default function CashfreeReturn() {
  const qc = useQueryClient(), started = useRef(false);
  const orderId = new URLSearchParams(window.location.search).get('cashfree_order_id');
  const [status, setStatus] = useState(orderId ? 'Confirming your Cashfree payment…' : '');
  const [retry, setRetry] = useState(0), [pending, setPending] = useState(false);
  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true; setPending(false); setStatus('Confirming your Cashfree payment…');
    (async () => {
      try {
        const { data } = await base44.functions.invoke('cashfreeCheckout', { action: 'confirm', order_id: orderId });
        if (!data?.confirmed) { setStatus('Payment is not confirmed. If you paid, check again shortly. Your plan has not been activated.'); setPending(true); return; }
        setStatus(data.kind === 'credits' ? 'Payment confirmed. Your credits have been added.' : 'Payment confirmed. Your plan is active.');
        await Promise.all([qc.invalidateQueries({ queryKey: ['subscription'] }), qc.invalidateQueries({ queryKey: ['subscription_layout'] })]);
        window.history.replaceState({}, '', window.location.pathname);
        if (data.subscription_id && data.kind !== 'credits') await recordCommissionFor(data.subscription_id);
      } catch (e) { setStatus(e?.response?.data?.error || 'Could not confirm payment. Please check again.'); setPending(true); }
    })();
  }, [orderId, qc, retry]);
  return status ? <div role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">{status}{pending && <button type="button" onClick={() => { started.current = false; setRetry(v => v + 1); }} className="ml-3 underline text-primary">Check payment again</button>}</div> : null;
}