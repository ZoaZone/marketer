import { drawFrame } from '@/components/media-editor/drawFrame';
import { clipLength, totalLength } from '@/components/media-editor/editorModel';
import { renderPresetBuffer } from '@/components/quick-create/musicPresets';

const loaded = (el, event, src) => new Promise((resolve, reject) => {
  el.addEventListener(event, () => resolve(el), { once: true });
  el.addEventListener('error', () => reject(new Error('A file could not be loaded for editing.')), { once: true });
  el.src = src;
});

export async function makeMediaElement(kind, src) {
  if (kind === 'video') {
    const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto';
    return loaded(v, 'loadeddata', src);
  }
  return loaded(new Image(), 'load', src);
}

export async function makeLayerElement(layer) {
  if (!layer.src) return null;
  const el = await makeMediaElement(layer.media === 'video' ? 'video' : 'image', layer.src);
  if (layer.media === 'video') { el.muted = true; el.loop = true; el.play().catch(() => {}); }
  return el;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = async (ctx, src) => {
  const res = await fetch(src);
  try { return await ctx.decodeAudioData(await res.arrayBuffer()); }
  catch { throw new Error('An audio track could not be read. Try MP3, WAV or M4A.'); }
};
const seek = (v, t) => new Promise(resolve => { const done = () => resolve(); v.addEventListener('seeked', done, { once: true }); v.currentTime = t; setTimeout(done, 800); });

export async function exportImage(project) {
  const { size, clips, layers } = project;
  const canvas = document.createElement('canvas'); canvas.width = size.w; canvas.height = size.h;
  const assets = {}; for (const l of layers) assets[l.id] = await makeLayerElement(l);
  const media = await makeMediaElement('image', clips[0].src);
  drawFrame(canvas.getContext('2d'), size.w, size.h, { clip: clips[0], media, layers, assets });
  Object.values(assets).forEach(el => el?.pause?.());
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not export the image.'))), 'image/png'));
}

export async function exportVideo(project, onProgress) {
  const { size, clips, layers, music, musicPreset, voice, clipVolume } = project;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video export needs a supported browser such as Chrome or Edge.');
  const total = totalLength(clips);
  const audio = new (window.AudioContext || window.webkitAudioContext)();
  await audio.resume();
  const els = [], assets = {};
  let raf, recorder, stream;
  try {
    const canvas = document.createElement('canvas'); canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    for (const l of layers) assets[l.id] = await makeLayerElement(l);
    const mix = project.mix || {};
    const out = audio.createMediaStreamDestination(), dest = audio.createGain();
    const low = audio.createBiquadFilter(), high = audio.createBiquadFilter();
    low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = mix.bass || 0;
    high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = mix.treble || 0;
    dest.connect(low).connect(high).connect(out);
    for (const c of clips) {
      const el = await makeMediaElement(c.kind, c.src); els.push(el);
      if (c.kind === 'video') { const g = audio.createGain(); g.gain.value = clipVolume; audio.createMediaElementSource(el).connect(g).connect(dest); }
    }
    const tracks = [];
    const addTrack = (buffer, volume, delay = 0) => {
      const src = audio.createBufferSource(), g = audio.createGain();
      src.buffer = buffer; src.delay = delay; src.vol = g; g.gain.value = volume; src.connect(g).connect(dest); tracks.push(src); return src;
    };
    let musicTrack = null;
    if (music?.src) musicTrack = addTrack(await decode(audio, music.src), music.volume);
    else if (musicPreset) musicTrack = addTrack(await renderPresetBuffer(musicPreset, Math.ceil(total) + 2), 0.8);
    if (musicTrack) musicTrack.loop = true;
    if (voice?.src) addTrack(await decode(audio, voice.src), voice.volume, voice.start || 0);
    stream = canvas.captureStream(30);
    out.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    if (!mimeType) throw new Error('This browser cannot export video. Please use Chrome or Edge.');
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => reject(new Error('The browser could not record the video.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });
    let index = 0, elapsed = 0, started = performance.now();
    const frame = () => {
      drawFrame(ctx, size.w, size.h, { clip: clips[index], media: els[index], layers, assets });
      onProgress(Math.min(99, Math.round(((elapsed + (performance.now() - started) / 1000) / total) * 100)));
      raf = requestAnimationFrame(frame);
    };
    for (const l of layers) if (l.media === 'video') assets[l.id]?.play().catch(() => {});
    const t0 = audio.currentTime;
    if (mix.fadeIn > 0) { dest.gain.setValueAtTime(0, t0); dest.gain.linearRampToValueAtTime(1, t0 + mix.fadeIn); }
    if (mix.fadeOut > 0) { dest.gain.setValueAtTime(1, t0 + Math.max(mix.fadeIn || 0, total - mix.fadeOut)); dest.gain.linearRampToValueAtTime(0, t0 + total); }
    if (mix.duck && voice?.src && musicTrack) {
      const g = musicTrack.vol.gain, base = g.value, vs = voice.start || 0, ve = vs + (voice.duration || total);
      g.setValueAtTime(base, t0 + Math.max(0, vs - 0.3)); g.linearRampToValueAtTime(base * 0.3, t0 + vs + 0.01);
      g.setValueAtTime(base * 0.3, t0 + ve); g.linearRampToValueAtTime(base, t0 + ve + 0.5);
    }
    frame(); recorder.start(); tracks.forEach(t => t.start(t0 + (t.delay || 0)));
    for (index = 0; index < clips.length; index++) {
      const c = clips[index], el = els[index]; started = performance.now();
      if (c.kind === 'image') await sleep(clipLength(c) * 1000);
      else {
        await seek(el, c.trimStart); await el.play();
        await new Promise(resolve => { const t = setInterval(() => { if (el.currentTime >= c.trimEnd - 0.03 || el.ended) { clearInterval(t); resolve(); } }, 30); });
        el.pause();
      }
      elapsed += clipLength(c);
    }
    index = clips.length - 1; await sleep(150);
    tracks.forEach(t => { try { t.stop(); } catch { /* already stopped */ } });
    cancelAnimationFrame(raf); recorder.stop();
    const blob = await done; onProgress(100); return blob;
  } finally {
    cancelAnimationFrame(raf);
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(t => t.stop());
    els.forEach(el => el.pause?.());
    Object.values(assets).forEach(el => el?.pause?.());
    await audio.close();
  }
}