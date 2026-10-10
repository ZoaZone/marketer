import { Loader2, Wand2 } from 'lucide-react';

export default function Base44StudioControls({ type, ratio, setRatio, duration, setDuration, audio, setAudio, busy, onGenerate, hasPrompt, children, gateway, pending, estimatedCredits, onEstimate }) {
  const locked = busy || pending;
  const ratios = type === 'video' ? ['16:9', '9:16'] : ['1:1', '16:9', '9:16', '4:5'];
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
    <h3 className="font-semibold text-foreground">Create with Studio</h3>
    <p className="text-xs text-muted-foreground">Uses workspace generation credits, separate from premium generation allowances.</p>
    <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">{type === 'video' ? 'Aspect ratio' : 'Image framing'}</p><div className="flex flex-wrap gap-2">{ratios.map(r => <button key={r} type="button" disabled={locked} aria-pressed={ratio === r} onClick={() => setRatio(r)} className={`rounded-lg border px-3 py-2 text-xs ${ratio === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{r}</button>)}</div></div>
    {type === 'video' && <>
      <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">Clip length</p><div className="flex gap-2">{[4, 6, 8, 15].map(s => <button key={s} type="button" disabled={locked} aria-pressed={duration === s} onClick={() => setDuration(s)} className={`rounded-lg border px-3 py-2 text-xs ${duration === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{s}s</button>)}</div></div>
      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={audio} disabled={locked} onChange={e => setAudio(e.target.checked)} />Generate sound with the video</label>
      {gateway ? <div className="space-y-2"><p className="text-xs text-muted-foreground">15-second videos and videos with character references are generated at 720p. This advanced option can cost substantially more credits than short clips. Estimate the credits first to enable generation; the final charge may differ.</p><button type="button" disabled={locked || !hasPrompt} onClick={onEstimate} className="rounded-lg border border-border px-3 py-2 text-xs text-foreground disabled:opacity-50">Estimate generation credits</button>{estimatedCredits !== null && <p className="text-xs text-primary">Estimated: {estimatedCredits.toFixed(2)} credits. Final charge may differ.</p>}</div> : <p className="text-xs text-muted-foreground">About {duration * 5} credits per clip before audio-related charges. Generation may take a few minutes.</p>}
      <p className="text-xs text-muted-foreground">After generation, apply your logo and text to bake them into the downloadable video. Branding is rendered in your browser without an external render service.</p>
    </>}
    {children}
    <button type="button" onClick={onGenerate} disabled={busy || (!hasPrompt && !pending) || (type === 'video' && gateway && estimatedCredits === null && !pending)} className="w-full flex justify-center items-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{busy ? 'Creating…' : pending ? 'Resume video' : `Generate ${type}`}</button>
  </div>;
}