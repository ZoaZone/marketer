import { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useStudioVideoOptions(setError) {
  const [logo, setLogo] = useState(null), [character, setCharacter] = useState(null), [music, setMusic] = useState(null), [musicPreset, setMusicPreset] = useState(''), [extras, setExtras] = useState([]);
  const [text, updateText] = useState(''), [suggestion, setSuggestion] = useState(null);
  const [uploading, setUploading] = useState(''), [checking, setChecking] = useState(false);
  const setText = value => { updateText(value); setSuggestion(null); };
  const upload = async (kind, file) => {
    if (!file) return;
    setUploading(kind); setError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG, JPG or WebP image smaller than 10 MB.');
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
      const asset = { fileUri: file_uri, url: signed_url, name: file.name };
      if (kind === 'extra') setExtras(prev => [...prev, asset].slice(0, 3));
      else (kind === 'logo' ? setLogo : setCharacter)(asset);
    } catch (error) { setError(error.message || 'Image upload failed.'); }
    finally { setUploading(''); }
  };
  const fromLibrary = (kind, items) => {
    const assets = items.filter(a => a.type === 'image').map(a => ({ fileUri: a.file_uri || a.file_url, url: a.file_url, name: a.title || 'Library image' }));
    if (kind === 'extra') setExtras(prev => [...prev, ...assets].slice(0, 3));
    else if (assets[0]) (kind === 'logo' ? setLogo : setCharacter)(assets[0]);
  };
  const uploadMusic = async file => {
    if (!file) return;
    setUploading('music'); setError('');
    try {
      if (!file.type.startsWith('audio/') || file.size > 25 * 1024 * 1024) throw new Error('Choose an audio file (MP3, WAV, M4A) smaller than 25 MB.');
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
      setMusic({ fileUri: file_uri, url: signed_url, name: file.name });
    } catch (error) { setError(error.message || 'Music upload failed.'); }
    finally { setUploading(''); }
  };
  const proofread = async () => {
    setChecking(true); setError('');
    try {
      const { data } = await base44.functions.invoke('generateBase44Studio', { action: 'proofread', prompt: text });
      if (!data?.text) throw new Error(data?.error || 'No spelling review was returned.');
      setSuggestion(data.text);
    } catch (error) { setError(error?.response?.data?.error || error.message); }
    finally { setChecking(false); }
  };
  return { extras, removeExtra: index => setExtras(prev => prev.filter((_, i) => i !== index)), logo, character, music, musicPreset, setMusicPreset, text, setText, suggestion, uploading, checking, upload, fromLibrary, uploadMusic, proofread,
    applySuggestion: () => setText(suggestion), clear: kind => (kind === 'logo' ? setLogo : kind === 'music' ? setMusic : setCharacter)(null) };
}