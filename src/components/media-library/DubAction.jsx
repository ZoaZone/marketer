import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { dubAudioFile } from "@/utils/lane2";

const LANGS = [["es", "Spanish"], ["fr", "French"], ["de", "German"], ["hi", "Hindi"], ["pt", "Portuguese"], ["ja", "Japanese"], ["ar", "Arabic"], ["en", "English"]];

// Dubs the item's audio into another language and hands back the file URL.
export default function DubAction({ sourceUrl, onDubbed }) {
  const [lang, setLang] = useState("es");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async () => {
    setBusy(true); setError("");
    try {
      const url = await dubAudioFile({ sourceUrl, targetLang: lang });
      if (!url) throw new Error("Dubbing did not produce a result. Please try again.");
      await onDubbed(url);
    } catch (e) { setError(e?.message || "Dubbing failed."); }
    setBusy(false);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <select value={lang} onChange={e => setLang(e.target.value)} disabled={busy} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground">
          {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <button type="button" onClick={run} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}{busy ? "Dubbing… this can take several minutes" : "Dub and save to this item"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[11px] text-muted-foreground">Dubbing uses AI credits. Keep this window open until it finishes.</p>
    </div>
  );
}