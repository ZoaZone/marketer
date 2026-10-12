import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import renderStudioVideo from '@/components/quick-create/renderStudioVideo';
import renderStudioImage from '@/components/quick-create/renderStudioImage';

const emptyGraphics = JSON.stringify([null, '']);
const invoke = async payload => (await base44.functions.invoke('generateBase44Studio', payload)).data;

export default function useStudioMedia({ type, prompt, referenceImageUrls, ratio, duration, audio }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [results, setResults] = useState({}), [saved, setSaved] = useState({});
  const [pending, setPending] = useState(null), [message, setMessage] = useState(''), [estimatedCredits, setEstimatedCredits] = useState(null);
  useEffect(() => { setEstimatedCredits(null); }, [prompt, ratio, duration, audio, referenceImageUrls.join('|')]);
  const gateway = duration === 15 || referenceImageUrls.length > 0;
  const request = { prompt, aspectRatio: ratio, duration, audio, referenceImageUrls };
  const estimate = async () => {
    setBusy(true); setError(''); setMessage('Estimating video credits…');
    try {
      const data = await invoke({ ...request, action: 'videoEstimate' });
      if (!Number.isFinite(data.estimatedCredits)) throw new Error('No credit estimate was returned.');
      setEstimatedCredits(data.estimatedCredits);
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setBusy(false); setMessage(''); }
  };
  const generate = async () => {
    setBusy(true); setError(''); setMessage('Starting generation…');
    try {
      let data, sourcePrompt = prompt, sourceAudio = audio;
      if (type === 'video' && (gateway || pending)) {
        let active = pending;
        if (!active) {
          data = await invoke({ ...request, action: 'videoCreate' });
          if (!data.recordId) throw new Error(data.error || 'No video job was returned.');
          active = { recordId: data.recordId, prompt, audio };
          setPending(active);
        }
        sourcePrompt = active.prompt; sourceAudio = active.audio;
        for (let attempt = 0; attempt < 40; attempt++) {
          if (!data || !['completed', 'failed'].includes(data.status)) {
            setMessage(`Video is ${data?.status === 'queued' ? 'queued' : 'generating'}; checking progress…`);
            await new Promise(resolve => setTimeout(resolve, 15000));
            data = await invoke({ action: 'videoStatus', recordId: active.recordId });
          }
          if (data.status === 'failed') { setPending(null); throw new Error(data.error?.message || 'Video generation failed.'); }
          if (data.status === 'completed') break;
        }
        if (data.status !== 'completed') { setMessage('Your video is still generating. Use Resume video to check the same job without paying for another generation.'); return; }
        setPending(null);
      } else {
        data = await invoke({ ...request, action: type, referenceImageUrls: type === 'image' ? referenceImageUrls.slice(0, 6) : [] });
      }
      if (!data?.url) throw new Error(data?.error || 'No media was returned.');
      setResults(prev => ({ ...prev, [type]: { url: data.url, rawUrl: data.url, type, prompt: sourcePrompt, hasAudio: sourceAudio, renderedKey: emptyGraphics } }));
      setSaved(prev => ({ ...prev, [type]: false })); setMessage('');
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };
  const render = async ({ logo, text: rawText, setText }) => {
    setBusy(true); setError(''); setMessage('Checking spelling and applying your logo and text… Keep this tab visible.');
    try {
      const result = results[type];
      // Spelling is always reviewed before text is burned in; the corrected text is shown back to the user.
      let text = rawText;
      if (text.trim()) {
        try {
          const fixed = ((await invoke({ action: 'proofread', prompt: text })).text || '').trim();
          if (fixed && fixed.length <= 160) { text = fixed; if (fixed !== rawText) setText(fixed); }
        } catch { /* keep the user's text if the review is unavailable */ }
      }
      const logoUrl = logo ? (await base44.integrations.Core.CreateFileSignedUrl({ file_uri: logo.fileUri, expires_in: 3600 })).signed_url : '';
      const blob = type === 'image'
        ? await renderStudioImage({ url: result.rawUrl, logoUrl, text })
        : await renderStudioVideo({ url: result.rawUrl, logoUrl, text, hasAudio: result.hasAudio, onProgress: percent => setMessage(`Applying logo and text: ${percent}% · keep this tab visible`) });
      const file = new File([blob], type === 'image' ? 'studio-branded-image.png' : `studio-branded-video.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: blob.type });
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
      setResults(prev => ({ ...prev, [type]: { ...result, url: signed_url, fileUri: file_uri, renderedKey: JSON.stringify([logo?.fileUri || null, text]) } }));
      setSaved(prev => ({ ...prev, [type]: false })); setMessage('Graphics applied. Preview the final video before downloading or saving.');
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const result = results[type];
      await base44.entities.ContentAsset.create({ type: result.type, title: result.prompt.slice(0, 60) || 'Create with Studio', file_url: result.fileUri || result.url, ai_generated: true, prompt_used: result.prompt.slice(0, 500) });
      await qc.invalidateQueries({ queryKey: ['media_library'] });
      setSaved(prev => ({ ...prev, [type]: true }));
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };
  return { busy, saving, error, setError, result: results[type], saved: saved[type], pending, message, estimatedCredits, gateway, estimate, generate, render, save };
}