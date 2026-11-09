import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { openCashfree } from '@/lib/cashfreeCheckout';
import { formatInr, GST_NOTE } from '@/lib/geoPricing';

export default function CashfreeButton({ amount, planTier, billing = 'monthly', creditAmount }) {
  const [expanded, setExpanded] = useState(false), [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const gst = Math.round(amount * 18) / 100, total = Math.round((amount + gst) * 100) / 100;
  const start = async () => {
    if (!(await base44.auth.isAuthenticated())) { base44.auth.redirectToLogin(window.location.href); return; }
    setExpanded(true);
  };
  const pay = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await openCashfree(planTier, billing, phone, creditAmount); }
    catch (e) { setError(e?.response?.data?.error || e.message || 'Payment could not be started.'); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-col gap-1.5">
    {!expanded ? <button type="button" onClick={start} className="w-full rounded-lg bg-primary text-primary-foreground font-bold text-sm px-6 py-3">Pay {formatInr(amount)} with Cashfree</button> :
      <form onSubmit={pay} className="space-y-2">
        <label className="block text-xs text-muted-foreground">Indian mobile number
          <input required type="tel" autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" className="mt-1 w-full rounded-lg border border-input bg-background text-foreground px-3 py-2" />
        </label>
        <p className="text-xs text-muted-foreground">Base: {formatInr(amount)} · GST (18%): {formatInr(gst)} · Total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <button disabled={busy} className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground font-bold text-sm px-6 py-3 disabled:opacity-60">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Opening checkout…' : 'Continue to Cashfree'}</button>
      </form>}
    <p className="text-[10px] text-muted-foreground text-center">{GST_NOTE} · Secured by Cashfree</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}