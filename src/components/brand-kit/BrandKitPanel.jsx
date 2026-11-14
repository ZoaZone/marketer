import { Loader2, Paperclip, X, Palette, Film } from "lucide-react";
import { Link } from "react-router-dom";
import LibraryPickButton from "@/components/media-editor/LibraryPickButton";

/** Brand + reference media section shared by Quick Video, Quick Create and Movie Maker. */
export default function BrandKitPanel({ kit, disabled }) {
  const { brand } = kit;
  const swatches = brand ? [brand.primary_color, brand.secondary_color, brand.accent_color].filter(Boolean) : [];
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5" /> Brand &amp; reference media
        </label>
        <select value={kit.brandId} onChange={e => kit.setBrandId(e.target.value)} disabled={disabled}
          className="rounded-lg border border-border bg-background p-1.5 text-xs max-w-[220px]">
          <option value="">{kit.brands.length ? "Auto (my first brand)" : "No brand yet"}</option>
          {kit.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          <option value="none">Don't use a brand</option>
        </select>
      </div>

      {brand ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {kit.logo && <img src={kit.logo} alt="" className="w-9 h-9 rounded-md object-contain bg-white/5 border border-border" />}
          <div className="min-w-0">
            <p className="text-foreground font-semibold truncate">{brand.name}</p>
            <p className="truncate">{[brand.brand_voice, brand.target_audience].filter(Boolean).join(" · ") || "Brand colors, voice and logo are applied automatically."}</p>
          </div>
          <div className="flex gap-1 ml-auto">{swatches.map((c, i) => <span key={i} className="w-4 h-4 rounded-full border border-border" style={{ background: c }} />)}</div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {kit.brandId === "none" ? "No brand will be applied." : <>Create a brand once in <Link to="/brands" className="text-fuchsia-400 hover:underline">Brands</Link> and its logo, colors and voice are used automatically here.</>}
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {kit.refs.map((r, i) => (
          <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border group bg-muted flex items-center justify-center" title={r.name}>
            {r.type === "video" ? <Film className="w-5 h-5 text-muted-foreground" /> : <img src={r.url} alt={r.name} className="w-full h-full object-cover" />}
            <button type="button" onClick={() => kit.removeRef(i)} aria-label="Remove reference"
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <label className="h-14 px-3 rounded-lg border border-dashed border-border flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-muted/20">
          {kit.uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />} Add pics / logos / video
          <input type="file" accept="image/*,video/*" multiple className="hidden" disabled={kit.uploading || disabled}
            onChange={e => { kit.addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <LibraryPickButton kinds={["image", "video"]} disabled={disabled} label="From Media Library" onPick={kit.addLibrary}
          className="h-14 px-3 rounded-lg border border-dashed border-border flex items-center gap-1.5 text-xs text-muted-foreground hover:bg-muted/20 disabled:opacity-50" />
      </div>
      {kit.error && <p role="alert" className="text-xs text-destructive">{kit.error}</p>}
      <p className="text-[11px] text-muted-foreground">Saved on this device and reused automatically in Quick Video, Quick Create and Movie Maker.</p>
    </div>
  );
}