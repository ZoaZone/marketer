// serverExport.js — submits the Media Editor's project to the render
// worker's FFmpeg pipeline (server-render/mediaEditorRender.js) instead of
// recording it in the browser. Handles the one thing the worker can't do
// itself: every clip/layer/voice/music source in the editor is a local
// blob: URL (see importMedia.js) because everything is loaded client-side
// to avoid canvas-tainting, but the worker downloads its inputs by URL, so
// each blob: source is re-uploaded to Base44 storage first to get a
// persistent https URL — the same fix used for the photo-to-video feature
// in ClipsPanel.jsx.
import { uploadFile, submitMediaEditorRender, getRenderStatus } from '@/utils/lane2';

async function toHttpsUrl(src, filename) {
  if (/^https?:\/\//i.test(src)) return src; // already persistent — nothing to do
  const res = await fetch(src);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const url = await uploadFile(file);
  if (!url) throw new Error(`Could not prepare "${filename}" for server export.`);
  return url;
}

// Builds the worker's project JSON from the editor's live state, uploading
// every local source along the way. musicPreset (the free, browser-synthesized
// ambient loops) has no server-renderable source and isn't included — a
// preset-only project exports with no music via this path; the caller
// should tell the user to use an uploaded or AI-generated track instead if
// they want music in a server export.
export async function buildServerProject(p) {
  const clips = [];
  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i];
    clips.push({
      kind: c.kind,
      url: await toHttpsUrl(c.src, c.name || `clip-${i}`),
      trimStart: c.trimStart, trimEnd: c.trimEnd, duration: c.duration,
      fit: c.fit, zoom: c.zoom, panX: c.panX, panY: c.panY, filter: c.filter,
    });
  }

  const layers = [];
  for (const l of p.layers) {
    const layer = { kind: l.kind, x: l.x, y: l.y, w: l.w, h: l.h, text: l.text, color: l.color, bg: l.bg, size: l.size, opacity: l.opacity };
    if ((l.kind === 'logo' || l.kind === 'pip') && l.src) {
      layer.url = await toHttpsUrl(l.src, l.name || `${l.kind}-${l.id}`);
      layer.mediaKind = l.media === 'video' ? 'video' : 'image';
    }
    layers.push(layer);
  }

  let music = null;
  if (p.music?.src) music = { url: await toHttpsUrl(p.music.src, p.music.name || 'music'), volume: p.music.volume };

  let voice = null;
  if (p.voice?.src) {
    voice = {
      url: await toHttpsUrl(p.voice.src, p.voice.name || 'voice'),
      start: p.voice.start || 0, volume: p.voice.volume, duration: p.voice.duration,
    };
  }

  return { size: p.size, clips, layers, clipVolume: p.clipVolume, music, voice, mix: p.mix };
}

// Submits the built project and polls until it's done. onProgress receives
// a 0-100 value: 0-15 is spent preparing/uploading sources, 15-100 tracks
// the worker's own reported progress.
export async function exportViaServer(p, onProgress = () => {}) {
  onProgress(1);
  const project = await buildServerProject(p);
  onProgress(15);

  const jobId = await submitMediaEditorRender(project);

  const POLL_MS = 3000;
  // A long multi-clip edit with overlays and a mixed soundtrack runs
  // several FFmpeg passes back to back; this worker also processes one
  // FFmpeg job at a time across every feature that uses it (Quick Create,
  // Movie Maker, Media Editor), so a job can sit queued behind another
  // before it even starts. 20 minutes covers a realistic worst case.
  const TIMEOUT_MS = 1_200_000;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > TIMEOUT_MS) throw new Error('The export timed out. Please try again.');
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const job = await getRenderStatus(jobId);
    if (job?.status === 'done') { onProgress(100); return job.url; }
    if (job?.status === 'error') throw new Error(job.error || 'The export failed.');
    const workerPercent = typeof job?.percent === 'number' ? job.percent : (typeof job?.progress === 'number' ? Math.round(job.progress * 100) : 0);
    onProgress(Math.min(99, 15 + Math.round(workerPercent * 0.85)));
  }
}
