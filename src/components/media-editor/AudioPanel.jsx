import { useRef, useState } from 'react';
import { Upload, Mic, Square, X } from 'lucide-react';
import { MUSIC_PRESETS } from '@/components/quick-create/musicPresets';
import { btn, Slider, Chip } from '@/components/media-editor/ui';

function Track({ track, label, onVolume, onRemove }) {
  return <div className="space-y-1 rounded-xl border border-border bg-card p-3">
    <div className="flex items-center gap-2"><audio src={track.src} controls className="h-8 flex-1 min-w-0" /><button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><X className="w-4 h-4" /></button></div>
    <p className="text-[11px] text-muted-foreground truncate">{track.name}</p>
    <Slider label={`${label} volume`} value={track.volume} min={0} max={1.5} step={0.05} onChange={onVolume} />
  </div>;
}

export default function AudioPanel({ p }) {
  const musicIn = useRef(null), voiceIn = useRef(null), recorder = useRef(null);
  const [recording, setRecording] = useState(false);
  const startRec = () => p.run(async () => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { throw new Error('Microphone access was blocked. Allow it in your browser, or upload a voice-over file.'); }
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); p.setVoice({ src: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })), name: 'Recorded voice-over', volume: 1 }); setRecording(false); };
    rec.start(); recorder.current = rec; setRecording(true);
  });
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
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Voice-over</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn} disabled={p.busy && !recording} onClick={() => (recording ? recorder.current?.stop() : startRec())}>{recording ? <><Square className="w-3.5 h-3.5 text-red-400" />Stop recording</> : <><Mic className="w-3.5 h-3.5" />Record</>}</button>
        <button type="button" className={btn} onClick={() => voiceIn.current?.click()}><Upload className="w-3.5 h-3.5" />Upload voice file</button>
      </div>
      <input ref={voiceIn} type="file" accept="audio/*" className="hidden" onChange={e => { p.uploadAudio('voice', e.target.files?.[0], 1); e.target.value = ''; }} />
      {p.voice && <Track track={p.voice} label="Voice-over" onVolume={v => p.setVoice({ ...p.voice, volume: v })} onRemove={() => p.setVoice(null)} />}
      <p className="text-[11px] text-muted-foreground">The voice-over starts at the beginning of the video.</p>
    </div>
  </div>;
}