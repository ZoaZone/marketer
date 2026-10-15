import { useState } from 'react';
import { Sparkles, SpellCheck, ScanSearch } from 'lucide-react';
import { btn } from '@/components/media-editor/ui';
import { proofreadText, suggestCopy, scanClipFrame } from '@/components/media-editor/aiTools';
import AiRestyle from '@/components/media-editor/AiRestyle';

const Section = ({ title, hint, children }) => <div className="space-y-2 rounded-xl border border-border bg-card p-3"><p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />{title}</p><p className="text-[11px] text-muted-foreground">{hint}</p>{children}</div>;

export default function AiPanel({ p }) {
  const [status, setStatus] = useState(''), [brief, setBrief] = useState(''), [scan, setScan] = useState(null);
  const sel = p.clips.find(c => c.id === p.selClipId);
  const texts = p.layers.filter(l => l.kind === 'text' && l.text.trim());

  const fixSpelling = () => p.run(async () => {
    setStatus('Checking spelling…'); let changed = 0;
    for (const l of texts) {
      const fixed = await proofreadText(l.text.slice(0, 160));
      if (fixed !== l.text) { p.updateLayer(l.id, { text: fixed }); changed++; }
    }
    setStatus(changed ? `Corrected ${changed} text layer${changed > 1 ? 's' : ''}.` : 'No spelling mistakes found.');
  });
  const writeCopy = () => p.run(async () => {
    setStatus('Writing text…');
    const out = await suggestCopy(brief, p.size);
    if (out.headline) p.addLayer('text', { text: out.headline, y: 0.12, size: 6 });
    if (out.tagline) p.addLayer('text', { text: out.tagline, y: 0.8, size: 4 });
    if (out.cta) p.addLayer('text', { text: out.cta, y: 0.9, size: 4.5, color: '#ffd700' });
    setStatus('Added suggested text. Edit or drag it in the Layers tab.');
  });
  const scanFrame = () => p.run(async () => { setStatus('Scanning the frame…'); setScan(await scanClipFrame(sel, p.size)); setStatus(''); });

  return <div className="space-y-3">
    {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    <Section title="Fix spelling" hint="Checks every text layer for spelling mistakes. Names and brands are kept.">
      <button type="button" className={btn} disabled={p.busy || !texts.length} onClick={fixSpelling}><SpellCheck className="w-3.5 h-3.5" />Fix spelling in my text</button>
    </Section>
    <Section title="Write text for me" hint="Describe your video or offer and AI drafts a headline, tagline and call to action as editable text layers.">
      <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={2} maxLength={800} placeholder="e.g. 20% off pet checkups this week at Vet N Pet Hospital" className="w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground" />
      <button type="button" className={btn} disabled={p.busy || !brief.trim()} onClick={writeCopy}><Sparkles className="w-3.5 h-3.5" />Suggest text</button>
    </Section>
    <Section title="Find broken text in a clip" hint="For Quick Create videos with garbled words or logos. AI looks at the selected clip's middle frame and suggests where to hide or replace it.">
      <button type="button" className={btn} disabled={p.busy || !sel} onClick={scanFrame}><ScanSearch className="w-3.5 h-3.5" />{sel ? 'Scan selected clip' : 'Select a clip first'}</button>
      {scan && <div className="space-y-2 text-xs">
        <p className="text-foreground">{scan.summary || (scan.regions?.length ? 'Possible problems found:' : 'No broken text found in this frame.')}</p>
        {(scan.regions || []).map((r, i) => <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2"><span className="flex-1 min-w-0 truncate text-foreground">{r.label}</span>
          <button type="button" className="text-fuchsia-400 font-semibold" onClick={() => p.addLayer('blur', { x: r.x, y: r.y, w: Math.max(0.1, r.w), h: Math.max(0.05, r.h) })}>Blur</button>
          <button type="button" className="text-fuchsia-400 font-semibold" onClick={() => p.addLayer('box', { x: r.x, y: r.y, w: Math.max(0.1, r.w), h: Math.max(0.05, r.h) })}>Cover</button></div>)}
        {(scan.tips || []).length > 0 && <ul className="list-disc pl-5 text-muted-foreground space-y-1">{scan.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        <p className="text-muted-foreground">Check the preview after adding: the blur or cover applies to every clip, so resize it in Layers if needed.</p>
      </div>}
    </Section>
    <AiRestyle p={p} sel={sel} />
  </div>;
}