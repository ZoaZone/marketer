import { FILTERS } from '@/components/media-editor/editorModel';

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (line && ctx.measureText(line + word).width > maxWidth) { lines.push(line.trimEnd()); line = word.trimStart(); }
      else line += word;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function drawText(ctx, W, H, l) {
  const size = Math.max(10, Math.round((l.size / 100) * W));
  ctx.font = `700 ${size}px Arial, sans-serif`;
  const lines = wrapLines(ctx, l.text, l.w * W);
  const lh = size * 1.3, pad = size * 0.5, boxH = lines.length * lh;
  const widest = Math.max(...lines.map(t => ctx.measureText(t).width));
  const cx = l.x * W, top = l.y * H - boxH / 2;
  if (l.bg) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(cx - widest / 2 - pad, top - pad / 2, widest + pad * 2, boxH + pad); }
  ctx.fillStyle = l.color; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines.forEach((t, i) => ctx.fillText(t, cx, top + i * lh + (lh - size) / 2));
}

export function layerBounds(ctx, W, H, l, el) {
  if (l.kind === 'logo' || l.kind === 'pip') {
    const ew = el?.videoWidth || el?.naturalWidth || 1, eh = el?.videoHeight || el?.naturalHeight || 1;
    const w = l.w * W; return { x: l.x * W - w / 2, y: l.y * H - (w * eh / ew) / 2, w, h: w * eh / ew };
  }
  if (l.kind === 'text') {
    const size = Math.max(10, Math.round((l.size / 100) * W)); ctx.font = `700 ${size}px Arial, sans-serif`;
    const n = l.text ? wrapLines(ctx, l.text, l.w * W).length : 1;
    return { x: l.x * W - (l.w * W) / 2, y: l.y * H - (n * size * 1.3) / 2, w: l.w * W, h: n * size * 1.3 };
  }
  return { x: (l.x - l.w / 2) * W, y: (l.y - l.h / 2) * H, w: l.w * W, h: l.h * H };
}

export function drawFrame(ctx, W, H, { clip, media, layers, assets }) {
  ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const mw = media?.videoWidth || media?.naturalWidth, mh = media?.videoHeight || media?.naturalHeight;
  if (clip && mw) {
    const s = (clip.fit === 'contain' ? Math.min : Math.max)(W / mw, H / mh) * clip.zoom;
    const dw = mw * s, dh = mh * s;
    const dx = dw >= W ? (W - dw) * clip.panX : (W - dw) / 2, dy = dh >= H ? (H - dh) * clip.panY : (H - dh) / 2;
    ctx.filter = FILTERS[clip.filter]?.css || 'none';
    ctx.drawImage(media, dx, dy, dw, dh);
    ctx.filter = 'none';
  }
  for (const l of layers) {
    ctx.globalAlpha = l.opacity;
    const el = assets[l.id];
    if (l.kind === 'text' && l.text.trim()) drawText(ctx, W, H, l);
    else if ((l.kind === 'logo' || l.kind === 'pip') && el) {
      const b = layerBounds(ctx, W, H, l, el);
      ctx.drawImage(el, b.x, b.y, b.w, b.h);
      if (l.kind === 'pip') { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, W * 0.004); ctx.strokeRect(b.x, b.y, b.w, b.h); }
    } else if (l.kind === 'box') {
      const b = layerBounds(ctx, W, H, l); ctx.fillStyle = l.color; ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (l.kind === 'blur') {
      const b = layerBounds(ctx, W, H, l);
      ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      ctx.filter = `blur(${Math.round(W * 0.02)}px)`; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}