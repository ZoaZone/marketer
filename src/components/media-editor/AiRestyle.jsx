import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { generateImage, uploadFile, generateSceneVideo } from '@/utils/aiClient';
import { fetchBlobUrl } from '@/components/media-editor/importMedia';
import CreditNotice from '@/components/media-editor/CreditNotice';
import { btn, Chip } from '@/components/media-editor/ui';

const STYLES = [
  ['Cinematic', 'cinematic movie still, dramatic lighting, shallow depth of field, film grain'],
  ['Neon glow', 'neon lights, synthwave aesthetic, vibrant colors, dark background, glowing'],
  ['Vintage film', 'vintage film photo, faded colors, light leak, retro grain, 1970s aesthetic'],
  ['Modern', 'modern clean contemporary look, crisp sharp detail, bright balanced colors, high-end editorial photography'],
  ['90s', '1990s style photo, disposable film camera look, flash photography, saturated colors, nostalgic 90s fashion and mood'],
  ['Caricature', 'humorous caricature illustration of the people, exaggerated facial features and large head, keep them recognizable, colorful cartoon style'],
  ['Pop art', 'pop art style, bold outlines, halftone dots, bright flat colors'],
  ['Minimalist', 'minimalist clean design, white space, simple composition, modern'],
  ['Dramatic B&W', 'dramatic black and white photography, high contrast, deep shadows'],
  ['Anime', 'anime illustration style, vibrant colors, detailed background'],
  ['Oil painting', 'oil painting style, rich colors, visible brush strokes, classical art'],
  ['Watercolor', 'soft watercolor painting, gentle washes of color, artistic, dreamy'],
];

export default function AiRestyle({ p, sel }) {
  const [style, setStyle] = useState(null), [custom, setCustom] = useState(''), [needCredits, setNeedCredits] = useState(false);
  const isImage = sel?.kind === 'image';
  const apply = () => p.run(async () => {
    const prompt = `Edit this image: ${[style, custom].filter(Boolean).join(' ')}`;
    const blob = await (await fetch(sel.src)).blob();
    const url = await uploadFile(new File([blob], 'clip.png', { type: blob.type || 'image/png' }));
    setNeedCredits(false);
    let result;
    try { result = await generateImage({ prompt, referenceImageUrls: [url] }); }
    catch (e) { if (e.upgradeRequired) { setNeedCredits(true); return; } throw e; }
    if (!result) throw new Error('AI restyle failed. Try a different style.');
    p.updateClip(sel.id, { src: await fetchBlobUrl(result, 'image') });
  });
  const animate = () => p.run(async () => {
    const blob = await (await fetch(sel.src)).blob();
    const imageUrl = await uploadFile(new File([blob], 'photo.png', { type: blob.type || 'image/png' }));
    const url = await generateSceneVideo({ prompt: `${custom.trim() || 'Gentle natural motion'}. Natural, fluid camera movement and realistic motion.`, imageUrl, durationSeconds: 5, aspectRatio: p.size.w >= p.size.h ? '16:9' : '9:16' });
    if (!url) throw new Error('Could not turn this photo into a video.');
    await p.addAssets([{ type: 'video', file_url: url, title: 'Animated photo' }]);
  });
  return <div className="space-y-2 rounded-xl border border-border bg-card p-3">
    {needCredits && <CreditNotice needed />}
    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-fuchsia-400" />AI restyle (photos)</p>
    <p className="text-[11px] text-muted-foreground">{isImage ? 'Transforms the selected photo with AI. This uses AI credits.' : 'Select a photo clip in the Clips tab to restyle it.'}</p>
    <div className="flex flex-wrap gap-2">{STYLES.map(([label, prompt]) => <Chip key={label} active={style === prompt} onClick={() => setStyle(style === prompt ? null : prompt)}>{label}</Chip>)}</div>
    <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Optional: golden hour, warm tones…" className="w-full rounded-lg border border-input bg-background p-2 text-sm text-foreground" />
    <button type="button" className={btn} disabled={p.busy || !isImage || (!style && !custom.trim())} onClick={apply}><Wand2 className="w-3.5 h-3.5" />Apply AI style</button>
    <button type="button" className={btn} disabled={p.busy || !isImage} onClick={animate}><Wand2 className="w-3.5 h-3.5" />Turn photo into video (1–3 min)</button>
  </div>;
}