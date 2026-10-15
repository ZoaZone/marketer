import { useRef } from 'react';
import { Type, Image as ImageIcon, PictureInPicture2, Square, EyeOff, Trash2, FolderOpen } from 'lucide-react';
import { LAYER_LABELS } from '@/components/media-editor/editorModel';
import { btn, Slider, Chip } from '@/components/media-editor/ui';

function LayerSettings({ layer, update }) {
  const isMedia = layer.kind === 'logo' || layer.kind === 'pip';
  return <div className="space-y-3 rounded-xl border border-border bg-card p-3">
    {layer.kind === 'text' && <>
      <textarea value={layer.text} onChange={e => update({ text: e.target.value })} rows={3} maxLength={200} spellCheck placeholder="Type your text…" className="w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground" />
      <div className="flex items-center gap-3"><input type="color" value={layer.color} onChange={e => update({ color: e.target.value })} className="h-9 w-10 rounded border border-border bg-card" aria-label="Text colour" />
        <Chip active={layer.bg} onClick={() => update({ bg: !layer.bg })}>Dark backing</Chip></div>
      <Slider label="Text size" value={layer.size} min={2} max={14} step={0.5} suffix="%" onChange={v => update({ size: v })} />
    </>}
    {layer.kind === 'box' && <div className="flex items-center gap-3"><input type="color" value={layer.color} onChange={e => update({ color: e.target.value })} className="h-9 w-10 rounded border border-border bg-card" aria-label="Box colour" /><span className="text-xs text-muted-foreground">Solid colour to hide unwanted text or marks.</span></div>}
    {layer.kind === 'blur' && <p className="text-xs text-muted-foreground">Blurs whatever is under it. Drag it over bad text, then resize below.</p>}
    <Slider label="Left / right" value={layer.x} min={0} max={1} step={0.01} onChange={v => update({ x: v })} />
    <Slider label="Up / down" value={layer.y} min={0} max={1} step={0.01} onChange={v => update({ y: v })} />
    <Slider label="Width" value={layer.w} min={0.05} max={1} step={0.01} onChange={v => update({ w: v })} />
    {(layer.kind === 'box' || layer.kind === 'blur') && <Slider label="Height" value={layer.h} min={0.03} max={1} step={0.01} onChange={v => update({ h: v })} />}
    {(isMedia || layer.kind === 'text') && <Slider label="Opacity" value={layer.opacity} min={0.1} max={1} step={0.05} onChange={v => update({ opacity: v })} />}
  </div>;
}

export default function LayersPanel({ p, openLibrary }) {
  const logoIn = useRef(null), pipIn = useRef(null);
  const sel = p.layers.find(l => l.id === p.selLayerId);
  const pick = (ref, kind) => <input ref={ref} type="file" accept={kind === 'logo' ? 'image/*' : 'image/*,video/*'} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) p.addMediaLayer(kind, f); e.target.value = ''; }} />;
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={btn} onClick={() => p.addLayer('text', { text: 'Your text' })}><Type className="w-3.5 h-3.5" />Add text</button>
      <button type="button" className={btn} onClick={() => logoIn.current?.click()}><ImageIcon className="w-3.5 h-3.5" />Add logo</button>
      <button type="button" className={btn} onClick={() => pipIn.current?.click()}><PictureInPicture2 className="w-3.5 h-3.5" />Add PiP (photo / video)</button>
      <button type="button" className={btn} onClick={openLibrary}><FolderOpen className="w-3.5 h-3.5" />PiP from library</button>
      <button type="button" className={btn} onClick={() => p.addLayer('box', { y: 0.85, w: 0.6, h: 0.12 })}><Square className="w-3.5 h-3.5" />Cover box</button>
      <button type="button" className={btn} onClick={() => p.addLayer('blur', { y: 0.85, w: 0.6, h: 0.12 })}><EyeOff className="w-3.5 h-3.5" />Blur patch</button>
      {pick(logoIn, 'logo')}{pick(pipIn, 'pip')}
    </div>
    <p className="text-[11px] text-muted-foreground">Layers are drawn on top of every clip. Drag them on the preview, or use the sliders. Use a cover box or blur patch to hide badly rendered text in AI videos, then add clean text on top.</p>
    <div className="space-y-2">{p.layers.map(l => <div key={l.id} onClick={() => p.setSelLayerId(l.id)} className={`flex items-center gap-2 rounded-xl border p-2 cursor-pointer ${l.id === p.selLayerId ? 'border-fuchsia-500 bg-fuchsia-500/5' : 'border-border bg-card'}`}>
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground truncate">{LAYER_LABELS[l.kind]}{l.text ? `: ${l.text.slice(0, 24)}` : l.name ? `: ${l.name.slice(0, 24)}` : ''}</p></div>
      <button type="button" aria-label="Remove layer" onClick={e => { e.stopPropagation(); p.removeLayer(l.id); }}><Trash2 className="w-4 h-4 text-red-400" /></button>
    </div>)}</div>
    {sel && <LayerSettings layer={sel} update={patch => p.updateLayer(sel.id, patch)} />}
  </div>;
}