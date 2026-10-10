export default function StudioEngineSelector({ value, onChange, disabled }) {
  return <div className="rounded-xl border border-border bg-card p-4 space-y-3">
    <p className="text-sm font-semibold text-foreground">Create with Studio</p>
    <div className="grid sm:grid-cols-2 gap-2">
      {[['base44', 'Direct creation', 'Create an image or moving video directly from your prompt, with optional character references, logos and text.'], ['workflow', 'Guided creation', 'Build your video step by step with a script, storyboard, motion and audio.']].map(([id, label, detail]) => <button key={id} type="button" disabled={disabled} aria-pressed={value === id} onClick={() => onChange(id)} className={`text-left rounded-lg border p-3 disabled:opacity-50 ${value === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
        <span className="block text-sm font-semibold text-foreground">{label}</span><span className="block mt-1 text-xs text-muted-foreground">{detail}</span>
      </button>)}
    </div>
  </div>;
}