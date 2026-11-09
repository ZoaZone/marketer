import { useEffect, useRef, useState } from 'react';
import { Upload, Mic, Square, X } from 'lucide-react';
import { btn, Slider } from '@/components/media-editor/ui';
import { totalLength, fmtTime } from '@/components/media-editor/editorModel';

// Voice-over recorder with a timeline bar: the narration is a block you can
// place anywhere along the video with the start slider.
export default function VoiceTimeline({ p }) {
  const recorder = useRef(null), fileIn = useRef(null), startedAt = useRef(0);
  const [recording, setRecording] = useState(false), [elapsed, setElapsed] = useState(0);
  const total = Math.max(1, totalLength(p.clips)), voice = p.voice;

  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 200);
    return () => clearInterval(t);
  }, [recording]);

  const measure = src => new Promise(resolve => {
    const a = new Audio(src); a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0); a.onerror = () => resolve(0);
  });
  const setTrack = async (src, name, start = 0) => p.setVoice({ src, name, volume: 1, start, duration: await measure(src) });

  const startRec = () => p.run(async () => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { throw new Error('Microphone access was blocked. Allow it in your browser, or upload a voice-over file.'); }
    const rec = new MediaRecorder(stream), chunks = [], start = voice?.start || 0;
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); setRecording(false); setTrack(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })), 'Recorded voice-over', start); };
    startedAt.current = Date.now(); setElapsed(0); rec.start(); recorder.current = rec; setRecording(true);
  });

  const start = voice?.start || 0, width = voice?.duration ? Math.min(100 - (start / total) * 100, (voice.duration / total) * 100) : 4;
  return <div className="space-y-2">
    <p className="text-xs font-semibold text-foreground">Voice-over</p>
    <div className="relative h-8 rounded-lg border border-border bg-muted overflow-hidden" aria-label="Voice-over timeline">
      {voice && <div className="absolute inset-y-1 rounded bg-fuchsia-500/70 text-[10px] text-white px-1 truncate" style={{ left: `${(start / total) * 100}%`, width: `${width}%` }}>Voice</div>}
      <span className="absolute right-1 top-1 text-[10px] text-muted-foreground">{fmtTime(total)}</span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={btn} disabled={p.busy && !recording} onClick={() => (recording ? recorder.current?.stop() : startRec())}>
        {recording ? <><Square className="w-3.5 h-3.5 text-red-400" />Stop ({fmtTime(elapsed)})</> : <><Mic className="w-3.5 h-3.5" />{voice ? 'Re-record' : 'Record'}</>}
      </button>
      <button type="button" className={btn} onClick={() => fileIn.current?.click()}><Upload className="w-3.5 h-3.5" />Upload voice file</button>
    </div>
    <input ref={fileIn} type="file" accept="audio/*" className="hidden" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      if (!file.type.startsWith('audio/') || file.size > 50 * 1024 * 1024) { p.setError('Choose an audio file (MP3, WAV, M4A) under 50 MB.'); return; }
      setTrack(URL.createObjectURL(file), file.name, voice?.start || 0);
    }} />
    {voice && <div className="space-y-1 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2"><audio src={voice.src} controls className="h-8 flex-1 min-w-0" /><button type="button" aria-label="Remove Voice-over" onClick={() => p.setVoice(null)}><X className="w-4 h-4" /></button></div>
      <p className="text-[11px] text-muted-foreground truncate">{voice.name}</p>
      <Slider label="Starts at" value={start} min={0} max={total} step={0.1} suffix="s" onChange={v => p.setVoice({ ...voice, start: v })} />
      <Slider label="Voice-over volume" value={voice.volume} min={0} max={1.5} step={0.05} onChange={v => p.setVoice({ ...voice, volume: v })} />
    </div>}
    <p className="text-[11px] text-muted-foreground">Record your narration, then slide it to where it should begin in the video. Re-record any time.</p>
  </div>;
}