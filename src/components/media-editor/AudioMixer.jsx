import { Slider, Chip } from '@/components/media-editor/ui';

// Master mixing controls applied to the whole soundtrack on export.
export default function AudioMixer({ p }) {
  const m = p.mix, set = patch => p.setMix({ ...m, ...patch });
  return <div className="space-y-3 rounded-xl border border-border bg-card p-3">
    <p className="text-xs font-semibold text-foreground">Mixing</p>
    <Slider label="Bass" value={m.bass} min={-12} max={12} step={1} suffix=" dB" onChange={v => set({ bass: v })} />
    <Slider label="Treble" value={m.treble} min={-12} max={12} step={1} suffix=" dB" onChange={v => set({ treble: v })} />
    <Slider label="Fade in" value={m.fadeIn} min={0} max={5} step={0.5} suffix="s" onChange={v => set({ fadeIn: v })} />
    <Slider label="Fade out" value={m.fadeOut} min={0} max={5} step={0.5} suffix="s" onChange={v => set({ fadeOut: v })} />
    <Chip active={m.duck} onClick={() => set({ duck: !m.duck })}>Lower music under voice-over</Chip>
    <p className="text-[11px] text-muted-foreground">Applied when you export the video.</p>
  </div>;
}