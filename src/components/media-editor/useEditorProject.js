import { useState, useCallback } from 'react';
import { clamp, newLayer } from '@/components/media-editor/editorModel';
import { importFile, importAsset, importLayerImage } from '@/components/media-editor/importMedia';

const MAX_CLIPS = 20;

export default function useEditorProject() {
  const [size, setSizeState] = useState({ w: 1280, h: 720 });
  const [clips, setClips] = useState([]), [selClipId, setSelClipId] = useState(null);
  const [layers, setLayers] = useState([]), [selLayerId, setSelLayerId] = useState(null);
  const [music, setMusic] = useState(null), [musicPreset, setMusicPreset] = useState('');
  const [voice, setVoice] = useState(null), [clipVolume, setClipVolume] = useState(1);
  const [mix, setMix] = useState({ bass: 0, treble: 0, fadeIn: 0, fadeOut: 0, duck: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  const run = useCallback(async job => {
    setBusy(true); setError('');
    try { await job(); } catch (e) { setError(e.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  }, []);

  const addClips = items => {
    setClips(prev => [...prev, ...items].slice(0, MAX_CLIPS));
    setSelClipId(prev => prev || items[0]?.id);
  };
  // The first clip sets the canvas shape, so a vertical video does not get letterboxed.
  const adoptSize = items => {
    const first = items[0]; if (clips.length || !first?.w || !first?.h) return;
    const k = Math.min(1, 1280 / Math.max(first.w, first.h));
    setSizeState({ w: Math.round(first.w * k / 2) * 2, h: Math.round(first.h * k / 2) * 2 });
  };
  const addFiles = files => run(async () => {
    const list = Array.from(files || []); if (!list.length) return;
    const items = []; for (const f of list) items.push(await importFile(f));
    adoptSize(items); addClips(items);
  });
  const addAssets = assets => run(async () => {
    const items = []; for (const a of assets) items.push(await importAsset(a));
    adoptSize(items); addClips(items);
  });
  const updateClip = (id, patch) => setClips(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const removeClip = id => { setClips(prev => prev.filter(c => c.id !== id)); setSelClipId(prev => (prev === id ? null : prev)); };
  const moveClip = (id, dir) => setClips(prev => {
    const i = prev.findIndex(c => c.id === id), j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const setSize = (w, h) => setSizeState({ w: clamp(Math.round(w / 2) * 2 || 720, 240, 2160), h: clamp(Math.round(h / 2) * 2 || 720, 240, 2160) });

  const addLayer = (kind, over) => { const l = newLayer(kind, over); setLayers(prev => [...prev, l]); setSelLayerId(l.id); return l; };
  const addMediaLayer = (kind, source) => run(async () => {
    const { src, media, name } = await importLayerImage(source);
    addLayer(kind, kind === 'logo' ? { src, media, name, x: 0.88, y: 0.1, w: 0.18 } : { src, media, name, x: 0.8, y: 0.25, w: 0.3 });
  });
  const updateLayer = (id, patch) => setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const removeLayer = id => { setLayers(prev => prev.filter(l => l.id !== id)); setSelLayerId(prev => (prev === id ? null : prev)); };

  const uploadAudio = (kind, file, volume) => run(async () => {
    if (!file) return;
    if (!file.type.startsWith('audio/') || file.size > 50 * 1024 * 1024) throw new Error('Choose an audio file (MP3, WAV, M4A) under 50 MB.');
    (kind === 'music' ? setMusic : setVoice)({ src: URL.createObjectURL(file), name: file.name, volume });
  });

  return {
    size, setSize, clips, selClipId, setSelClipId, layers, selLayerId, setSelLayerId, music, setMusic, musicPreset, setMusicPreset,
    voice, setVoice, clipVolume, setClipVolume, mix, setMix, busy, error, setError, run,
    addFiles, addAssets, updateClip, removeClip, moveClip, addLayer, addMediaLayer, updateLayer, removeLayer, uploadAudio,
  };
}