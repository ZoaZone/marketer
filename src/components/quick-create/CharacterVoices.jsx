import { VOICES } from "@/components/voice/VoiceOptions";

/** One voice picker per speaker found in the dialogue. */
export default function CharacterVoices({ speakers, onChange, disabled }) {
  if (!speakers.length) return null;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Character voices</label>
      <div className="grid sm:grid-cols-2 gap-2">
        {speakers.map(s => (
          <label key={s.key} className="flex items-center gap-2 text-xs text-foreground">
            <span className="w-24 shrink-0 truncate font-semibold">{s.label}</span>
            <select value={s.voice} disabled={disabled} onChange={e => onChange(s.key, e.target.value)}
              className="flex-1 min-w-0 rounded-lg border border-border bg-background p-1.5 text-xs">
              {VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Each character gets a different voice automatically. Change a voice and that character's lines need speaking again.</p>
    </div>
  );
}