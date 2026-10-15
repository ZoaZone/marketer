import { useRef } from 'react';
import { Upload, FolderOpen, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { FILTERS, clipLength, fmtTime } from '@/components/media-editor/editorModel';
import { btn, Slider, Chip } from '@/components/media-editor/ui';

function ClipSettings({ clip, update }) {
  return <div className="space-y-3 rounded-xl border border-border bg-card p-3">
    <p className="text-xs font-semibold text-foreground truncate">Editing: {clip.name}</p>
    {clip.kind === 'video'
      ? <>
        <Slider label="Trim start" value={clip.trimStart} min={0} max={Math.max(0, clip.trimEnd - 0.2)} step={0.1} suffix="s" onChange={v => update({ trimStart: v })} />
        <Slider label="Trim end" value={clip.trimEnd} min={clip.trimStart + 0.2} max={clip.duration} step={0.1} suffix="s" onChange={v => update({ trimEnd: v })} />
      </>
      : <Slider label="Show for" value={clip.duration} min={1} max={30} step={0.5} suffix="s" onChange={v => update({ duration: v })} />}
    <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground">Crop &amp; framing</p>
      <div className="flex gap-2"><Chip active={clip.fit === 'cover'} onClick={() => update({ fit: 'cover' })}>Fill frame</Chip><Chip active={clip.fit === 'contain'} onClick={() => update({ fit: 'contain' })}>Fit inside</Chip></div></div>
    <Slider label="Zoom" value={clip.zoom} min={1} max={3} step={0.05} suffix="×" onChange={v => update({ zoom: v })} />
    <Slider label="Move left / right" value={clip.panX} min={0} max={1} step={0.01} onChange={v => update({ panX: v })} />
    <Slider label="Move up / down" value={clip.panY} min={0} max={1} step={0.01} onChange={v => update({ panY: v })} />
    <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground">Look</p><div className="flex flex-wrap gap-2">{Object.entries(FILTERS).map(([id, f]) => <Chip key={id} active={clip.filter === id} onClick={() => update({ filter: id })}>{f.label}</Chip>)}</div></div>
  </div>;
}

export default function ClipsPanel({ p, openLibrary }) {
  const input = useRef(null);
  const sel = p.clips.find(c => c.id === p.selClipId);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={btn} disabled={p.busy} onClick={() => input.current?.click()}><Upload className="w-3.5 h-3.5" />Add files</button>
      <button type="button" className={btn} disabled={p.busy} onClick={openLibrary}><FolderOpen className="w-3.5 h-3.5" />From Media Library</button>
      <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => { p.addFiles(e.target.files); e.target.value = ''; }} />
    </div>
    <p className="text-[11px] text-muted-foreground">Add several photos and videos; they play one after another in this order (up to 20).</p>
    {p.clips.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">No media yet. Add files or pick from your library.</p>}
    <div className="space-y-2">{p.clips.map((c, i) => <div key={c.id} onClick={() => p.setSelClipId(c.id)} className={`flex items-center gap-2 rounded-xl border p-2 cursor-pointer ${c.id === p.selClipId ? 'border-fuchsia-500 bg-fuchsia-500/5' : 'border-border bg-card'}`}>
      <div className="w-14 h-10 rounded-lg overflow-hidden bg-black shrink-0">{c.kind === 'image' ? <img src={c.src} alt="" className="w-full h-full object-cover" /> : <video src={c.src} className="w-full h-full object-cover" muted />}</div>
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground truncate">{i + 1}. {c.name}</p><p className="text-[10px] text-muted-foreground">{c.kind} · {fmtTime(clipLength(c))}</p></div>
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={e => { e.stopPropagation(); p.moveClip(c.id, -1); }}><ChevronUp className="w-4 h-4" /></button>
      <button type="button" aria-label="Move down" disabled={i === p.clips.length - 1} onClick={e => { e.stopPropagation(); p.moveClip(c.id, 1); }}><ChevronDown className="w-4 h-4" /></button>
      <button type="button" aria-label="Remove clip" onClick={e => { e.stopPropagation(); p.removeClip(c.id); }}><Trash2 className="w-4 h-4 text-red-400" /></button>
    </div>)}</div>
    {sel && <ClipSettings clip={sel} update={patch => p.updateClip(sel.id, patch)} />}
  </div>;
}