import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { MUSIC_PRESETS } from '@/components/quick-create/musicPresets';
import { btn, Slider, Chip } from '@/components/media-editor/ui';
import VoiceTimeline from '@/components/media-editor/VoiceTimeline';
import AudioMixer from '@/components/media-editor/AudioMixer';

function Track({ track, label, onVolume, onRemove }) {
  return <div className="space-y-1 rounded-xl border border-border bg-card p-3">
    <div className="flex items-center gap-2"><audio src={track.src} controls className="h-8 flex-1 min-w-0" /><button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><X className="w-4 h-4" /></button></div>
    <p className="text-[11px] text-muted-foreground truncate">{track.name}</p>
    <Slider label={`${label} volume`} value={track.volume} min={0} max={1.5} step={0.05} onChange={onVolume} />
  </div>;
}

export default function AudioPanel({ p }) {
  const musicIn = useRef(null);
  return <div className="space-y-5">
    <Slider label="Original video sound" value={p.clipVolume} min={0} max={1.5} step={0.05} onChange={p.setClipVolume} />
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Background music</p>
      <div className="flex flex-wrap gap-2">{[{ id: '', label: 'None' }, ...MUSIC_PRESETS].map(m => <Chip key={m.id || 'none'} active={!p.music && p.musicPreset === m.id} onClick={() => { p.setMusic(null); p.setMusicPreset(m.id); }}>{m.label}</Chip>)}</div>
      <button type="button" className={btn} onClick={() => musicIn.current?.click()}><Upload className="w-3.5 h-3.5" />Upload your own track</button>
      <input ref={musicIn} type="file" accept="audio/*" className="hidden" onChange={e => { p.uploadAudio('music', e.target.files?.[0], 0.6); e.target.value = ''; }} />
      {p.music && <Track track={p.music} label="Music" onVolume={v => p.setMusic({ ...p.music, volume: v })} onRemove={() => p.setMusic(null)} />}
      <p className="text-[11px] text-muted-foreground">Your upload replaces the library style. Use only music you have the rights to.</p>
    </div>
    <VoiceTimeline p={p} />
    <AudioMixer p={p} />
  </div>;
}