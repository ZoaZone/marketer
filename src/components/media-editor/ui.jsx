import { Loader2 } from 'lucide-react';

export const btn = 'flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:border-fuchsia-500/50 disabled:opacity-50';
export const primaryBtn = 'w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50';

export function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }) {
  return <label className="block space-y-1">
    <span className="flex justify-between text-xs font-semibold text-muted-foreground"><span>{label}</span><span>{typeof value === 'number' ? Math.round(value * 100) / 100 : value}{suffix}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} className="w-full accent-fuchsia-500" />
  </label>;
}

export function Chip({ active, children, ...props }) {
  return <button type="button" aria-pressed={active} {...props} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${active ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-400' : 'border-border text-muted-foreground hover:text-foreground'}`}>{children}</button>;
}

export function Spin({ show }) { return show ? <Loader2 className="w-4 h-4 animate-spin" /> : null; }