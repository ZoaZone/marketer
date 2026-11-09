import { useState, useEffect, useRef } from "react";
import { useOutletContext, useLocation } from "react-router-dom";
import { Film, Clapperboard, Layers, Music, Crop, Sparkles, Download, X, AlertCircle, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import useEditorProject from "@/components/media-editor/useEditorProject";
import EditorPreview from "@/components/media-editor/EditorPreview";
import LibraryPicker from "@/components/media-editor/LibraryPicker";
import ClipsPanel from "@/components/media-editor/ClipsPanel";
import LayersPanel from "@/components/media-editor/LayersPanel";
import AudioPanel from "@/components/media-editor/AudioPanel";
import SizePanel from "@/components/media-editor/SizePanel";
import AiPanel from "@/components/media-editor/AiPanel";
import ExportPanel from "@/components/media-editor/ExportPanel";

const TABS = [
  { id: "clips", label: "Clips", icon: Clapperboard },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "audio", label: "Audio", icon: Music },
  { id: "size", label: "Size", icon: Crop },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "export", label: "Export", icon: Download },
];

export default function MediaEditor() {
  const { user } = useOutletContext() || {};
  const location = useLocation();
  const p = useEditorProject();
  const [tab, setTab] = useState("clips");
  const [picker, setPicker] = useState(null); // 'clips' | 'pip'
  const handedOff = useRef(false);

  // Items sent here from the Media Library ("Edit" button) open straight away.
  useEffect(() => {
    const incoming = location.state?.assets;
    if (handedOff.current || !incoming?.length) return;
    handedOff.current = true;
    p.addAssets(incoming);
  }, [location.state]);

  const selClip = p.clips.find(c => c.id === p.selClipId) || p.clips[0];
  const panels = {
    clips: <ClipsPanel p={p} openLibrary={() => setPicker("clips")} />,
    layers: <LayersPanel p={p} openLibrary={() => setPicker("pip")} />,
    audio: <AudioPanel p={p} />,
    size: <SizePanel p={p} />,
    ai: <AiPanel p={p} />,
    export: <ExportPanel p={p} />,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader icon={Film} iconGradient="from-fuchsia-500 to-purple-600" title="Edit Media"
        subtitle="Combine photos and videos, crop, add text, logos, PiP, music and voice-over. AI helps fix broken text." />
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <EditorPreview size={p.size} clip={selClip} layers={p.layers} selLayerId={p.selLayerId}
          onSelectLayer={id => { p.setSelLayerId(id); setTab("layers"); }}
          onMoveLayer={(id, pt) => p.updateLayer(id, { x: pt.x, y: pt.y })} />
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-1 p-1 rounded-xl bg-card border border-border">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-semibold ${tab === t.id ? "bg-fuchsia-500 text-white" : "text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="w-4 h-4" />{t.label}
              </button>
            ))}
          </div>
          {p.error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{p.error}</span>
              <button type="button" aria-label="Dismiss" onClick={() => p.setError("")}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {p.busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Working…</p>}
          {panels[tab]}
        </div>
      </div>
      {picker && (
        <LibraryPicker user={user} multi={picker === "clips"} onClose={() => setPicker(null)}
          onPick={assets => { picker === "clips" ? p.addAssets(assets) : p.addMediaLayer("pip", assets[0]); setPicker(null); }} />
      )}
    </div>
  );
}