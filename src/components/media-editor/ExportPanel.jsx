import { useState } from 'react';
import { Download, Save, Check, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { exportImage, exportVideo } from '@/components/media-editor/renderProject';
import { totalLength, fmtTime } from '@/components/media-editor/editorModel';
import { primaryBtn, btn } from '@/components/media-editor/ui';

export default function ExportPanel({ p }) {
  const [progress, setProgress] = useState(null), [result, setResult] = useState(null), [saved, setSaved] = useState(false);
  const imageOnly = p.clips.length === 1 && p.clips[0].kind === 'image' && !p.music && !p.musicPreset && !p.voice;
  const total = totalLength(p.clips);

  const doExport = () => p.run(async () => {
    setResult(null); setSaved(false); setProgress(0);
    try {
      const project = { size: p.size, clips: p.clips, layers: p.layers, music: p.music, musicPreset: p.musicPreset, voice: p.voice, clipVolume: p.clipVolume, mix: p.mix };
      const blob = imageOnly ? await exportImage(project) : await exportVideo(project, setProgress);
      setResult({ blob, url: URL.createObjectURL(blob), isImage: imageOnly });
    } finally { setProgress(null); }
  });
  const save = () => p.run(async () => {
    const ext = result.isImage ? 'png' : result.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: new File([result.blob], `edited-media.${ext}`, { type: result.blob.type }) });
    await base44.entities.ContentAsset.create({ type: result.isImage ? 'image' : 'video', title: `Edited ${result.isImage ? 'image' : 'video'} ${new Date().toLocaleDateString()}`, file_url: file_uri, ai_generated: false, status: 'ready', dimensions: `${p.size.w}x${p.size.h}` });
    setSaved(true);
  });

  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{p.clips.length ? `${p.clips.length} clip${p.clips.length > 1 ? 's' : ''} · ${imageOnly ? 'PNG image' : `${fmtTime(total)} video`} · ${p.size.w}×${p.size.h}` : 'Add media to export.'}</p>
    <button type="button" className={primaryBtn} disabled={p.busy || !p.clips.length} onClick={doExport}>{progress !== null ? <><Loader2 className="w-4 h-4 animate-spin" />Exporting… {progress}%</> : `Export ${imageOnly ? 'image' : 'video'}`}</button>
    {!imageOnly && <p className="text-[11px] text-muted-foreground">Video is recorded in your browser in real time, so it takes about as long as the video. Keep this tab visible until it finishes.</p>}
    {result && <div className="space-y-2">
      {result.isImage ? <img src={result.url} alt="Exported" className="w-full rounded-xl" /> : <video src={result.url} controls playsInline className="w-full rounded-xl" />}
      <div className="grid grid-cols-2 gap-2">
        <a href={result.url} download={`edited-media.${result.isImage ? 'png' : result.blob.type.includes('mp4') ? 'mp4' : 'webm'}`} className={btn}><Download className="w-3.5 h-3.5" />Download</a>
        <button type="button" className={btn} disabled={p.busy || saved} onClick={save}>{saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}{saved ? 'Saved' : 'Save to Library'}</button>
      </div>
    </div>}
  </div>;
}