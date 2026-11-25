import { useRef, useState } from 'react';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';
import { MUSIC_PRESETS } from '@/components/quick-create/musicPresets';
import { btn, Slider, Chip } from '@/components/media-editor/ui';
import VoiceTimeline from '@/components/media-editor/VoiceTimeline';
import AudioMixer from '@/components/media-editor/AudioMixer';
import { generateMusic } from '@/utils/lane2';
import { totalLength } from '@/components/media-editor/editorModel';

function Track({ track, label, onVolume, onRemove }) {
  return <div className="space-y-1 rounded-xl border border-border bg-card p-3">
    <div className="flex items-center gap-2"><audio src={track.src} controls className="h-8 flex-1 min-w-0" /><button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><X className="w-4 h-4" /></button></div>
    <p className="text-[11px] text-muted-foreground truncate">{track.name}</p>
    <Slider label={`${label} volume`} value={track.volume} min={0} max={1.5} step={0.05} onChange={onVolume} />
  </div>;
}

export default function AudioPanel({ p, canMusic }) {
  const musicIn = useRef(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const generateAiMusic = () => p.run(async () => {
    setGenerating(true);
    try {
      const seconds = Math.max(10, Math.round(totalLength(p.clips)) || 30);
      const result = await generateMusic({ prompt: aiPrompt || undefined, durationSeconds: seconds, instrumental: true, mood: 'uplifting' });
      if (!result?.url) throw new Error('No music track was produced.');
      p.setMusic({ src: result.url, name: aiPrompt ? `AI music — ${aiPrompt.slice(0, 40)}` : 'AI-generated music', volume: 0.6 });
      p.setMusicPreset('');
    } finally { setGenerating(false); }
  });

  return <div className="space-y-5">
    <Slider label="Original video sound" value={p.clipVolume} min={0} max={1.5} step={0.05} onChange={p.setClipVolume} />
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Background music</p>
      <div className="flex flex-wrap gap-2">{[{ id: '', label: 'None' }, ...MUSIC_PRESETS].map(m => <Chip key={m.id || 'none'} active={!p.music && p.musicPreset === m.id} onClick={() => { p.setMusic(null); p.setMusicPreset(m.id); }}>{m.label}</Chip>)}</div>
      <button type="button" className={btn} onClick={() => musicIn.current?.click()}><Upload className="w-3.5 h-3.5" />Upload your own track</button>
      <input ref={musicIn} type="file" accept="audio/*" className="hidden" onChange={e => { p.uploadAudio('music', e.target.files?.[0], 0.6); e.target.value = ''; }} />
      <div className="space-y-1.5 rounded-lg border border-dashed border-fuchsia-500/30 p-2.5">
        <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />Generate with AI</p>
        {canMusic ? <>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Optional: describe the mood, e.g. upbeat acoustic, calm piano"
            className="w-full rounded-lg border border-input bg-background p-2 text-xs" />
          <button type="button" className={btn} disabled={generating} onClick={generateAiMusic}>
            {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Composing…</> : <><Sparkles className="w-3.5 h-3.5" />Generate track (scored to your video's length)</>}
          </button>
        </> : <p className="text-[11px] text-muted-foreground">AI music is available on Agency and Movie Maker Pro plans. Presets and uploads above work on every plan.</p>}
      </div>
      {p.music && <Track track={p.music} label="Music" onVolume={v => p.setMusic({ ...p.music, volume: v })} onRemove={() => p.setMusic(null)} />}
      <p className="text-[11px] text-muted-foreground">Your upload replaces the library style. Use only music you have the rights to.</p>
    </div>
    <VoiceTimeline p={p} />
    <AudioMixer p={p} />
  </div>;
}
