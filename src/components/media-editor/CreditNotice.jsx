import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';

export default function CreditNotice({ needed }) {
  return <div className={`rounded-xl border p-3 text-xs space-y-1 ${needed ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-border bg-card text-muted-foreground'}`}>
    <p className="flex items-center gap-1.5 font-semibold"><Coins className="w-3.5 h-3.5" />{needed ? 'You are out of AI credits' : 'AI tools use AI credits'}</p>
    <p>{needed ? 'Buy credits to keep using AI restyle. You only pay for what you use, no subscription needed.' : 'Non-Pro accounts pay as they go: spend free-trial or allowance credits, or top up any time.'}{' '}
      <Link to="/billing" className="font-semibold text-fuchsia-400 underline">Buy credits</Link>{needed && <> or <Link to="/pricing" className="font-semibold text-fuchsia-400 underline">view plans</Link></>}.</p>
  </div>;
}