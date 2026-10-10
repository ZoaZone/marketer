import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Base44StudioControls from '@/components/quick-create/Base44StudioControls';
import Base44StudioPreview from '@/components/quick-create/Base44StudioPreview';

export default function Base44Studio({ type, prompt, referenceImageUrls, onBusyChange }) {
  const qc = useQueryClient();
  const [imageRatio, setImageRatio] = useState('1:1');
  const [videoRatio, setVideoRatio] = useState('16:9');
  const [duration, setDuration] = useState(6);
  const [audio, setAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState({});
  const [saved, setSaved] = useState({});
  const [error, setError] = useState('');
  const generate = async () => {
    setBusy(true); onBusyChange(true); setError('');
    try {
      const { data } = await base44.functions.invoke('generateBase44Studio', { action: type, prompt, aspectRatio: type === 'video' ? videoRatio : imageRatio, duration, audio, referenceImageUrls: type === 'image' ? referenceImageUrls.slice(0, 6) : [] });
      if (!data?.url) throw new Error(data?.error || 'No media was returned.');
      setResults(prev => ({ ...prev, [type]: { url: data.url, type, prompt } }));
      setSaved(prev => ({ ...prev, [type]: false }));
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setBusy(false); onBusyChange(false); }
  };
  const save = async () => {
    setSaving(true); onBusyChange(true); setError('');
    try {
      const result = results[type];
      await base44.entities.ContentAsset.create({ type: result.type, title: result.prompt.slice(0, 60) || 'Base44 Studio', file_url: result.url, ai_generated: true, prompt_used: result.prompt.slice(0, 500) });
      await qc.invalidateQueries({ queryKey: ['media_library'] });
      setSaved(prev => ({ ...prev, [type]: true }));
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setSaving(false); onBusyChange(false); }
  };
  return <div className="space-y-3">
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="grid md:grid-cols-2 gap-5">
      <Base44StudioControls type={type} ratio={type === 'video' ? videoRatio : imageRatio} setRatio={type === 'video' ? setVideoRatio : setImageRatio} duration={duration} setDuration={setDuration} audio={audio} setAudio={setAudio} busy={busy || saving} hasPrompt={!!prompt.trim()} onGenerate={generate} />
      <Base44StudioPreview result={results[type]} busy={busy} saving={saving} saved={saved[type]} onSave={save} />
    </div>
  </div>;
}