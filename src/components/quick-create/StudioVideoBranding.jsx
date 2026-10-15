import { Upload, Loader2, X } from 'lucide-react';
import { MUSIC_PRESETS } from '@/components/quick-create/musicPresets';

export default function StudioVideoBranding({ showCharacter = true, extras = [], removeExtra, music, uploadMusic, musicPreset = '', setMusicPreset, logo, character, text, setText, upload, uploading, disabled, checking, proofread, suggestion, applySuggestion, clear }) {
  return <div className="space-y-4 border-t border-border pt-4">
    <div className="grid grid-cols-2 gap-3">{[['logo', 'Logo', logo], ['character', 'Reference character', character]].filter(([kind]) => showCharacter || kind === 'logo').map(([kind, label, asset]) => <div key={kind} className="space-y-2">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      {asset && <div className="flex items-center gap-2"><img src={asset.url} alt={label} className="h-14 w-14 rounded-lg bg-muted object-contain" /><button type="button" disabled={disabled} onClick={() => clear(kind)} aria-label={`Remove ${label}`}><X className="h-4 w-4" /></button></div>}
      <label className={`flex items-center gap-1.5 rounded-lg border border-border p-2 text-xs text-foreground ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        {uploading === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{asset ? 'Replace image' : 'Upload image'}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled} onChange={e => { upload(kind, e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </div>)}</div>
    <p className="text-xs text-muted-foreground">Logo stays intact in the top-right corner. The reference guides the character’s appearance; an exact likeness is not guaranteed. Upload only images you have permission to use.</p>
    {showCharacter && <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Other characters &amp; scene references (up to 3)</p>
      <div className="flex flex-wrap gap-2">{extras.map((asset, i) => <div key={asset.fileUri} className="relative"><img src={asset.url} alt={`Reference ${i + 2}`} className="h-14 w-14 rounded-lg bg-muted object-contain" /><button type="button" disabled={disabled} onClick={() => removeExtra(i)} aria-label={`Remove reference ${i + 2}`} className="absolute -right-1 -top-1 rounded-full bg-background border border-border"><X className="h-3.5 w-3.5" /></button></div>)}</div>
      {extras.length < 3 && <label className={`flex items-center gap-1.5 rounded-lg border border-border p-2 text-xs text-foreground ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        {uploading === 'extra' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Add another image
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled} onChange={e => { upload('extra', e.target.files?.[0]); e.target.value = ''; }} />
      </label>}
      <p className="text-xs text-muted-foreground">Add other people, pets, products or places that should appear. Describe what each does in your prompt. Upload only images you have permission to use.</p>
    </div>}
    {showCharacter && <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Background music</p>
      <div className="flex flex-wrap gap-2">{[{ id: '', label: 'None' }, ...MUSIC_PRESETS].map(p => <button key={p.id || 'none'} type="button" disabled={disabled} aria-pressed={musicPreset === p.id} onClick={() => setMusicPreset(p.id)} title={p.hint} className={`rounded-lg border px-3 py-1.5 text-xs ${musicPreset === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>{p.label}</button>)}</div>
      {music && <div className="flex items-center gap-2"><audio src={music.url} controls className="h-8 flex-1 min-w-0" /><button type="button" disabled={disabled} onClick={() => clear('music')} aria-label="Remove music"><X className="h-4 w-4" /></button></div>}
      <label className={`flex items-center gap-1.5 rounded-lg border border-border p-2 text-xs text-foreground ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        {uploading === 'music' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{music ? `Replace track (${music.name.slice(0, 20)})` : 'Upload a music track'}
        <input type="file" accept="audio/*" className="hidden" disabled={disabled} onChange={e => { uploadMusic(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <p className="text-xs text-muted-foreground">Choose a library style or upload your own (your upload wins). Mixed in when you finish the video after generation, under any generated sound. Upload only music you have the rights to use.</p>
    </div>}
    <div className="space-y-2">
      <label htmlFor="studio-overlay-text" className="text-xs font-semibold text-foreground">On-screen text / graphic</label>
      <textarea id="studio-overlay-text" value={text} onChange={e => setText(e.target.value)} spellCheck maxLength={160} rows={3} disabled={disabled} placeholder="Type the exact words to show…" className="w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground" />
      <p className="text-xs text-muted-foreground">{text.length}/160 characters. Text is drawn as a sharp lower-third graphic, not generated by AI. Spelling is checked automatically before it is applied.</p>
      <button type="button" onClick={proofread} disabled={disabled || !text.trim()} className="rounded-lg border border-border px-3 py-2 text-xs text-foreground disabled:opacity-50">{checking ? 'Checking spelling…' : 'Review spelling with AI'}</button>
      {suggestion !== null && <div className="rounded-lg bg-muted p-3 text-sm space-y-2"><p className="whitespace-pre-wrap">{suggestion}</p><button type="button" disabled={disabled || suggestion.length > 160} onClick={applySuggestion} className="text-xs font-semibold text-primary">Use this reviewed text</button><p className="text-xs text-muted-foreground">Review names and details before applying; your original text is unchanged until you accept.</p></div>}
    </div>
  </div>;
}