import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function StudioReviewPanel({ prompt, text, referenceCount, disabled, onApplyPrompt, onApplyText }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [review, setReview] = useState(null);
  const run = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await base44.functions.invoke('generateBase44Studio', { action: 'review', prompt, overlayText: text, referenceImageUrls: new Array(referenceCount).fill('') });
      if (!data?.correctedPrompt) throw new Error(data?.error || 'No review was returned.');
      setReview(data);
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };
  const changedPrompt = review && review.correctedPrompt.trim() !== prompt.trim();
  const changedText = review && review.correctedText && review.correctedText.trim() !== text.trim();
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-semibold text-foreground flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />AI review</h3>
    <p className="text-xs text-muted-foreground">Check your scene description and on-screen text for spelling, corrections and ideas for a better result. Nothing changes until you accept it, then generate again to see it.</p>
    <button type="button" onClick={run} disabled={busy || disabled || !prompt.trim()} className="w-full rounded-xl border border-primary bg-primary/10 p-3 text-sm font-semibold text-primary disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Reviewing…' : review ? 'Review again' : 'Review with AI'}</button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {review && <div className="space-y-3 text-sm">
      {changedPrompt ? <div className="rounded-lg bg-muted p-3 space-y-2"><p className="text-xs font-semibold text-foreground">Improved scene description</p><p className="whitespace-pre-wrap">{review.correctedPrompt}</p><button type="button" onClick={() => { onApplyPrompt(review.correctedPrompt); setReview(r => ({ ...r, correctedPrompt: prompt })); }} className="text-xs font-semibold text-primary">Use this description</button></div> : <p className="text-xs text-muted-foreground">Scene description: no corrections needed.</p>}
      {changedText && <div className="rounded-lg bg-muted p-3 space-y-2"><p className="text-xs font-semibold text-foreground">Corrected on-screen text</p><p className="whitespace-pre-wrap">{review.correctedText}</p><button type="button" onClick={() => { onApplyText(review.correctedText); setReview(r => ({ ...r, correctedText: '' })); }} className="text-xs font-semibold text-primary">Use this text</button></div>}
      {review.tips.length > 0 && <div className="space-y-1"><p className="text-xs font-semibold text-foreground">Suggestions</p><ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">{review.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul></div>}
    </div>}
  </div>;
}