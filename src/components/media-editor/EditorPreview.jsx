import { useEffect, useRef, useState } from 'react';
import { Play, Pause, ImageIcon } from 'lucide-react';
import { drawFrame, layerBounds } from '@/components/media-editor/drawFrame';
import { makeMediaElement, makeLayerElement } from '@/components/media-editor/renderProject';
import { clamp } from '@/components/media-editor/editorModel';

export default function EditorPreview({ size, clip, layers, selLayerId, onSelectLayer, onMoveLayer }) {
  const canvasRef = useRef(null), mediaRef = useRef(null), assetsRef = useRef({}), stateRef = useRef({});
  const [playing, setPlaying] = useState(false), dragging = useRef(false);
  stateRef.current = { clip, layers, size };

  useEffect(() => {
    let dead = false; mediaRef.current = null; setPlaying(false);
    if (clip) makeMediaElement(clip.kind, clip.src).then(el => {
      if (dead) return;
      if (clip.kind === 'video') { el.currentTime = clip.trimStart; el.ontimeupdate = () => { const c = stateRef.current.clip; if (el.currentTime >= c.trimEnd) { el.pause(); el.currentTime = c.trimStart; setPlaying(false); } }; el.onpause = () => setPlaying(false); el.onplay = () => setPlaying(true); }
      mediaRef.current = el;
    }).catch(() => {});
    return () => { dead = true; mediaRef.current?.pause?.(); };
  }, [clip?.id, clip?.src]);

  useEffect(() => { const v = mediaRef.current; if (clip?.kind === 'video' && v?.pause) { v.pause(); v.currentTime = clip.trimStart; } }, [clip?.trimStart]);
  useEffect(() => { const v = mediaRef.current; if (clip?.kind === 'video' && v?.pause) { v.pause(); v.currentTime = Math.max(clip.trimStart, clip.trimEnd - 0.05); } }, [clip?.trimEnd]);

  const key = layers.map(l => `${l.id}:${l.src || ''}`).join('|');
  useEffect(() => {
    let dead = false;
    Object.keys(assetsRef.current).forEach(id => { if (!layers.some(l => l.id === id)) { assetsRef.current[id]?.pause?.(); delete assetsRef.current[id]; } });
    layers.filter(l => l.src && !assetsRef.current[l.id]).forEach(l => makeLayerElement(l).then(el => { if (!dead) assetsRef.current[l.id] = el; }).catch(() => {}));
    return () => { dead = true; };
  }, [key]);

  useEffect(() => {
    let raf; const ctx = canvasRef.current.getContext('2d');
    const tick = () => { const s = stateRef.current; drawFrame(ctx, s.size.w, s.size.h, { clip: s.clip, media: mediaRef.current, layers: s.layers, assets: assetsRef.current }); raf = requestAnimationFrame(tick); };
    tick(); return () => cancelAnimationFrame(raf);
  }, []);

  const point = e => { const r = canvasRef.current.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };
  const down = e => {
    const p = point(e), ctx = canvasRef.current.getContext('2d'), { size: sz } = stateRef.current;
    const hit = [...layers].reverse().find(l => { const b = layerBounds(ctx, sz.w, sz.h, l, assetsRef.current[l.id]); return p.x * sz.w >= b.x && p.x * sz.w <= b.x + b.w && p.y * sz.h >= b.y && p.y * sz.h <= b.y + b.h; });
    if (hit) { onSelectLayer(hit.id); dragging.current = hit.id; e.currentTarget.setPointerCapture(e.pointerId); }
  };
  const move = e => { if (dragging.current) onMoveLayer(dragging.current, point(e)); };
  const toggle = () => { const v = mediaRef.current; if (!v?.play) return; if (v.paused) { if (v.currentTime >= clip.trimEnd - 0.05) v.currentTime = clip.trimStart; v.play(); } else v.pause(); };

  return <div className="space-y-2">
    <div className="rounded-2xl bg-card border border-border p-2 flex items-center justify-center" style={{ minHeight: 220 }}>
      <canvas ref={canvasRef} width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={() => { dragging.current = false; }}
        className="max-h-[60vh] max-w-full rounded-lg touch-none" style={{ aspectRatio: `${size.w} / ${size.h}`, width: size.w >= size.h ? '100%' : 'auto', height: size.w >= size.h ? 'auto' : '60vh' }} />
    </div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {clip?.kind === 'video' ? <button type="button" onClick={toggle} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-foreground">{playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}{playing ? 'Pause' : 'Play clip'}</button> : <span className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />{clip ? 'Image clip' : 'Add media to start'}</span>}
      <span>{size.w}×{size.h} · drag layers on the preview to move them</span>
    </div>
  </div>;
}