import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { generateImage, uploadFile } from '@/utils/aiClient';
import { fetchBlobUrl } from '@/components/media-editor/importMedia';
import { btn, Chip } from '@/components/media-editor/ui';

const STYLES = [
  ['Cinematic', 'cinematic movie still, dramatic lighting, shallow depth of field, film grain'],
  ['Neon glow', 'neon lights, synthwave aesthetic, vibrant colors, dark background, glowing'],
  ['Vintage film', 'vintage film photo, faded colors, light leak, retro grain, 1970s aesthetic'],
  ['Minimalist', 'minimalist clean design, white space, simple composition, modern'],
  ['Dramatic B&W', 'dramatic black and white photography, high contrast, deep shadows'],
  ['Anime', 'anime illustration style, vibrant colors, detailed background'],
  ['Oil painting', 'oil painting style, rich colors, visible brush strokes, classical art'],
  ['Watercolor', 'soft watercolor painting, gentle washes of color, artistic, dreamy'],
];

export default function AiRestyle({ p, sel }) {
  const [style, setStyle] = useState(null), [custom, setCustom] = useState('');
  const isImage = sel?.kind === 'image';
  const apply = () => p.run(async () => {
    const prompt = `Edit this image: ${[style, custom].filter(Boolean).join(' ')}`;
    const blob = await (await fetch(sel.src)).blob();
    const url = await uploadFile(new File([blob], 'clip.png', { type: blob.type || 'image/png' }));
    const result = await generateImage({ prompt, referenceImageUrls: [url] });
    if (!result) throw new Error('AI restyle failed. Try a different style.');
    p.updateClip(sel.id, { src: await fetchBlobUrl(result, 'image') });
  });
  return <div className="space-y-2 rounded-xl border border-border bg-card p-3">
    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-fuchsia-400" />AI restyle (photos)</p>
    <p className="text-[11px] text-muted-foreground">{isImage ? 'Transforms the selected photo with AI. This uses AI credits.' : 'Select a photo clip in the Clips tab to restyle it.'}</p>
    <div className="flex flex-wrap gap-2">{STYLES.map(([label, prompt]) => <Chip key={label} active={style === prompt} onClick={() => setStyle(style === prompt ? null : prompt)}>{label}</Chip>)}</div>
    <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Optional: golden hour, warm tones…" className="w-full rounded-lg border border-input bg-background p-2 text-sm text-foreground" />
    <button type="button" className={btn} disabled={p.busy || !isImage || (!style && !custom.trim())} onClick={apply}><Wand2 className="w-3.5 h-3.5" />Apply AI style</button>
  </div>;
}