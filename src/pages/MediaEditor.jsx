import { useState, useRef } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import {
  Upload, Sparkles, Type, Music, Download, Save, Lock, ChevronRight, X, Image as ImageIcon, Check,
  Loader2, AlertCircle, Wand2, Film,
} from "lucide-react";
import { generateImage, uploadFile } from "@/utils/aiClient";
import PageHeader from "@/components/ui/PageHeader";

const AI_STYLES = [
  { id: "cinematic", label: "Cinematic", prompt: "cinematic movie still, dramatic lighting, shallow depth of field, film grain" },
  { id: "neon", label: "Neon Glow", prompt: "neon lights, synthwave aesthetic, vibrant colors, dark background, glowing" },
  { id: "vintage", label: "Vintage Film", prompt: "vintage film photo, faded colors, light leak, retro grain, 1970s aesthetic" },
  { id: "minimalist", label: "Minimalist", prompt: "minimalist clean design, white space, simple composition, modern" },
  { id: "dramatic", label: "Dramatic B&W", prompt: "dramatic black and white photography, high contrast, deep shadows" },
  { id: "anime", label: "Anime Art", prompt: "anime illustration style, vibrant colors, detailed background, Studio Ghibli inspired" },
  { id: "oil", label: "Oil Painting", prompt: "oil painting style, rich colors, visible brush strokes, classical art" },
  { id: "watercolor", label: "Watercolor", prompt: "soft watercolor painting, gentle washes of color, artistic, dreamy" },
];

const CAPTION_POSITIONS = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

const TABS = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "style", label: "AI Style", icon: Wand2 },
  { id: "caption", label: "Caption", icon: Type },
  { id: "music", label: "Music", icon: Music },
  { id: "export", label: "Export", icon: Download },
];

export default function MediaEditor() {
  const { userTier, isAdmin } = useOutletContext();
  const fileInputRef = useRef();
  const musicInputRef = useRef();

  const [tab, setTab] = useState("upload");
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState("image"); // image | video
  const [editedUrl, setEditedUrl] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [customStylePrompt, setCustomStylePrompt] = useState("");
  const [caption, setCaption] = useState({ text: "", position: "bottom", color: "#ffffff", size: 32 });
  const [musicUrl, setMusicUrl] = useState("");
  const [musicFile, setMusicFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (userTier < 4 && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg shadow-fuchsia-500/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-foreground">AI Media Editor</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Edit photos and videos with AI-powered style transforms, caption overlays, and background music — available on the Enterprise plan.
          </p>
          <Link to="/billing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/25 hover:opacity-90 transition-opacity">
            <Sparkles className="w-4 h-4" /> Upgrade to Enterprise
          </Link>
        </div>
      </div>
    );
  }

  const handleFileUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const isVideo = file.type.startsWith("video/");
      setSourceType(isVideo ? "video" : "image");
      setSourceFile(file);
      const url = await uploadFile(file);
      setSourceUrl(url);
      setEditedUrl(url);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const applyAIStyle = async () => {
    if (!sourceUrl) return setError("Upload a media file first.");
    const stylePrompt = selectedStyle
      ? `${AI_STYLES.find(s => s.id === selectedStyle)?.prompt ?? ""} ${customStylePrompt}`.trim()
      : customStylePrompt;
    if (!stylePrompt) return setError("Select a style preset or enter a custom prompt.");
    setLoading(true);
    setError("");
    try {
      const result = await generateImage({
        prompt: `Edit this image: ${stylePrompt}`,
        referenceImageUrls: [sourceUrl],
      });
      if (result) setEditedUrl(result);
      else setError("AI style generation failed. Try a different prompt.");
    } catch (e) {
      setError(e?.message || "Style generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleMusicUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const url = await uploadFile(file);
      setMusicUrl(url);
      setMusicFile(file);
    } catch {
      setError("Music upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!editedUrl) return;
    setLoading(true);
    try {
      await base44.entities.ContentAsset.create({
        ...mine(),
        title: `AI Edited ${sourceType === "video" ? "Video" : "Image"} — ${new Date().toLocaleDateString()}`,
        type: sourceType === "video" ? "video" : "image",
        file_url: editedUrl,
        ai_generated: true,
        prompt_used: selectedStyle ? AI_STYLES.find(s => s.id === selectedStyle)?.prompt : customStylePrompt,
        status: "ready",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const previewUrl = editedUrl || sourceUrl;

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          icon={Film}
          iconGradient="from-fuchsia-500 to-purple-600"
          title="AI Media Editor"
          subtitle="Style transforms, caption overlays, background music — powered by AI"
        />

        <div className="grid md:grid-cols-[1fr_380px] gap-6">
          {/* Left: tabs + controls */}
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-xl bg-card border border-border">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    tab === t.id ? "bg-fuchsia-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                <button onClick={() => setError("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Upload tab */}
            {tab === "upload" && (
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-2xl p-10 text-center cursor-pointer hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5 transition-all group">
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden"
                    onChange={e => handleFileUpload(e.target.files?.[0])} />
                  {loading ? (
                    <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin mx-auto" />
                  ) : sourceFile ? (
                    <div className="space-y-2">
                      <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm font-semibold text-foreground">{sourceFile.name}</p>
                      <p className="text-xs text-muted-foreground">Click to replace</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-muted-foreground group-hover:text-fuchsia-400 mx-auto mb-3 transition-colors" />
                      <p className="text-sm font-semibold text-foreground">Upload image or video</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG, MP4, MOV — up to 100 MB</p>
                    </>
                  )}
                </div>
                {sourceUrl && (
                  <button onClick={() => setTab("style")}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/25 hover:opacity-90 transition-opacity">
                    Apply AI Style <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* AI Style tab */}
            {tab === "style" && (
              <div className="space-y-4">
                {!sourceUrl && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Upload a file first from the Upload tab.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {AI_STYLES.map(s => (
                    <button key={s.id} onClick={() => setSelectedStyle(s.id === selectedStyle ? null : s.id)}
                      className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all ${
                        selectedStyle === s.id
                          ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-400"
                          : "border-border bg-card text-muted-foreground hover:border-fuchsia-500/40 hover:text-foreground"
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Custom style prompt (optional)</label>
                  <input value={customStylePrompt} onChange={e => setCustomStylePrompt(e.target.value)}
                    placeholder="e.g. golden hour lighting, warm tones..."
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50 transition-colors" />
                </div>
                <button onClick={applyAIStyle} disabled={loading || !sourceUrl}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/25 hover:opacity-90 transition-opacity disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {loading ? "Applying style…" : "Apply AI Style"}
                </button>
              </div>
            )}

            {/* Caption tab */}
            {tab === "caption" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Caption text</label>
                  <textarea value={caption.text} onChange={e => setCaption(c => ({ ...c, text: e.target.value }))}
                    placeholder="Enter caption for your media..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50 transition-colors resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Position</label>
                  <div className="flex gap-2">
                    {CAPTION_POSITIONS.map(p => (
                      <button key={p.id} onClick={() => setCaption(c => ({ ...c, position: p.id }))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                          caption.position === p.id
                            ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-400"
                            : "border-border bg-card text-muted-foreground hover:border-fuchsia-500/40"
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Text color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={caption.color} onChange={e => setCaption(c => ({ ...c, color: e.target.value }))}
                        className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-card" />
                      <span className="text-xs text-muted-foreground font-mono">{caption.color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Font size: {caption.size}px</label>
                    <input type="range" min={16} max={72} value={caption.size}
                      onChange={e => setCaption(c => ({ ...c, size: +e.target.value }))}
                      className="w-full accent-fuchsia-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Music tab */}
            {tab === "music" && (
              <div className="space-y-4">
                <div
                  onClick={() => musicInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5 transition-all group">
                  <input ref={musicInputRef} type="file" accept="audio/*" className="hidden"
                    onChange={e => handleMusicUpload(e.target.files?.[0])} />
                  {loading ? (
                    <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin mx-auto" />
                  ) : musicFile ? (
                    <div className="space-y-1">
                      <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm font-semibold text-foreground">{musicFile.name}</p>
                    </div>
                  ) : (
                    <>
                      <Music className="w-10 h-10 text-muted-foreground group-hover:text-fuchsia-400 mx-auto mb-3 transition-colors" />
                      <p className="text-sm font-semibold text-foreground">Upload background music</p>
                      <p className="text-xs text-muted-foreground mt-1">MP3, WAV, AAC</p>
                    </>
                  )}
                </div>
                {musicUrl && (
                  <audio controls src={musicUrl} className="w-full rounded-xl" />
                )}
              </div>
            )}

            {/* Export tab */}
            {tab === "export" && (
              <div className="space-y-4">
                {!previewUrl ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Upload and edit media first to export.</p>
                ) : (
                  <>
                    <div className="p-4 rounded-xl bg-card border border-border space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Export options</p>
                      <a href={previewUrl} download target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/20 transition-colors">
                        <Download className="w-4 h-4" /> Download
                      </a>
                    </div>
                    <button onClick={handleSaveToLibrary} disabled={loading || saved}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/25 hover:opacity-90 transition-opacity disabled:opacity-50">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {saved ? "Saved to Library!" : loading ? "Saving…" : "Save to Media Library"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: preview */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-border overflow-hidden aspect-square flex items-center justify-center relative">
              {previewUrl ? (
                sourceType === "video" ? (
                  <video src={previewUrl} controls className="w-full h-full object-contain" />
                ) : (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                )
              ) : (
                <div className="text-center space-y-2 p-6">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                  <p className="text-xs text-muted-foreground">Preview appears here</p>
                </div>
              )}
              {/* Caption overlay preview */}
              {caption.text && previewUrl && (
                <div className={`absolute left-0 right-0 px-4 py-3 ${
                  caption.position === "top" ? "top-0" : caption.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-0"
                } bg-black/40 text-center`}
                  style={{ color: caption.color, fontSize: `${Math.min(caption.size, 24)}px`, fontWeight: 700 }}>
                  {caption.text}
                </div>
              )}
            </div>

            {/* Music player */}
            {musicUrl && (
              <div className="p-3 rounded-xl bg-card border border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Music className="w-3 h-3" /> Background Music</p>
                <audio controls src={musicUrl} className="w-full h-8" />
              </div>
            )}

            {/* Step flow CTA */}
            <div className="p-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Workflow</p>
              {["Upload media", "Apply AI style", "Add caption", "Add music", "Export & save"].map((s, i) => (
                <div key={s} className="flex items-center gap-2 py-0.5">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    (i === 0 && sourceUrl) || (i === 1 && editedUrl !== sourceUrl) || (i === 2 && caption.text) || (i === 3 && musicUrl)
                      ? "bg-fuchsia-500 text-white" : "bg-card border border-border text-muted-foreground/50"
                  }`}>{i + 1}</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
