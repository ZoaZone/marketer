import { useState } from "react";

export const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["ta", "Tamil"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"],
  ["bn", "Bengali"], ["mr", "Marathi"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["es", "Spanish"], ["fr", "French"],
  ["de", "German"], ["pt", "Portuguese"], ["ar", "Arabic"], ["ja", "Japanese"], ["zh", "Chinese"],
];

export const VOICES = [
  ["river", "River — calm, neutral"], ["honey", "Honey — warm, soft"], ["sunny", "Sunny — bright, upbeat"],
  ["storm", "Storm — formal, authoritative"], ["spark", "Spark — energetic, quick"],
];

/** Persisted language + voice choice shared by Quick Video and Quick Create. */
export function useVoiceOptions() {
  const [opts, setOpts] = useState(() => {
    try { return { lang: "en", voice: "river", ...JSON.parse(localStorage.getItem("ds_voice_opts") || "{}") }; } catch { return { lang: "en", voice: "river" }; }
  });
  const set = (patch) => setOpts(p => {
    const n = { ...p, ...patch };
    try { localStorage.setItem("ds_voice_opts", JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  return [opts, set];
}

export default function VoiceOptions({ opts, onChange, disabled }) {
  const sel = "mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs";
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px] text-muted-foreground">Voice-over language
        <select className={sel} value={opts.lang} disabled={disabled} onChange={e => onChange({ lang: e.target.value })}>
          {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-muted-foreground">Voice
        <select className={sel} value={opts.voice} disabled={disabled} onChange={e => onChange({ voice: e.target.value })}>
          {VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    </div>
  );
}