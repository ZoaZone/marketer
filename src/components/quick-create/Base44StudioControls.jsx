import { Loader2, Wand2 } from 'lucide-react';

export default function Base44StudioControls({ type, ratio, setRatio, duration, setDuration, audio, setAudio, busy, onGenerate, hasPrompt }) {
  const ratios = type === 'video' ? ['16:9', '9:16'] : ['1:1', '16:9', '9:16', '4:5'];
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
    <h3 className="font-semibold text-foreground">Base44-only {type === 'video' ? 'video' : 'image'}</h3>
    <p className="text-xs text-muted-foreground">Uses your workspace’s Base44 integration credits, not this app’s premium provider allowance. There is no Replicate, ElevenLabs, BYOK or external render-service fallback in this option.</p>
    <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">{type === 'video' ? 'Aspect ratio' : 'Image framing'}</p><div className="flex flex-wrap gap-2">{ratios.map(r => <button key={r} type="button" disabled={busy} aria-pressed={ratio === r} onClick={() => setRatio(r)} className={`rounded-lg border px-3 py-2 text-xs ${ratio === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{r}</button>)}</div></div>
    {type === 'video' && <>
      <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">Clip length</p><div className="flex gap-2">{[4, 6, 8].map(s => <button key={s} type="button" disabled={busy} aria-pressed={duration === s} onClick={() => setDuration(s)} className={`rounded-lg border px-3 py-2 text-xs ${duration === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{s}s</button>)}</div></div>
      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={audio} disabled={busy} onChange={e => setAudio(e.target.checked)} />Generate sound with the video</label>
      <p className="text-xs text-muted-foreground">About {duration * 5} integration credits per clip before any audio-related charges. Text-to-video only; reference-image animation and longer assembled films remain in the existing workflow. Generation may take a few minutes.</p>
    </>}
    <button type="button" onClick={onGenerate} disabled={busy || !hasPrompt} className="w-full flex justify-center items-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{busy ? 'Generating with Base44…' : `Generate ${type} with Base44`}</button>
  </div>;
}