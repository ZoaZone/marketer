import { Loader2, Download, Save, CheckCircle2 } from 'lucide-react';

export default function StudioImagePreview({ imageResult, generating, imageSaved, onSave }) {
  return <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
    <h3 className="font-semibold text-foreground mb-3">Preview</h3>
    {!imageResult && !generating && <div className="flex-1 flex items-center justify-center text-center text-sm text-muted-foreground py-12">Your generated image will appear here.</div>}
    {generating && <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground py-12"><Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" /></div>}
    {imageResult && !generating && <div className="space-y-4">
      <img src={imageResult} alt="" className="w-full rounded-xl border border-border" />
      <div className="flex gap-2">
        <a href={imageResult} download target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/20"><Download className="w-4 h-4" /> Download</a>
        <button onClick={onSave} disabled={imageSaved} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/25 disabled:opacity-60">{imageSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save to Library</>}</button>
      </div>
    </div>}
  </div>;
}