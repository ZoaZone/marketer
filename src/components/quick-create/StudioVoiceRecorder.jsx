import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';

// Records the user's own narration; it is mixed in when the video is finished.
export default function StudioVoiceRecorder({ voice, setVoice, disabled, setError }) {
  const recorder = useRef(null), startedAt = useRef(0);
  const [recording, setRecording] = useState(false), [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  const start = async () => {
    setError('');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError('Microphone access was blocked. Allow it in your browser and try again.'); return; }
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); setRecording(false);
      if (voice?.url) URL.revokeObjectURL(voice.url);
      setVoice({ url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })), name: 'Recorded narration' });
    };
    startedAt.current = Date.now(); setElapsed(0); rec.start(); recorder.current = rec; setRecording(true);
  };

  return <div className="space-y-2">
    <p className="text-xs font-semibold text-foreground">Record your narration</p>
    <div className="flex items-center gap-2">
      <button type="button" disabled={disabled} onClick={() => (recording ? recorder.current?.stop() : start())} className="flex items-center gap-1.5 rounded-lg border border-border p-2 text-xs text-foreground disabled:opacity-50">
        {recording ? <><Square className="h-3.5 w-3.5 text-red-400" />Stop ({elapsed}s)</> : <><Mic className="h-3.5 w-3.5" />{voice ? 'Re-record' : 'Record'}</>}
      </button>
      {voice && <><audio src={voice.url} controls className="h-8 flex-1 min-w-0" /><button type="button" disabled={disabled} aria-label="Remove narration" onClick={() => setVoice(null)}><X className="h-4 w-4" /></button></>}
    </div>
    <p className="text-xs text-muted-foreground">Your voice is mixed over the video, and over any music, when the video is finished. Record the narration to match the video length.</p>
  </div>;
}