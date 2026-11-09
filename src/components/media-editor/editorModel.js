export const SIZE_PRESETS = [
  { id: '16:9', label: '16:9 Landscape', w: 1280, h: 720 },
  { id: '9:16', label: '9:16 Reels / Shorts', w: 720, h: 1280 },
  { id: '1:1', label: '1:1 Square', w: 1080, h: 1080 },
  { id: '4:5', label: '4:5 Portrait', w: 1080, h: 1350 },
];

export const FILTERS = {
  none: { label: 'Original', css: 'none' },
  vivid: { label: 'Vivid', css: 'saturate(1.6) contrast(1.1)' },
  warm: { label: 'Warm', css: 'sepia(0.35) saturate(1.3) brightness(1.05)' },
  cool: { label: 'Cool', css: 'saturate(1.1) hue-rotate(-15deg) brightness(1.02)' },
  fade: { label: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
  bw: { label: 'B&W', css: 'grayscale(1) contrast(1.1)' },
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clipLength = c => (c.kind === 'image' ? c.duration : Math.max(0.1, c.trimEnd - c.trimStart));
export const totalLength = clips => clips.reduce((sum, c) => sum + clipLength(c), 0);
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const newLayer = (kind, over = {}) => ({
  id: uid(), kind, x: 0.5, y: 0.85, w: 0.8, h: 0.12, text: '', color: kind === 'box' ? '#000000' : '#ffffff',
  bg: true, size: 5, opacity: 1, ...over,
});

export const LAYER_LABELS = { text: 'Text', logo: 'Logo', pip: 'Picture-in-picture', box: 'Cover box', blur: 'Blur patch' };