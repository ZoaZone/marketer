import { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { uploadFile } from "@/utils/aiClient";
import DubAction from "@/components/media-library/DubAction";

const SLOTS = [["voiceover_url", "Voice-over"], ["music_url", "Music"], ["dubbing_url", "Dubbing"]];

// Separate audio files kept with a library item, for later editing or reference.
export default function CompanionFiles({ asset }) {
  const qc = useQueryClient();
  const [urls, setUrls] = useState(() => Object.fromEntries(SLOTS.map(([f]) => [f, asset[f] || ""])));
  const [busy, setBusy] = useState(""), [error, setError] = useState("");

  const save = async (field, url) => {
    await base44.entities.ContentAsset.update(asset.id, { [field]: url });
    setUrls(prev => ({ ...prev, [field]: url }));
    qc.invalidateQueries(["media_library"]);
  };
  const upload = async (field, file) => {
    if (!file) return;
    setBusy(field); setError("");
    try {
      if (!file.type.startsWith("audio/") || file.size > 50 * 1024 * 1024) throw new Error("Choose an audio file under 50 MB.");
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed.");
      await save(field, url);
    } catch (e) { setError(e.message || "Upload failed."); }
    setBusy("");
  };

  if (asset.type !== "video" && asset.type !== "image") return null;
  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      <p className="text-xs font-semibold text-foreground">Separate files for this item</p>
      {SLOTS.map(([field, label]) => (
        <div key={field} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
          {urls[field] ? (
            <>
              <audio src={urls[field]} controls className="h-8 flex-1 min-w-0" />
              <a href={urls[field]} download className="text-xs text-fuchsia-400">Save</a>
              <button type="button" aria-label={`Remove ${label}`} onClick={() => save(field, "")}><X className="w-4 h-4" /></button>
            </>
          ) : (
            <label className="flex flex-1 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground">
              {busy === field ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Add {label.toLowerCase()} file
              <input type="file" accept="audio/*" className="hidden" onChange={e => { upload(field, e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )}
        </div>
      ))}
      {asset.type === "video" && asset.file_url && <DubAction sourceUrl={asset.voiceover_url || asset.file_url} onDubbed={url => save("dubbing_url", url)} />}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[11px] text-muted-foreground">Uploaded files are stored publicly — anyone with the link can open them.</p>
    </div>
  );
}