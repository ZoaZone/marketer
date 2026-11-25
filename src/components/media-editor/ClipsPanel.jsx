import { useRef, useState } from 'react';
import { Upload, FolderOpen, ChevronUp, ChevronDown, Trash2, Scissors, Plus, Wand2, Loader2 } from 'lucide-react';
import { FILTERS, clipLength, fmtTime } from '@/components/media-editor/editorModel';
import { btn, Slider, Chip } from '@/components/media-editor/ui';
import { generateSceneVideo, uploadFile } from '@/utils/lane2';

// Turns a still-image clip into a real moving clip: the image becomes the
// opening frame for an AI-generated video (Base44 video — open to every
// plan, free trial included, the same generation Quick Create and Quick
// Video use). clip.src is always a local blob: URL (see importMedia.js), so
// it has to be re-uploaded to get a persistent https URL the render backend
// can actually fetch.
async function animateImageClip(clip, motionPrompt, onProgress) {
  const res = await fetch(clip.src);
  const blob = await res.blob();
  const file = new File([blob], clip.name || 'photo.jpg', { type: blob.type || 'image/jpeg' });
  const imageUrl = await uploadFile(file);
  if (!imageUrl) throw new Error('Could not prepare the photo for animation.');
  const aspect = (clip.w || 1) >= (clip.h || 1) ? '16:9' : '9:16';
  const prompt = `${motionPrompt?.trim() || 'Subtle, natural motion — gentle camera drift, realistic movement of anything alive in the frame.'} Keep the subject, framing, lighting and colors identical to the reference image.`;
  const url = await generateSceneVideo({ prompt, imageUrl, durationSeconds: 5, aspectRatio: aspect, onProgress });
  if (!url) throw new Error('No video was produced. Please try again.');
  return url;
}

function ClipSettings({ clip, update, run, busy }) {
  const [motionPrompt, setMotionPrompt] = useState('');
  const [animating, setAnimating] = useState(false);
  const [progressText, setProgressText] = useState('');

  const animate = () => run(async () => {
    setAnimating(true); setProgressText('starting…');
    try {
      const url = await animateImageClip(clip, motionPrompt, ({ status }) => setProgressText(status));
      update({ kind: 'video', src: url, trimStart: 0, trimEnd: 5, duration: 5 });
    } finally { setAnimating(false); setProgressText(''); }
  });

  return <div className="space-y-3 rounded-xl border border-border bg-card p-3">
    <p className="text-xs font-semibold text-foreground truncate">Editing: {clip.name}</p>
    {clip.kind === 'video'
      ? <>
        <Slider label="Trim start" value={clip.trimStart} min={0} max={Math.max(0, clip.trimEnd - 0.2)} step={0.1} suffix="s" onChange={v => update({ trimStart: v })} />
        <Slider label="Trim end" value={clip.trimEnd} min={clip.trimStart + 0.2} max={clip.duration} step={0.1} suffix="s" onChange={v => update({ trimEnd: v })} />
      </>
      : <>
        <Slider label="Show for" value={clip.duration} min={1} max={30} step={0.5} suffix="s" onChange={v => update({ duration: v })} />
        <div className="space-y-1.5 rounded-lg border border-dashed border-fuchsia-500/30 p-2.5">
          <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-fuchsia-400" />Photo to video</p>
          <p className="text-[10px] text-muted-foreground">Turn this still into a real 5-second AI video clip. Uses AI video credits (free trial included) and takes 1-3 minutes.</p>
          <input value={motionPrompt} onChange={e => setMotionPrompt(e.target.value)} placeholder="Optional: describe the motion, e.g. gentle zoom, waves moving"
            className="w-full rounded-lg border border-input bg-background p-2 text-xs" />
          <button type="button" className={btn} disabled={busy || animating} onClick={animate}>
            {animating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Animating{progressText ? ` — ${progressText}` : '…'}</> : <><Wand2 className="w-3.5 h-3.5" />Animate with AI</>}
          </button>
        </div>
      </>}
    <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground">Crop &amp; framing</p>
      <div className="flex gap-2"><Chip active={clip.fit === 'cover'} onClick={() => update({ fit: 'cover' })}>Fill frame</Chip><Chip active={clip.fit === 'contain'} onClick={() => update({ fit: 'contain' })}>Fit inside</Chip></div></div>
    <Slider label="Zoom" value={clip.zoom} min={1} max={3} step={0.05} suffix="×" onChange={v => update({ zoom: v })} />
    <Slider label="Move left / right" value={clip.panX} min={0} max={1} step={0.01} onChange={v => update({ panX: v })} />
    <Slider label="Move up / down" value={clip.panY} min={0} max={1} step={0.01} onChange={v => update({ panY: v })} />
    <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground">Look</p><div className="flex flex-wrap gap-2">{Object.entries(FILTERS).map(([id, f]) => <Chip key={id} active={clip.filter === id} onClick={() => update({ filter: id })}>{f.label}</Chip>)}</div></div>
  </div>;
}

export default function ClipsPanel({ p, openLibrary }) {
  const input = useRef(null);
  const insertInput = useRef(null);
  const [insertAt, setInsertAt] = useState(null);
  const sel = p.clips.find(c => c.id === p.selClipId);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={btn} disabled={p.busy} onClick={() => input.current?.click()}><Upload className="w-3.5 h-3.5" />Add files</button>
      <button type="button" className={btn} disabled={p.busy} onClick={() => openLibrary()}><FolderOpen className="w-3.5 h-3.5" />From Media Library</button>
      <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => { p.addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={insertInput} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => { p.addFiles(e.target.files, insertAt); e.target.value = ''; setInsertAt(null); }} />
    </div>
    <p className="text-[11px] text-muted-foreground">Add several photos and videos; they play one after another in this order (up to 20). Use "Insert" on any clip to add more media right after it, or the scissors to split a video into two independently-editable pieces.</p>
    {p.clips.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">No media yet. Add files or pick from your library.</p>}
    <div className="space-y-2">{p.clips.map((c, i) => <div key={c.id}>
      <div onClick={() => p.setSelClipId(c.id)} className={`flex items-center gap-2 rounded-xl border p-2 cursor-pointer ${c.id === p.selClipId ? 'border-fuchsia-500 bg-fuchsia-500/5' : 'border-border bg-card'}`}>
        <div className="w-14 h-10 rounded-lg overflow-hidden bg-black shrink-0">{c.kind === 'image' ? <img src={c.src} alt="" className="w-full h-full object-cover" /> : <video src={c.src} className="w-full h-full object-cover" muted />}</div>
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground truncate">{i + 1}. {c.name}</p><p className="text-[10px] text-muted-foreground">{c.kind} · {fmtTime(clipLength(c))}</p></div>
        {c.kind === 'video' && (c.trimEnd - c.trimStart) > 0.6 && (
          <button type="button" aria-label="Split clip" title="Split into two clips" onClick={e => { e.stopPropagation(); p.splitClip(c.id); }}><Scissors className="w-4 h-4" /></button>
        )}
        <button type="button" aria-label="Move up" disabled={i === 0} onClick={e => { e.stopPropagation(); p.moveClip(c.id, -1); }}><ChevronUp className="w-4 h-4" /></button>
        <button type="button" aria-label="Move down" disabled={i === p.clips.length - 1} onClick={e => { e.stopPropagation(); p.moveClip(c.id, 1); }}><ChevronDown className="w-4 h-4" /></button>
        <button type="button" aria-label="Remove clip" onClick={e => { e.stopPropagation(); p.removeClip(c.id); }}><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
      <div className="flex gap-3 pl-2 mt-1">
        <button type="button" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-fuchsia-400" onClick={() => { setInsertAt(i + 1); insertInput.current?.click(); }}><Plus className="w-3 h-3" />Insert file here</button>
        <button type="button" className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-fuchsia-400" onClick={() => openLibrary(i + 1)}><FolderOpen className="w-3 h-3" />Insert from library</button>
      </div>
    </div>)}</div>
    {sel && <ClipSettings clip={sel} update={patch => p.updateClip(sel.id, patch)} run={p.run} busy={p.busy} />}
  </div>;
}
