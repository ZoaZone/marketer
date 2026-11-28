import { Loader2, Wand2 } from 'lucide-react';

import { VIDEO_FORMATS, EXPORT_SIZES } from '@/components/quick-create/studioFormat';

export default function Base44StudioControls({ type, ratio, setRatio, size, setSize, duration, setDuration, busy, onGenerate, hasPrompt, children, pending }) {
  const locked = busy || pending;
  const ratios = type === 'video' ? VIDEO_FORMATS : ['1:1', '16:9', '9:16', '4:5'];
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
    <h3 className="font-semibold text-foreground">Create with Studio</h3>
    <p className="text-xs text-muted-foreground">Uses your AI credits: 1 per image, about 6 per 5 seconds of video. Free accounts start with 25 credits.</p>
    <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">{type === 'video' ? 'Aspect ratio' : 'Image framing'}</p><div className="flex flex-wrap gap-2">{ratios.map(r => <button key={r} type="button" disabled={locked} aria-pressed={ratio === r} onClick={() => setRatio(r)} className={`rounded-lg border px-3 py-2 text-xs ${ratio === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{r}</button>)}</div></div>
    {type === 'video' && <>
      <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">Export size</p><div className="flex gap-2">{EXPORT_SIZES.map(([id, label]) => <button key={id} type="button" disabled={locked} aria-pressed={size === id} onClick={() => setSize(id)} className={`rounded-lg border px-3 py-2 text-xs ${size === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{label}</button>)}</div><p className="text-[11px] text-muted-foreground">Square, 4:5 and 1080p are finished in your browser after generation (a short extra step).</p></div>
      <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">Clip length</p><div className="flex gap-2">{[4, 6, 8].map(s => <button key={s} type="button" disabled={locked} aria-pressed={duration === s} onClick={() => setDuration(s)} className={`rounded-lg border px-3 py-2 text-xs ${duration === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{s}s</button>)}</div></div>
      <p className="text-xs text-muted-foreground">Veo 3.1 Lite generates silent clips. Add music or narration separately. This clip uses {Math.max(6, Math.ceil(duration * 6 / 5))} app AI credits.</p>
      <p className="text-xs text-muted-foreground">After generation, apply your logo and text to bake them into the downloadable video. Branding is rendered in your browser without an external render service.</p>
    </>}
    {children}
    <button type="button" onClick={onGenerate} disabled={busy || (!hasPrompt && !pending)} className="w-full flex justify-center items-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{busy ? 'Creating…' : pending ? 'Resume video' : `Generate ${type}`}</button>
  </div>;
}