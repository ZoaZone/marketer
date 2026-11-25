import { useState } from 'react';
import { Download, Save, Check, Loader2, Server, Monitor } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { exportImage, exportVideo } from '@/components/media-editor/renderProject';
import { exportViaServer } from '@/components/media-editor/serverExport';
import { totalLength, fmtTime } from '@/components/media-editor/editorModel';
import { primaryBtn, btn } from '@/components/media-editor/ui';

export default function ExportPanel({ p }) {
  const [progress, setProgress] = useState(null), [result, setResult] = useState(null), [saved, setSaved] = useState(false);
  const [mode, setMode] = useState('server'); // 'server' | 'browser' — video only
  const imageOnly = p.clips.length === 1 && p.clips[0].kind === 'image' && !p.music && !p.musicPreset && !p.voice;
  const total = totalLength(p.clips);
  const presetOnlyMusic = !!p.musicPreset && !p.music;

  const doExport = () => p.run(async () => {
    setResult(null); setSaved(false); setProgress(0);
    try {
      if (imageOnly) {
        const blob = await exportImage({ size: p.size, clips: p.clips, layers: p.layers });
        setResult({ blob, url: URL.createObjectURL(blob), isImage: true, server: false });
        return;
      }
      if (mode === 'server') {
        const url = await exportViaServer(p, setProgress);
        setResult({ blob: null, url, isImage: false, server: true });
        return;
      }
      const project = { size: p.size, clips: p.clips, layers: p.layers, music: p.music, musicPreset: p.musicPreset, voice: p.voice, clipVolume: p.clipVolume, mix: p.mix };
      const blob = await exportVideo(project, setProgress);
      setResult({ blob, url: URL.createObjectURL(blob), isImage: false, server: false });
    } finally { setProgress(null); }
  });

  const save = () => p.run(async () => {
    if (result.server) {
      await base44.entities.ContentAsset.create({ type: 'video', title: `Edited video ${new Date().toLocaleDateString()}`, file_url: result.url, ai_generated: false, status: 'ready', dimensions: `${p.size.w}x${p.size.h}` });
      setSaved(true);
      return;
    }
    const ext = result.isImage ? 'png' : result.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: new File([result.blob], `edited-media.${ext}`, { type: result.blob.type }) });
    await base44.entities.ContentAsset.create({ type: result.isImage ? 'image' : 'video', title: `Edited ${result.isImage ? 'image' : 'video'} ${new Date().toLocaleDateString()}`, file_url: file_uri, ai_generated: false, status: 'ready', dimensions: `${p.size.w}x${p.size.h}` });
    setSaved(true);
  });

  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{p.clips.length ? `${p.clips.length} clip${p.clips.length > 1 ? 's' : ''} · ${imageOnly ? 'PNG image' : `${fmtTime(total)} video`} · ${p.size.w}×${p.size.h}` : 'Add media to export.'}</p>

    {!imageOnly && <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border">
        <button type="button" onClick={() => setMode('server')} aria-pressed={mode === 'server'}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold ${mode === 'server' ? 'bg-fuchsia-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
          <Server className="w-3.5 h-3.5" />On our servers
        </button>
        <button type="button" onClick={() => setMode('browser')} aria-pressed={mode === 'browser'}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold ${mode === 'browser' ? 'bg-fuchsia-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
          <Monitor className="w-3.5 h-3.5" />In this browser
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {mode === 'server'
          ? 'Renders on our servers — faster, higher quality, and you can close this tab once it starts.'
          : 'Records in your browser in real time, so it takes about as long as the video, and you must keep this tab visible until it finishes.'}
      </p>
      {mode === 'server' && presetOnlyMusic && <p className="text-[10px] text-amber-500">The free ambient music presets only play in the browser preview — switch to "In this browser", or add an uploaded/AI-generated track, to include music in a server export.</p>}
    </div>}

    <button type="button" className={primaryBtn} disabled={p.busy || !p.clips.length} onClick={doExport}>{progress !== null ? <><Loader2 className="w-4 h-4 animate-spin" />Exporting… {progress}%</> : `Export ${imageOnly ? 'image' : 'video'}`}</button>
    {result && <div className="space-y-2">
      {result.isImage ? <img src={result.url} alt="Exported" className="w-full rounded-xl" /> : <video src={result.url} controls playsInline className="w-full rounded-xl" />}
      <div className="grid grid-cols-2 gap-2">
        <a href={result.url} download={result.server ? undefined : `edited-media.${result.isImage ? 'png' : result.blob.type.includes('mp4') ? 'mp4' : 'webm'}`} target={result.server ? '_blank' : undefined} rel={result.server ? 'noreferrer' : undefined} className={btn}><Download className="w-3.5 h-3.5" />Download</a>
        <button type="button" className={btn} disabled={p.busy || saved} onClick={save}>{saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}{saved ? 'Saved' : 'Save to Library'}</button>
      </div>
    </div>}
  </div>;
}
