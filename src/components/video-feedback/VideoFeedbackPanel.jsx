import { useState } from 'react';
import { Sparkles, Loader2, Paperclip, X, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    improvedPrompt: { type: 'string' },
    improvedCaptions: { type: 'string' },
    improvedScenes: {
      type: 'array',
      items: { type: 'object', properties: { text: { type: 'string' }, voiceover: { type: 'string' }, caption: { type: 'string' } } },
    },
    spellingFixes: { type: 'array', items: { type: 'object', properties: { original: { type: 'string' }, fixed: { type: 'string' } } } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Lets the user review a generated video and tell the AI what to change.
 * Props:
 *  prompt, captions: current overall prompt / captions (strings, optional)
 *  scenes: [{ text, voiceover, caption }] (optional)
 *  applyLabel: label of the apply button
 *  onApply(improved): called with { prompt, captions, scenes, feedback, references }
 */
export default function VideoFeedbackPanel({ prompt = '', captions = '', scenes = [], applyLabel = 'Apply & regenerate', onApply, disabled }) {
  const [feedback, setFeedback] = useState('');
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState([]); // [{ name, signedUrl }]
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);

  const attach = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
      setFiles(f => [...f, { name: file.name, signedUrl: signed_url }]);
    } catch (err) { setError(err?.message || 'Upload failed.'); }
    setUploading(false);
  };

  const run = async () => {
    setBusy(true); setError(''); setReview(null);
    try {
      const sceneList = scenes.map((s, i) => `Scene ${i + 1}:\n  visual: ${s.text || ''}\n  voice-over/dialogue: ${s.voiceover || ''}\n  caption: ${s.caption || ''}`).join('\n');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a video director and copy editor. A user generated a video and wants it improved.
Overall prompt: """${prompt}"""
Current captions: """${captions}"""
${sceneList ? `Scenes:\n${sceneList}` : ''}
User feedback / interpretation: """${feedback}"""
Reference links or notes: """${links}"""
${files.length ? 'Reference files are attached; use them as media/script references.' : ''}

Do all of this:
1. Rewrite the overall prompt so it follows the user's feedback (keep it concrete and visual). If there was no prompt, return an empty string.
2. Fix spelling/grammar mistakes in the prompt, captions, voice-over and scenes, and list each fix in spellingFixes.
3. Rewrite captions (timestamped lines if the originals were) incorporating the feedback. Empty string if there were none.
4. ${scenes.length ? `Return improvedScenes with EXACTLY ${scenes.length} items in the same order, applying the feedback to visual text, voiceover and caption. Leave a field unchanged if the feedback doesn't affect it.` : 'Return improvedScenes as an empty array.'}
5. Give up to 5 short suggestions (media references to add, voice-over ideas, caption tweaks).
6. summary: one sentence on what changed.
Keep the user's language.`,
        response_json_schema: SCHEMA,
        file_urls: files.length ? files.map(f => f.signedUrl) : undefined,
      });
      setReview(res);
    } catch (err) { setError(err?.message || 'The review failed. Please try again.'); }
    setBusy(false);
  };

  const apply = () => {
    const sc = review.improvedScenes?.length === scenes.length ? review.improvedScenes : [];
    onApply({
      prompt: review.improvedPrompt || prompt,
      captions: review.improvedCaptions || captions,
      scenes: sc,
      feedback,
      references: [links, ...files.map(f => f.name)].filter(Boolean).join('\n'),
    });
    setReview(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm"><Sparkles className="w-4 h-4 text-primary" />Improve this video before saving</h3>
      <p className="text-xs text-muted-foreground">Tell the AI what you want different. It will fix spelling, refine the script, voice-over and captions, and regenerate based on your input.</p>
      <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3}
        placeholder="e.g. Make the opening warmer, add a logo shot at the end, voice-over should mention the 20% offer, fix the caption typos"
        className="w-full rounded-lg border border-border bg-background p-3 text-sm resize-none" />
      <input value={links} onChange={e => setLinks(e.target.value)} placeholder="Media references, links or voice-over text (optional)"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted/20">
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />} Attach reference file
          <input type="file" className="hidden" onChange={attach} disabled={uploading} />
        </label>
        {files.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs">
            {f.name}<button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground">(stored privately)</span>
      </div>
      <button type="button" onClick={run} disabled={busy || disabled || (!feedback.trim() && !links.trim() && !files.length)}
        className="w-full rounded-xl border border-primary bg-primary/10 p-2.5 text-sm font-semibold text-primary disabled:opacity-50 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Reviewing…' : 'Review with AI'}
      </button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {review && (
        <div className="space-y-3 text-sm">
          {review.summary && <p className="text-foreground">{review.summary}</p>}
          {review.improvedPrompt && review.improvedPrompt.trim() !== prompt.trim() && (
            <div className="rounded-lg bg-muted p-3"><p className="text-xs font-semibold mb-1">Improved prompt</p><p className="whitespace-pre-wrap text-xs">{review.improvedPrompt}</p></div>
          )}
          {review.improvedCaptions && review.improvedCaptions.trim() !== captions.trim() && (
            <div className="rounded-lg bg-muted p-3"><p className="text-xs font-semibold mb-1">Improved captions</p><p className="whitespace-pre-wrap text-xs">{review.improvedCaptions}</p></div>
          )}
          {review.spellingFixes?.length > 0 && (
            <div><p className="text-xs font-semibold mb-1">Spelling fixes</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">{review.spellingFixes.map((f, i) => <li key={i}>“{f.original}” → “{f.fixed}”</li>)}</ul></div>
          )}
          {review.suggestions?.length > 0 && (
            <div><p className="text-xs font-semibold mb-1">Suggestions</p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{review.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          )}
          <button type="button" onClick={apply} disabled={disabled}
            className="w-full rounded-xl bg-primary text-primary-foreground p-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" />{applyLabel}
          </button>
        </div>
      )}
    </div>
  );
}