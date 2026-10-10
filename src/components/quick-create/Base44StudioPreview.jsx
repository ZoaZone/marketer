import { Download, Save, Loader2, CheckCircle2 } from 'lucide-react';

export default function Base44StudioPreview({ result, busy, saving, saved, onSave, needsGraphics, onRender }) {
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
    <h3 className="font-semibold text-foreground">Preview</h3>
    {!result && <div className="py-12 text-center text-sm text-muted-foreground">{busy ? <><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />Creating your media…</> : 'Your Studio creation will appear here.'}</div>}
    {result && <>
      {result.type === 'video' ? <video src={result.url} controls playsInline className="w-full rounded-xl" /> : <img src={result.url} alt={result.prompt} className="w-full rounded-xl" />}
      {needsGraphics && <div className="space-y-2"><p className="text-xs text-muted-foreground">This preview does not yet include your latest logo and text.</p><button type="button" onClick={onRender} disabled={busy} className="w-full rounded-xl bg-primary p-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Apply logo &amp; text to video</button><p className="text-xs text-muted-foreground">Export records in real time. Keep this tab visible; sound is preserved when generated.</p></div>}
      <div className="flex flex-wrap gap-2">
        {!needsGraphics && !busy && <a href={result.url} target="_blank" rel="noopener noreferrer" download className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm text-foreground"><Download className="w-4 h-4" />Download</a>}
        <button type="button" onClick={onSave} disabled={busy || saving || saved || needsGraphics} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 p-3 text-sm text-primary disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : saved ? 'Saved' : 'Save to Library'}</button>
      </div>
    </>}
  </div>;
}