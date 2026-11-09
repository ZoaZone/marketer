import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { Image, FileText, Video, Trash2, Download, Copy, Search, Loader2, Sparkles, X, ExternalLink, Wand2, Sliders } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import resolveStudioMedia from '@/components/quick-create/resolveStudioMedia';

import CompanionFiles from "@/components/media-library/CompanionFiles";

const TYPE_COLORS = {
  image: "bg-purple-500/10 text-purple-400",
  video: "bg-red-500/10 text-red-400",
  script: "bg-blue-500/10 text-blue-400",
  ad_copy: "bg-amber-500/10 text-amber-400",
  email_template: "bg-emerald-500/10 text-emerald-400",
  caption: "bg-pink-500/10 text-pink-400",
  hashtag_set: "bg-fuchsia-500/10 text-fuchsia-400",
};

function AssetPreview({ asset, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground truncate">{asset.title || "Untitled"}</p>
            <p className="text-[10px] text-muted-foreground">{asset.type?.replace(/_/g, " ")} · {asset.platform || "General"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[70vh]">
          {asset.type === "image" && asset.file_url ? (
            <img src={asset.file_url} alt={asset.title} className="w-full rounded-xl object-contain max-h-[60vh]" />
          ) : asset.type === "video" && asset.file_url ? (
            <video src={asset.file_url} controls className="w-full rounded-xl max-h-[60vh]" />
          ) : asset.content ? (
            <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">{asset.content}</pre>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">No preview available</p>
          )}
          {asset.file_url && (
            <a href={asset.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-xs text-fuchsia-400 hover:text-fuchsia-300">
              <ExternalLink className="w-3 h-3" /> Open original
            </a>
          )}
          <CompanionFiles asset={asset} />
        </div>
      </div>
    </div>
  );
}

export default function MediaLibrary() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [copiedId, setCopiedId] = useState(null);
  const [view, setView] = useState("grid");
  const [preview, setPreview] = useState(null);

  const { data: assets = [], isLoading } = useQuery({ queryKey: ["media_library", user?.email], queryFn: async () => {
    const items = await base44.entities.ContentAsset.filter(mine(user), "-created_date", 200);
    return Promise.all(items.map(resolveStudioMedia));
  }, enabled: !!user?.email });

  const filtered = assets.filter(a => {
    const q = search.toLowerCase();
    return (!q || (a.title || "").toLowerCase().includes(q) || (a.platform || "").toLowerCase().includes(q)) && (typeFilter === "all" || a.type === typeFilter);
  });

  const types = [...new Set(assets.map(a => a.type).filter(Boolean))];

  const copy = async (a) => {
    await navigator.clipboard.writeText(a.content || a.file_url || "");
    setCopiedId(a.id); setTimeout(() => setCopiedId(null), 2000);
  };

  const del = async (id) => {
    if (!confirm("Delete?")) return;
    await base44.entities.ContentAsset.delete(id);
    qc.invalidateQueries(["media_library"]);
  };

  // Hands this asset's URL off to Movie Maker's Reference Library via
  // navigation state (never touches the URL bar) — Movie Maker picks it up
  // on mount and adds it as a reference. Only makes sense for assets with
  // an actual image/video file.
  const sendAsReference = (a) => {
    navigate("/movie-maker", {
      state: { incomingReference: { url: a.file_url, label: a.title || "From Media Library", kind: a.type === "video" ? "video" : "image" } },
    });
  };

  const editAsset = (a) => navigate("/media-editor", { state: { assets: [a] } });

  // Thumbnail for grid cards
  const CardThumbnail = ({ a }) => {
    if (a.type === "image" && a.file_url) {
      return <div className="aspect-video bg-muted overflow-hidden"><img src={a.file_url} alt={a.title} className="w-full h-full object-cover" /></div>;
    }
    if (a.type === "video" && a.file_url) {
      return <div className="aspect-video bg-black overflow-hidden relative"><video src={a.file_url} className="w-full h-full object-cover opacity-80" /><div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center"><Video className="w-5 h-5 text-white" /></div></div></div>;
    }
    if (a.content) {
      return (
        <div className={`aspect-video flex items-start overflow-hidden px-4 py-3 ${TYPE_COLORS[a.type] || "bg-muted"}`}>
          <p className="text-xs leading-relaxed line-clamp-5 opacity-80">{a.content}</p>
        </div>
      );
    }
    return (
      <div className={`aspect-video flex items-center justify-center ${TYPE_COLORS[a.type] || "bg-muted text-muted-foreground"}`}>
        <div className="text-center"><FileText className="w-8 h-8 mx-auto opacity-50" /><p className="text-xs font-medium mt-1.5 opacity-60">{a.type?.replace(/_/g, " ")}</p></div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {preview && <AssetPreview asset={preview} onClose={() => setPreview(null)} />}

      <PageHeader
        icon={Image}
        iconGradient="from-fuchsia-500 to-purple-600"
        title="Media Library"
        subtitle={`${assets.length} assets saved`}
        actions={
          <>
            <button onClick={() => setView("grid")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === "grid" ? "bg-fuchsia-500/10 text-fuchsia-400" : "bg-muted text-muted-foreground"}`}>Grid</button>
            <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === "list" ? "bg-fuchsia-500/10 text-fuchsia-400" : "bg-muted text-muted-foreground"}`}>List</button>
          </>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…" className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
          <option value="all">All Types</option>
          {types.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center bg-card border border-border rounded-2xl">
            <Sparkles className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-medium">{assets.length === 0 ? "No assets yet" : "No assets match filters"}</p>
            <p className="text-xs text-muted-foreground mt-1">Use Media Studio or Script Writer to generate and save content</p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(a => (
              <div key={a.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-fuchsia-500/30 transition-all group">
                <div className="cursor-pointer relative" onClick={() => setPreview(a)}>
                  <CardThumbnail a={a} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="text-white text-xs font-semibold bg-black/50 px-3 py-1 rounded-full">Preview</span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs font-semibold text-foreground truncate">{a.title || "Untitled"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.platform || "General"}{a.ai_generated ? " · AI" : ""}</p>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => copy(a)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium ${copiedId === a.id ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{copiedId === a.id ? "✓ Copied" : "Copy"}</button>
                    {a.file_url && <a href={a.file_url} download className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-muted text-muted-foreground hover:text-foreground text-center">Save</a>}
                    <button onClick={() => del(a.id)} className="px-2 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {a.file_url && (a.type === "image" || a.type === "video") && (
                    <button onClick={() => sendAsReference(a)}
                      className="w-full mt-1.5 py-1.5 rounded-lg text-[10px] font-medium bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 flex items-center justify-center gap-1">
                      <Wand2 className="w-3 h-3" /> Use as reference
                    </button>
                  )}
                  {a.file_url && (a.type === "image" || a.type === "video") && (
                    <button onClick={() => editAsset(a)}
                      className="w-full mt-1.5 py-1.5 rounded-lg text-[10px] font-medium bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20 flex items-center justify-center gap-1">
                      <Sliders className="w-3 h-3" /> Edit media
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="divide-y divide-border">
              {filtered.map(a => (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20">
                  <div className="w-14 h-10 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => setPreview(a)}>
                    {a.type === "image" && a.file_url
                      ? <img src={a.file_url} alt={a.title} className="w-full h-full object-cover" />
                      : a.type === "video" && a.file_url
                        ? <video src={a.file_url} className="w-full h-full object-cover" />
                        : <div className={`w-full h-full flex items-center justify-center ${TYPE_COLORS[a.type] || "bg-muted"}`}><FileText className="w-4 h-4" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-fuchsia-400" onClick={() => setPreview(a)}>{a.title || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">{a.type?.replace(/_/g, " ")} · {a.platform || "General"}</p>
                    {a.content && <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{a.content.slice(0, 80)}</p>}
                  </div>
                  <div className="flex gap-2">
                    {a.file_url && (a.type === "image" || a.type === "video") && (
                      <button onClick={() => sendAsReference(a)} title="Use as reference" className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10"><Wand2 className="w-3.5 h-3.5" /></button>
                    )}
                    {a.file_url && (a.type === "image" || a.type === "video") && (
                      <button onClick={() => editAsset(a)} title="Edit media" className="p-1.5 rounded-lg text-fuchsia-400 hover:bg-fuchsia-500/10"><Sliders className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => copy(a)} className={`p-1.5 rounded-lg ${copiedId === a.id ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}><Copy className="w-3.5 h-3.5" /></button>
                    {a.file_url && <a href={a.file_url} download className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><Download className="w-3.5 h-3.5" /></a>}
                    <button onClick={() => del(a.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}