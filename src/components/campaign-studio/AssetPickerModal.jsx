import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { Search, Loader2, X, CheckCircle2, FileText, Image as ImageIcon, Video } from "lucide-react";

const TYPE_COLORS = {
  image: "bg-purple-500/10 text-purple-400",
  video: "bg-red-500/10 text-red-400",
  script: "bg-blue-500/10 text-blue-400",
  ad_copy: "bg-amber-500/10 text-amber-400",
  email_template: "bg-emerald-500/10 text-emerald-400",
  caption: "bg-pink-500/10 text-pink-400",
  hashtag_set: "bg-fuchsia-500/10 text-fuchsia-400",
  theme: "bg-indigo-500/10 text-indigo-400",
};

function Thumbnail({ asset }) {
  if (asset.type === "image" && asset.file_url) {
    return <div className="aspect-video bg-neutral-900 overflow-hidden"><img src={asset.file_url} alt={asset.title} className="w-full h-full object-cover" /></div>;
  }
  if (asset.type === "video" && asset.file_url) {
    return (
      <div className="aspect-video bg-black overflow-hidden relative">
        <video src={asset.file_url} className="w-full h-full object-cover opacity-80" />
        <div className="absolute inset-0 flex items-center justify-center"><Video className="w-6 h-6 text-white" /></div>
      </div>
    );
  }
  return (
    <div className={`aspect-video flex items-start overflow-hidden px-3 py-2.5 ${TYPE_COLORS[asset.type] || "bg-neutral-900"}`}>
      <p className="text-xs leading-relaxed line-clamp-5 opacity-80">{asset.content || asset.title}</p>
    </div>
  );
}

/**
 * Generic "pick from Media Library" modal. Reuses ContentAsset + the
 * MediaLibrary card layout, filtered by `types` and either single- or
 * multi-select via `multiple`.
 */
export default function AssetPickerModal({ open, onClose, types, multiple = true, title = "Select from Library", onSelect }) {
  const { user } = useOutletContext() || {};
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["media_library", user?.email],
    queryFn: () => base44.entities.ContentAsset.filter(mine(user), "-created_date", 200),
    enabled: open && !!user?.email,
  });

  if (!open) return null;

  const filtered = assets.filter(a => {
    if (types?.length && !types.includes(a.type)) return false;
    const q = search.toLowerCase();
    return !q || (a.title || "").toLowerCase().includes(q) || (a.content || "").toLowerCase().includes(q);
  });

  const toggle = (asset) => {
    if (multiple) {
      setSelected(s => s.some(a => a.id === asset.id) ? s.filter(a => a.id !== asset.id) : [...s, asset]);
    } else {
      onSelect([asset]);
      onClose();
    }
  };

  const confirm = () => {
    if (!selected.length) return;
    onSelect(selected);
    setSelected([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <h3 className="font-bold text-white text-lg">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 border-b border-neutral-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search library…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-fuchsia-500/70" />
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-neutral-500" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              {types?.includes("image") ? <ImageIcon className="w-10 h-10 text-neutral-700 mb-3" /> : <FileText className="w-10 h-10 text-neutral-700 mb-3" />}
              <p className="text-neutral-300 font-medium">Nothing here yet</p>
              <p className="text-xs text-neutral-500 mt-1">Generate or upload assets, then they'll show up here for reuse.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(a => {
                const isSelected = selected.some(s => s.id === a.id);
                return (
                  <button key={a.id} onClick={() => toggle(a)}
                    className={`text-left rounded-2xl overflow-hidden border transition-all relative ${isSelected ? "border-fuchsia-500 ring-2 ring-fuchsia-500/40" : "border-neutral-800 hover:border-neutral-700"}`}>
                    <Thumbnail asset={a} />
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-fuchsia-500 rounded-full p-1"><CheckCircle2 className="w-3.5 h-3.5 text-white" /></div>
                    )}
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-white truncate">{a.title || "Untitled"}</p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">{a.type?.replace(/_/g, " ")}{a.platform ? ` · ${a.platform}` : ""}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {multiple && (
          <div className="flex items-center justify-between p-4 border-t border-neutral-800">
            <p className="text-xs text-neutral-500">{selected.length} selected</p>
            <button onClick={confirm} disabled={!selected.length}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-sm font-bold disabled:opacity-40 transition-opacity">
              Add Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
