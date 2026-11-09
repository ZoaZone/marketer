import { useState, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Film, Upload, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
  Download, Scissors, Type, Palette, Image, Loader2, CheckCircle2,
  Trash2, Plus, Wand2, AlignCenter, Bold, Italic, RefreshCw
} from "lucide-react";

const TEXT_POSITIONS = ["Top", "Center", "Bottom"];
const TEXT_SIZES = ["Small", "Medium", "Large", "XLarge"];
const FILTER_PRESETS = [
  { id: "none",        label: "Original" },
  { id: "cinematic",   label: "Cinematic" },
  { id: "vibrant",     label: "Vibrant" },
  { id: "warm",        label: "Warm" },
  { id: "cool",        label: "Cool" },
  { id: "bw",          label: "B&W" },
  { id: "vintage",     label: "Vintage" },
];

const FILTER_STYLES = {
  none:      "",
  cinematic: "contrast(1.1) saturate(0.85) brightness(0.95)",
  vibrant:   "saturate(1.5) contrast(1.05)",
  warm:      "sepia(0.3) saturate(1.2) brightness(1.05)",
  cool:      "hue-rotate(20deg) saturate(1.1) brightness(1.02)",
  bw:        "grayscale(1) contrast(1.1)",
  vintage:   "sepia(0.5) contrast(0.9) brightness(1.05) saturate(0.8)",
};

export default function VideoEditor() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  const [videoSrc, setVideoSrc] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTab, setActiveTab] = useState("overlay");

  // Overlay text
  const [textOverlay, setTextOverlay] = useState("");
  const [textPosition, setTextPosition] = useState("Bottom");
  const [textSize, setTextSize] = useState("Medium");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textBg, setTextBg] = useState(true);

  // Filter
  const [filter, setFilter] = useState("none");

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);

  // AI caption generation
  const [aiTopic, setAiTopic] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load from media library
  const { data: mediaItems = [] } = useQuery({
    queryKey: ["video_editor_library"],
    queryFn: () => base44.entities.ContentAsset.filter({ type: "video" }, "-created_date", 20),
  });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoName(file.name);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setPlaying(false);
    setCurrentTime(0);
  };

  const loadFromLibrary = (item) => {
    setVideoSrc(item.file_url);
    setVideoName(item.title);
    setPlaying(false);
    setCurrentTime(0);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(m => !m);
  };

  const seek = (delta) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + delta));
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setTrimEnd(Math.round(videoRef.current.duration));
    }
  };

  const handleSeekBar = (e) => {
    const t = (e.target.value / 100) * duration;
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const generateAiCaption = async () => {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const res = await base44.functions.invoke("generateMediaContent", {
        type: "caption",
        platform: "General",
        tone: "Professional",
        prompt: `Write a short, punchy video text overlay (max 10 words) for a video about: "${aiTopic}"`,
      });
      const text = res?.data?.content || res?.data?.text || res?.content || res?.text || "";
      if (typeof text === "string" && text.trim()) setTextOverlay(text.trim().replace(/^"|"$/g, ""));
    } catch {}
    setAiLoading(false);
  };

  const saveToLibrary = async () => {
    if (!videoSrc) return;
    setSaving(true);
    try {
      await base44.entities.ContentAsset.create({
        type: "video",
        title: (videoName || "Edited Video") + " [edited]",
        file_url: videoSrc,
        ai_generated: false,
        status: "ready",
      });
      qc.invalidateQueries(["video_editor_library"]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const textSizeClass = {
    Small:  "text-sm",
    Medium: "text-lg",
    Large:  "text-2xl",
    XLarge: "text-4xl",
  }[textSize];

  const textPositionClass = {
    Top:    "top-4 left-0 right-0",
    Center: "top-1/2 -translate-y-1/2 left-0 right-0",
    Bottom: "bottom-4 left-0 right-0",
  }[textPosition];

  const TABS = [
    { id: "overlay", label: "Text Overlay", icon: Type },
    { id: "filter",  label: "Filters",      icon: Palette },
    { id: "trim",    label: "Trim",          icon: Scissors },
    { id: "library", label: "Library",       icon: Image },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Film className="w-6 h-6 text-fuchsia-400" /> Video Editor
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Add overlays, filters, trim & export your videos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card text-sm font-medium hover:border-fuchsia-500/30 transition-colors">
            <Upload className="w-4 h-4" /> Upload Video
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
          {videoSrc && (
            <button
              onClick={saveToLibrary}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                saved ? "bg-emerald-500/10 text-emerald-400" : "bg-fuchsia-500 text-white hover:opacity-90"
              }`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
              {saved ? "Saved!" : saving ? "Saving…" : "Save to Library"}
            </button>
          )}
        </div>
      </div>

      {!videoSrc ? (
        /* Empty state */
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer hover:border-fuchsia-500/40 transition-colors group">
          <div className="w-16 h-16 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center mb-4 group-hover:bg-fuchsia-500/20 transition-colors">
            <Upload className="w-8 h-8 text-fuchsia-400" />
          </div>
          <p className="text-foreground font-semibold mb-1">Upload a video to start editing</p>
          <p className="text-muted-foreground text-sm">MP4, MOV, WebM · or load from your Media Library below</p>
          {mediaItems.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-lg">
              {mediaItems.slice(0, 4).map(item => (
                <button key={item.id} onClick={(e) => { e.stopPropagation(); loadFromLibrary(item); }}
                  className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-fuchsia-500/30 transition-colors truncate max-w-[160px]">
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          {/* Preview panel */}
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
              <video
                ref={videoRef}
                src={videoSrc}
                className="w-full max-h-[420px] object-contain"
                style={{ filter: FILTER_STYLES[filter] }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setPlaying(false)}
              />
              {/* Text overlay */}
              {textOverlay && (
                <div className={`absolute ${textPositionClass} flex justify-center px-4`}>
                  <span
                    className={`${textSizeClass} ${textBold ? "font-black" : "font-semibold"} ${textItalic ? "italic" : ""} px-3 py-1 rounded-lg`}
                    style={{
                      color: textColor,
                      background: textBg ? "rgba(0,0,0,0.55)" : "transparent",
                      backdropFilter: textBg ? "blur(4px)" : "none",
                    }}>
                    {textOverlay}
                  </span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2">
              {/* Seek bar */}
              <input
                type="range" min={0} max={100}
                value={duration ? (currentTime / duration) * 100 : 0}
                onChange={handleSeekBar}
                className="w-full h-1.5 accent-fuchsia-500 cursor-pointer"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => seek(-5)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><SkipBack className="w-4 h-4" /></button>
                  <button onClick={togglePlay} className="p-2 rounded-xl bg-fuchsia-500 text-white hover:opacity-90 transition-opacity">
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => seek(5)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><SkipForward className="w-4 h-4" /></button>
                  <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{fmt(currentTime)} / {fmt(duration)}</span>
                <a href={videoSrc} download={videoName || "video.mp4"} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-fuchsia-500/40 transition-colors">
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
            </div>
          </div>

          {/* Tools panel */}
          <div className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                    activeTab === t.id ? "text-fuchsia-400 border-b-2 border-fuchsia-500 bg-fuchsia-500/5" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              {/* Text Overlay Tab */}
              {activeTab === "overlay" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Overlay Text</label>
                    <textarea
                      value={textOverlay}
                      onChange={e => setTextOverlay(e.target.value)}
                      rows={2}
                      placeholder="Your text here…"
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                  {/* AI generate */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Wand2 className="w-3 h-3" /> AI Generate Text</label>
                    <div className="flex gap-2">
                      <input
                        value={aiTopic}
                        onChange={e => setAiTopic(e.target.value)}
                        placeholder="Video topic…"
                        className="flex-1 h-8 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button onClick={generateAiCaption} disabled={aiLoading || !aiTopic.trim()}
                        className="px-3 h-8 rounded-md bg-fuchsia-500/10 text-fuchsia-400 text-xs font-medium hover:bg-fuchsia-500/20 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                        {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Generate
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Position</label>
                      <select value={textPosition} onChange={e => setTextPosition(e.target.value)}
                        className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none">
                        {TEXT_POSITIONS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Size</label>
                      <select value={textSize} onChange={e => setTextSize(e.target.value)}
                        className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none">
                        {TEXT_SIZES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="space-y-1.5 flex-1">
                      <label className="text-xs font-medium text-muted-foreground">Color</label>
                      <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background cursor-pointer" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Style</label>
                      <div className="flex gap-1.5">
                        <button onClick={() => setTextBold(b => !b)}
                          className={`w-8 h-8 rounded-md border text-xs font-black transition-colors ${textBold ? "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-400" : "border-border text-muted-foreground hover:text-foreground"}`}>B</button>
                        <button onClick={() => setTextItalic(i => !i)}
                          className={`w-8 h-8 rounded-md border text-xs italic font-semibold transition-colors ${textItalic ? "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-400" : "border-border text-muted-foreground hover:text-foreground"}`}>I</button>
                        <button onClick={() => setTextBg(b => !b)}
                          className={`w-8 h-8 rounded-md border text-[10px] transition-colors ${textBg ? "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-400" : "border-border text-muted-foreground hover:text-foreground"}`}>BG</button>
                      </div>
                    </div>
                  </div>
                  {textOverlay && (
                    <button onClick={() => setTextOverlay("")}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 className="w-3 h-3" /> Remove overlay
                    </button>
                  )}
                </div>
              )}

              {/* Filters Tab */}
              {activeTab === "filter" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Click a filter to preview it on your video.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FILTER_PRESETS.map(f => (
                      <button key={f.id} onClick={() => setFilter(f.id)}
                        className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          filter === f.id
                            ? "bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-400"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-fuchsia-500/20"
                        }`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setFilter("none")}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <RefreshCw className="w-3 h-3" /> Reset to original
                  </button>
                </div>
              )}

              {/* Trim Tab */}
              {activeTab === "trim" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Set trim in/out points. The video plays within these bounds in the browser preview. For full export trimming, download and use a desktop video editor.</p>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Start: {fmt(trimStart)}</label>
                    <input type="range" min={0} max={Math.floor(duration)} value={trimStart}
                      onChange={e => { const v = Number(e.target.value); if (v < trimEnd) setTrimStart(v); if (videoRef.current) videoRef.current.currentTime = v; }}
                      className="w-full accent-fuchsia-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">End: {fmt(trimEnd)}</label>
                    <input type="range" min={0} max={Math.floor(duration)} value={trimEnd}
                      onChange={e => { const v = Number(e.target.value); if (v > trimStart) setTrimEnd(v); }}
                      className="w-full accent-fuchsia-500" />
                  </div>
                  <div className="bg-muted/30 rounded-xl px-3 py-2 text-xs text-muted-foreground">
                    Trimmed duration: <span className="text-foreground font-semibold">{fmt(trimEnd - trimStart)}</span>
                  </div>
                  <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = trimStart; }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 text-xs font-medium hover:bg-fuchsia-500/20 transition-colors">
                    <Play className="w-3 h-3" /> Preview from trim start
                  </button>
                </div>
              )}

              {/* Library Tab */}
              {activeTab === "library" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Load a video from your Media Library.</p>
                  {mediaItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 text-center py-6">No videos saved yet.</p>
                  ) : (
                    mediaItems.map(item => (
                      <button key={item.id} onClick={() => loadFromLibrary(item)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 transition-all text-left">
                        <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                          <Film className="w-5 h-5 text-rose-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(item.created_date).toLocaleDateString()}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}