import { Download, Save, Loader2, CheckCircle2 } from 'lucide-react';

export default function Base44StudioPreview({ result, busy, saving, saved, onSave }) {
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
    <h3 className="font-semibold text-foreground">Preview</h3>
    {!result && <div className="py-12 text-center text-sm text-muted-foreground">{busy ? <><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />Generating your media with Base44…</> : 'Your Base44-generated media will appear here.'}</div>}
    {result && <>
      {result.type === 'video' ? <video src={result.url} controls playsInline className="w-full rounded-xl" /> : <img src={result.url} alt={result.prompt} className="w-full rounded-xl" />}
      <div className="flex flex-wrap gap-2">
        <a href={result.url} target="_blank" rel="noopener noreferrer" download className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm text-foreground"><Download className="w-4 h-4" />Download</a>
        <button type="button" onClick={onSave} disabled={saving || saved} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 p-3 text-sm text-primary disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : saved ? 'Saved' : 'Save to Library'}</button>
      </div>
    </>}
  </div>;
}