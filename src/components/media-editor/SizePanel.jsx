import { SIZE_PRESETS } from '@/components/media-editor/editorModel';
import { Chip } from '@/components/media-editor/ui';

export default function SizePanel({ p }) {
  const { w, h } = p.size;
  return <div className="space-y-4">
    <p className="text-xs font-semibold text-foreground">Output size</p>
    <div className="flex flex-wrap gap-2">{SIZE_PRESETS.map(s => <Chip key={s.id} active={w === s.w && h === s.h} onClick={() => p.setSize(s.w, s.h)}>{s.label}</Chip>)}</div>
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Custom size (pixels)</p>
      <div className="flex items-center gap-2">
        <input type="number" min={240} max={2160} value={w} onChange={e => p.setSize(+e.target.value, h)} aria-label="Width" className="w-24 rounded-lg border border-input bg-background p-2 text-sm text-foreground" />
        <span className="text-muted-foreground">×</span>
        <input type="number" min={240} max={2160} value={h} onChange={e => p.setSize(w, +e.target.value)} aria-label="Height" className="w-24 rounded-lg border border-input bg-background p-2 text-sm text-foreground" />
      </div>
      <p className="text-[11px] text-muted-foreground">Between 240 and 2160 pixels. Every clip is cropped or fitted to this size, so mixed photos and videos come out uniform. Change zoom and position per clip in the Clips tab.</p>
    </div>
  </div>;
}