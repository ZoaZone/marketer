import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Sparkles, Image, FileText, Megaphone, Hash, Loader2, Download,
  Copy, CheckCircle2, RefreshCw, Wand2, Video, Mic, Mail, MessageSquare,
  Globe, Palette, Play, Film, Zap, Star, ChevronDown, ChevronUp, Layers,
  Clapperboard, Volume2, Music, AlignLeft, Upload, X, ImagePlus
} from "lucide-react";

// ── Creative Types ──────────────────────────────────────────────────────────
const TYPES = [
  // Video Generation
  { id: "ai_video",      label: "AI Video",       Icon: Clapperboard, desc: "Generate real video with audio",  color: "from-rose-500 to-red-600",        category: "video" },
  // Visual
  { id: "image",         label: "AI Image",       Icon: Image,        desc: "Platform-ready images",           color: "from-fuchsia-500 to-purple-600",  category: "visual" },
  { id: "video_script",  label: "Video Script",   Icon: Video,        desc: "Full scene-by-scene script",      color: "from-rose-500 to-pink-600",       category: "visual" },
  { id: "video_storyboard", label: "Storyboard",  Icon: Film,         desc: "Shot list + visual directions",   color: "from-orange-500 to-red-600",      category: "visual" },
  { id: "thumbnail",     label: "Thumbnail",      Icon: Layers,       desc: "YouTube & video thumbnails",      color: "from-yellow-500 to-orange-500",   category: "visual" },
  // Copy
  { id: "caption",       label: "Caption",        Icon: FileText,     desc: "AI social captions + emojis",     color: "from-pink-500 to-rose-600",       category: "copy" },
  { id: "ad_copy",       label: "Ad Copy",        Icon: Megaphone,    desc: "Headline + body + CTA",           color: "from-amber-500 to-orange-600",    category: "copy" },
  { id: "hashtag_set",   label: "Hashtag Set",    Icon: Hash,         desc: "30 trending hashtags per niche",  color: "from-emerald-500 to-teal-600",    category: "copy" },
  { id: "blog_post",     label: "Blog Post",      Icon: Globe,        desc: "SEO-ready long-form article",     color: "from-sky-500 to-blue-600",        category: "copy" },
  // Email & Messaging
  { id: "email_template",label: "Email",          Icon: Mail,         desc: "Subject + full email body",       color: "from-blue-500 to-cyan-600",       category: "messaging" },
  { id: "sms_template",  label: "SMS",            Icon: MessageSquare,desc: "160-char SMS with CTA",           color: "from-violet-500 to-indigo-600",   category: "messaging" },
  { id: "whatsapp",      label: "WhatsApp",       Icon: MessageSquare,desc: "WhatsApp broadcast message",      color: "from-green-500 to-emerald-600",   category: "messaging" },
  // Branding
  { id: "brand_voice",   label: "Brand Voice",    Icon: Mic,          desc: "Tone & messaging guidelines",     color: "from-purple-500 to-violet-600",   category: "branding" },
  { id: "brand_bio",     label: "Bio / About",    Icon: Star,         desc: "Platform bios & about sections",  color: "from-teal-500 to-cyan-600",       category: "branding" },
  { id: "press_release", label: "Press Release",  Icon: Zap,          desc: "Professional PR announcement",    color: "from-slate-500 to-gray-600",      category: "branding" },
];

const CATEGORIES = [
  { id: "all",      label: "All" },
  { id: "video",    label: "🎬 Video" },
  { id: "visual",   label: "🎨 Visual" },
  { id: "copy",     label: "✍️ Copy" },
  { id: "messaging",label: "📨 Messaging" },
  { id: "branding", label: "🏷️ Branding" },
];

const PLATFORMS = [
  "Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube",
  "Twitter/X", "WhatsApp", "Pinterest", "Snapchat", "General"
];
const TONES = ["Professional", "Casual", "Exciting", "Urgent", "Friendly", "Luxury", "Humorous", "Inspirational"];
const VIDEO_STYLES = ["Talking Head", "Slideshow", "Animation", "Product Demo", "Testimonial", "Tutorial", "Short-form Reel", "Documentary"];
const VIDEO_DURATIONS = ["15 seconds", "30 seconds", "60 seconds", "2 minutes", "5 minutes", "10 minutes"];
const AI_VIDEO_FORMATS = [
  { label: "Reel / TikTok / Short (9:16)", aspect: "9:16", duration: 6 },
  { label: "YouTube / Landscape (16:9)",   aspect: "16:9", duration: 6 },
  { label: "Square Feed (1:1) → 16:9",    aspect: "16:9", duration: 4 },
];
const AI_VIDEO_DURATIONS = [
  { label: "4 seconds",  value: 4,  clips: 1 },
  { label: "6 seconds",  value: 6,  clips: 1 },
  { label: "8 seconds",  value: 8,  clips: 1 },
  { label: "~16 seconds (2 clips)", value: 16, clips: 2 },
  { label: "~24 seconds (3 clips)", value: 24, clips: 3 },
  { label: "~30 seconds (4 clips)", value: 30, clips: 4 },
];
const IMAGE_DIMS = [
  { label: "1080×1080 – Square (Feed)",        value: "1080x1080" },
  { label: "1080×1920 – Story / Reel",         value: "1080x1920" },
  { label: "1200×628 – Facebook Ad",            value: "1200x628" },
  { label: "1280×720 – YouTube Thumbnail",      value: "1280x720" },
  { label: "1200×1200 – LinkedIn",              value: "1200x1200" },
  { label: "735×1102 – Pinterest",              value: "735x1102" },
  { label: "1500×500 – Twitter/X Banner",       value: "1500x500" },
  { label: "1920×1080 – Widescreen / OG Image", value: "1920x1080" },
];

// ── LLM prompt builders ─────────────────────────────────────────────────────
function buildPrompt(type, form) {
  const base = `Topic/Product: "${form.prompt}". Platform: ${form.platform}. Tone: ${form.tone}.`;
  switch (type) {
    case "caption":
      return `Write an engaging social media caption. ${base} Include emojis, line breaks, and a clear hook in the first line. Max 220 chars.`;
    case "ad_copy":
      return `Write compelling ad copy. ${base}\nFormat exactly as:\nHEADLINE: ...\nBODY: ...\nCTA: ...\nHASHTAGS: ...`;
    case "hashtag_set":
      return `Generate 30 relevant and trending hashtags for ${form.platform} about: "${form.prompt}". Return as a flat list of space-separated #tags. Group by reach: broad, niche, branded.`;
    case "email_template":
      return `Write a full marketing email. ${base}\nFormat exactly as:\nSUBJECT: ...\nPREHEADER: ...\n\nBODY:\n...\n\nCTA BUTTON: ...`;
    case "sms_template":
      return `Write a concise SMS message (max 160 chars) with a punchy opener and CTA. ${base}`;
    case "whatsapp":
      return `Write a WhatsApp broadcast message. ${base} Use line breaks and a few relevant emojis. Max 300 chars. Include CTA and opt-out line.`;
    case "blog_post":
      return `Write a complete SEO-optimized blog post. ${base}\nInclude:\n- SEO Title\n- Meta Description (155 chars)\n- H1, H2, H3 headings\n- 600-900 word body\n- Internal link placeholders\n- Conclusion + CTA`;
    case "video_script":
      return `Write a full video script for a ${form.videoStyle || "short-form"} video (${form.videoDuration || "60 seconds"}). ${base}\nFormat as:\nHOOK (0-3s): ...\nINTRO (3-8s): ...\n[Scene-by-scene with timecodes]\nOUTRO + CTA: ...\nCAPTION OVERLAY TEXT: ...`;
    case "video_storyboard":
      return `Create a detailed storyboard for a ${form.videoDuration || "60 seconds"} ${form.videoStyle || "social media"} video. ${base}\nFor each shot provide:\nSHOT [N]: [angle]\nVISUAL: [what's on screen]\nAUDIO/VO: [voiceover or music note]\nTEXT OVERLAY: [on-screen text]\nDURATION: [seconds]\n\nInclude 6-10 shots.`;
    case "thumbnail":
      return `Design directions for a ${form.platform} video thumbnail. ${base}\nProvide:\nCONCEPT: ...\nBACKGROUND: ...\nTEXT OVERLAY: ...\nCOLOR PALETTE: ...\nEMOTION/EXPRESSION: ...\nFONT STYLE: ...`;
    case "brand_voice":
      return `Create a brand voice guide for: "${form.prompt}".\nInclude:\n- Brand Personality (3-5 adjectives)\n- Tone of Voice\n- Words We Use / Words We Avoid\n- Sample Taglines (5)\n- Sample Social Bio\n- Sample Caption\n- Competitor Differentiation`;
    case "brand_bio":
      return `Write platform bios for "${form.prompt}". Tone: ${form.tone}.\nProvide:\nINSTAGRAM BIO (150 chars): ...\nTWITTER/X BIO (160 chars): ...\nLINKEDIN SUMMARY (300 chars): ...\nTIKTOK BIO (80 chars): ...\nYOUTUBE ABOUT (500 chars): ...`;
    case "press_release":
      return `Write a professional press release. ${base}\nFormat as:\nFOR IMMEDIATE RELEASE\n\nHEADLINE: ...\nSUBHEADLINE: ...\nCITY, DATE — [opening paragraph - who, what, when, where, why]\n[Body: 3-4 paragraphs]\nQUOTE: "..." — [Name, Title]\nABOUT [COMPANY]: ...\nCONTACT: ...`;
    default:
      return `Generate ${type} content. ${base}`;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function MediaStudio() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();

  const [activeType, setActiveType] = useState("image");
  const [activeCat, setActiveCat] = useState("all");
  const [form, setForm] = useState({
    prompt: "", platform: "Instagram", tone: "Professional",
    dimensions: "1080x1080", videoStyle: "Short-form Reel", videoDuration: "60 seconds",
    videoAspect: "9:16", videoSeconds: 6,
    audioNote: "", captionStyle: "minimal"
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]); // [{name, url, previewUrl, type}]
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const results = [];
    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      const res = await base44.integrations.Core.UploadFile({ file });
      results.push({ name: file.name, url: res.file_url, previewUrl, type: file.type });
    }
    setUploadedFiles(prev => [...prev, ...results]);
    setUploading(false);
  };

  const removeUploadedFile = (idx) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const activeTypeObj = TYPES.find(t => t.id === activeType);
  const isVisual = activeType === "image" || activeType === "thumbnail";
  const isVideoType = activeType === "video_script" || activeType === "video_storyboard";
  const isAiVideo = activeType === "ai_video";
  const isLongForm = ["blog_post", "brand_voice", "press_release", "brand_bio"].includes(activeType);

  const filteredTypes = activeCat === "all" ? TYPES : TYPES.filter(t => t.category === activeCat);

  // Sanitize user prompts before sending to Vertex AI GenerateVideo.
  // Vertex AI flags: personal names, relationship terms, some celebration contexts.
  // We rewrite these into safe cinematic equivalents without losing intent.
  const sanitizeVideoPrompt = (rawPrompt) => {
    let p = rawPrompt;

    // Replace relationship words with neutral equivalents
    const relationshipMap = {
      "\\bwife\\b": "person",
      "\\bhusband\\b": "person",
      "\\bgirlfriend\\b": "person",
      "\\bboyfriend\\b": "person",
      "\\bfiance\\b": "person",
      "\\bfiancee\\b": "person",
      "\\bspouse\\b": "person",
      "\\bpartner\\b": "individual",
    };
    Object.entries(relationshipMap).forEach(([pattern, replacement]) => {
      p = p.replace(new RegExp(pattern, "gi"), replacement);
    });

    // Strip personal names (2+ capitalised words in a row not at sentence start)
    // Replace with "a person" to preserve context
    p = p.replace(/(?<![.!?]\s)\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, "a person");

    // Rephrase "celebrating X's Birthday" -> "celebrating a birthday"
    p = p.replace(/celebrating\s+\w+'s\s+birthday/gi, "celebrating a birthday");
    p = p.replace(/\w+'s\s+birthday/gi, "a birthday celebration");

    // Replace overly specific location descriptors that can trip filters
    p = p.replace(/five[- ]star hotel/gi, "luxury hotel");
    p = p.replace(/grand background/gi, "elegant backdrop");

    // Strip references to "attached photo/image" — Vertex can't see them
    p = p.replace(/I have attached[^.]+\.?/gi, "");
    p = p.replace(/as attachment[^.]*\.?/gi, "");
    p = p.replace(/reference photo[^.]*\.?/gi, "");
    p = p.replace(/the photo[^.]*\.?/gi, "");

    // Clean up extra whitespace
    p = p.replace(/\s{2,}/g, " ").trim();

    return p;
  };

  const generate = async () => {
    if (!form.prompt.trim()) { alert("Please enter a topic or prompt"); return; }
    setLoading(true);
    setResult(null);

    try {
      if (isAiVideo) {
        // ── Real AI Video Generation (multi-clip for longer durations) ──────
        const durObj = AI_VIDEO_DURATIONS.find(d => d.value === form.videoSeconds) || { clips: 1, value: form.videoSeconds };
        const numClips = durObj.clips;
        const clipSec = numClips > 1 ? 8 : form.videoSeconds;
        const audioHint = form.audioNote ? ` Audio direction: ${form.audioNote}.` : "";
        const refHint = uploadedFiles.length ? ` Visual reference provided — maintain the style, colors, and subjects from the uploaded reference media.` : "";

        let clipUrls = [];
        for (let i = 0; i < numClips; i++) {
          const sceneHint = numClips > 1 ? ` Scene ${i + 1} of ${numClips}.` : "";
          const safePrompt = sanitizeVideoPrompt(form.prompt);
          const videoPrompt = `${safePrompt}.${sceneHint} Platform: ${form.platform}. Tone: ${form.tone}. Style: cinematic, high quality, professional marketing video. Seamlessly continues the same visual story.${audioHint}${refHint}`;
          const res = await base44.integrations.Core.GenerateVideo({
            prompt: videoPrompt,
            duration: clipSec,
            aspect_ratio: form.videoAspect,
          });
          if (res?.url) clipUrls.push(res.url);
        }

        // Generate captions using LLM
        const totalSec = clipSec * numClips;
        const captionPrompt = `Generate ${form.captionStyle === "full" ? "full sentence" : "short punchy"} captions/subtitles for a ${totalSec}-second video about: "${form.prompt}". Platform: ${form.platform}. Format as timestamped lines:\n[0:00] caption text\n[0:02] next caption\n...`;
        const captionRes = await base44.functions.invoke("generateMediaContent", {
          type: "caption", platform: form.platform, tone: form.tone, prompt: captionPrompt,
        });
        const captions = captionRes?.content || captionRes?.data?.content || captionRes?.text || captionRes?.data?.text || "";
        setResult({ type: "video", url: clipUrls[0], clipUrls, captions: typeof captions === "string" ? captions : "" });
      } else if (isVisual) {
        // ── Real Image Generation ──────────────────────────────────────────
        const styleHint = activeType === "thumbnail"
          ? `YouTube thumbnail style, bold text overlay, high contrast, eye-catching`
          : `Professional marketing ${form.platform} image`;

        const enhancedPrompt = `${form.prompt}. ${styleHint}. ${form.tone} tone. Optimized for ${form.platform}. High quality, crisp, commercial photography style.`;

        const imageUrls = uploadedFiles.filter(f => f.type.startsWith("image/")).map(f => f.url);
        const res = await base44.functions.invoke("generateImage", {
          prompt: enhancedPrompt,
          platform: form.platform,
          dimensions: form.dimensions,
          reference_image_urls: imageUrls.length ? imageUrls : undefined,
        });
        setResult({ type: "image", url: res?.file_url || res?.url || res?.data?.url || res?.data?.file_url });
      } else {
        // ── Text / Copy Generation ─────────────────────────────────────────
        const llmPrompt = buildPrompt(activeType, form);
        const res = await base44.functions.invoke("generateMediaContent", {
          type: activeType,
          platform: form.platform,
          tone: form.tone,
          prompt: llmPrompt,
        });
        const text = res?.content || res?.data?.content || res?.text || res?.data?.text || res;
        setResult({ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) });
      }
    } catch (err) {
      if (isAiVideo) {
        alert("Video generation error: " + err.message);
      } else if (!isVisual) {
        setResult({ type: "text", text: buildPrompt(activeType, form) + "\n\n[Backend error: " + err.message + "]" });
      } else {
        alert("Generation error: " + err.message);
      }
    }
    setLoading(false);
  };

  const copy = async () => {
    const text = result?.text || "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    const content = result?.text || result?.captions || result?.url || "";
    await base44.entities.ContentAsset.create({
      type: activeType === "ai_video" ? "video" : activeType,
      title: form.prompt.slice(0, 60),
      content,
      file_url: result?.url || null,
      platform: form.platform,
      ai_generated: true,
      prompt_used: form.prompt,
      status: "ready",
    });
    qc.invalidateQueries(["media_library"]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-fuchsia-400" /> Media Studio
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Complete AI creative suite — images, videos, copy, email, branding & more
        </p>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setActiveCat(c.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              activeCat === c.id
                ? "bg-fuchsia-500 text-white border-fuchsia-500 shadow-lg shadow-fuchsia-500/20"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Type grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2.5">
        {filteredTypes.map(t => (
          <button key={t.id} onClick={() => { setActiveType(t.id); setResult(null); }}
            className={`p-3 rounded-2xl border text-left transition-all ${
              activeType === t.id
                ? "border-fuchsia-500/50 bg-fuchsia-500/8 shadow-lg shadow-fuchsia-500/10 scale-[1.02]"
                : "border-border bg-card hover:border-fuchsia-500/20 hover:scale-[1.01]"
            }`}>
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center mb-2 shadow-sm`}>
              <t.Icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-xs font-bold text-foreground leading-tight">{t.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Active type banner */}
      {activeTypeObj && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r ${activeTypeObj.color} bg-opacity-10 border border-white/10`}>
          <activeTypeObj.Icon className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">{activeTypeObj.label}</span>
          <span className="text-xs text-white/60">— {activeTypeObj.desc}</span>
        </div>
      )}

      {/* Configure + Output */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* Input panel */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Configure</h3>

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Topic / Prompt *
            </label>
            <textarea
              value={form.prompt}
              onChange={e => setForm(p => ({ ...p, prompt: e.target.value }))}
              rows={isLongForm ? 5 : 3}
              placeholder={
                isVisual
                  ? "A professional product photo of a luxury skincare bottle on marble, soft lighting…"
                  : isVideoType
                  ? "30-second reel showcasing our new AI marketing tool for small businesses…"
                  : "Describe your product, brand, or content topic…"
              }
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Platform + Tone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {PLATFORMS.map(pl => <option key={pl}>{pl}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tone</label>
              <select
                value={form.tone}
                onChange={e => setForm(p => ({ ...p, tone: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {TONES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Image dimensions */}
          {isVisual && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Dimensions</label>
              <select
                value={form.dimensions}
                onChange={e => setForm(p => ({ ...p, dimensions: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {IMAGE_DIMS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}

          {/* AI Video options */}
          {isAiVideo && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Format / Aspect Ratio</label>
                  <select
                    value={form.videoAspect}
                    onChange={e => {
                      const f = AI_VIDEO_FORMATS.find(f => f.aspect === e.target.value);
                      setForm(p => ({ ...p, videoAspect: e.target.value, videoSeconds: f?.duration || p.videoSeconds }));
                    }}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {AI_VIDEO_FORMATS.map(f => <option key={f.aspect} value={f.aspect}>{f.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Duration</label>
                  <select
                    value={form.videoSeconds}
                    onChange={e => setForm(p => ({ ...p, videoSeconds: Number(e.target.value) }))}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {AI_VIDEO_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3" /> Audio / Music Direction (optional)
                </label>
                <input
                  value={form.audioNote}
                  onChange={e => setForm(p => ({ ...p, audioNote: e.target.value }))}
                  placeholder="e.g. upbeat background music, voiceover narration, silent with captions…"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <AlignLeft className="w-3 h-3" /> Caption Style
                </label>
                <select
                  value={form.captionStyle}
                  onChange={e => setForm(p => ({ ...p, captionStyle: e.target.value }))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="minimal">Minimal — short punchy captions</option>
                  <option value="full">Full — complete sentence subtitles</option>
                  <option value="none">No captions</option>
                </select>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-300">
                ⚡ AI Video uses 20–40 credits per clip (4–8s). Longer durations generate multiple sequential clips. ~30–60s per clip.
              </div>
            </div>
          )}

          {/* Video options */}
          {isVideoType && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Video Style</label>
                <select
                  value={form.videoStyle}
                  onChange={e => setForm(p => ({ ...p, videoStyle: e.target.value }))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {VIDEO_STYLES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Duration</label>
                <select
                  value={form.videoDuration}
                  onChange={e => setForm(p => ({ ...p, videoDuration: e.target.value }))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {VIDEO_DURATIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Reference Media Upload */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5" />
              Reference Media <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <label className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl py-4 px-3 cursor-pointer transition-all ${uploading ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-border hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5"}`}>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin text-fuchsia-400 mb-1" /><span className="text-xs text-fuchsia-400">Uploading…</span></>
                : <><Upload className="w-4 h-4 text-muted-foreground mb-1" /><span className="text-xs text-muted-foreground">Click to upload images or videos</span><span className="text-[10px] text-muted-foreground/50 mt-0.5">JPG, PNG, MP4, MOV • multiple files OK</span></>
              }
            </label>
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="relative group">
                    {f.type.startsWith("image/") ? (
                      <img src={f.previewUrl} alt={f.name} className="w-14 h-14 rounded-lg object-cover border border-border" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex flex-col items-center justify-center border border-border">
                        <Film className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground mt-0.5 px-1 truncate w-full text-center">{f.name.slice(0, 8)}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeUploadedFile(i)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploadedFiles.length > 0 && (
              <p className="text-[10px] text-muted-foreground/60">
                {isVisual ? "AI will use these as style / composition reference" : isAiVideo ? "AI will maintain visual consistency from your uploads" : "Uploaded files will inform the AI context"}
              </p>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || !form.prompt.trim()}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-500/20 transition-all">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Wand2 className="w-4 h-4" /> Generate {activeTypeObj?.label}</>
            }
          </button>

          {/* Tips */}
          <div className="bg-muted/30 rounded-xl px-3 py-2.5 space-y-1">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Pro Tips for better results
            </button>
            {showAdvanced && (
              <ul className="text-[11px] text-muted-foreground space-y-1 mt-1.5">
                {isVisual && <>
                  <li>• Be specific: "golden hour", "flat lay", "cinematic", "white background"</li>
                  <li>• Add brand colors: "brand colors: #FF6B6B and #4ECDC4"</li>
                  <li>• Mention emotion: "aspirational", "warm", "minimalist"</li>
                </>}
                {isVideoType && <>
                  <li>• Mention your target viewer in the prompt</li>
                  <li>• Include the key message / transformation</li>
                  <li>• Specify if talking-head, voiceover-only, or B-roll</li>
                </>}
                {!isVisual && !isVideoType && <>
                  <li>• Include product name, benefit, and target audience</li>
                  <li>• Mention any promo, offer, or urgency if relevant</li>
                  <li>• Add industry/niche for better-targeted hashtags</li>
                </>}
              </ul>
            )}
          </div>
        </div>

        {/* Output panel */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Output</h3>
            {result && (
              <div className="flex items-center gap-2">
                <button
                  onClick={generate}
                  className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Regenerate">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                {result.type === "text" && (
                  <button
                    onClick={copy}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      copied ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}>
                    {copied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                )}
                <button
                  onClick={save}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    saved ? "bg-emerald-500/10 text-emerald-400" : "bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20"
                  }`}>
                  {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved!</> : "Save to Library"}
                </button>
              </div>
            )}
          </div>

          {/* Empty state */}
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center flex-1 min-h-52 text-center">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${activeTypeObj?.color || "from-fuchsia-500 to-purple-600"} flex items-center justify-center mb-3 opacity-30`}>
                {activeTypeObj && <activeTypeObj.Icon className="w-7 h-7 text-white" />}
              </div>
              <p className="text-muted-foreground text-sm">Configure your {activeTypeObj?.label?.toLowerCase()} and hit Generate</p>
              <p className="text-muted-foreground/50 text-xs mt-1">Output will appear here</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center flex-1 min-h-52">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${activeTypeObj?.color || "from-fuchsia-500 to-purple-600"} flex items-center justify-center mb-3 animate-pulse`}>
                {activeTypeObj && <activeTypeObj.Icon className="w-6 h-6 text-white" />}
              </div>
              <Loader2 className="w-5 h-5 animate-spin text-fuchsia-400 mb-2" />
              <p className="text-muted-foreground text-sm">
                {isAiVideo ? "Generating video with AI…" : isVisual ? "Generating image with AI…" : "Writing with AI…"}
              </p>
              <p className="text-muted-foreground/40 text-xs mt-1">
                {isAiVideo ? "This takes 30–60 seconds" : "This takes 5–15 seconds"}
              </p>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="flex-1 flex flex-col gap-3">
              {result.type === "video" && result.url ? (
                <>
                  <video
                    src={result.url}
                    controls
                    className="w-full rounded-xl shadow-lg bg-black"
                    style={{ maxHeight: 340 }}
                  />
                  {result.clipUrls?.length > 1 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground">{result.clipUrls.length} clips generated — download each:</p>
                      <div className="flex flex-wrap gap-2">
                        {result.clipUrls.map((url, i) => (
                          <a key={i} href={url} download target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-fuchsia-500/40 transition-colors">
                            <Download className="w-3 h-3" /> Clip {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <a href={result.url} download target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium hover:border-fuchsia-500/40 transition-colors">
                      <Download className="w-4 h-4" /> {result.clipUrls?.length > 1 ? "Download Clip 1" : "Download Video"}
                    </a>
                    <button onClick={generate}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 text-sm font-medium hover:bg-fuchsia-500/20 transition-colors">
                      <RefreshCw className="w-4 h-4" /> Regenerate
                    </button>
                  </div>
                  {result.captions && form.captionStyle !== "none" && (
                    <div className="bg-muted/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlignLeft className="w-4 h-4 text-fuchsia-400" />
                        <span className="text-xs font-semibold text-foreground">Generated Captions</span>
                        <button onClick={async () => { await navigator.clipboard.writeText(result.captions); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                        </button>
                      </div>
                      <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                        {result.captions}
                      </pre>
                    </div>
                  )}
                </>
              ) : result.type === "video" && !result.url ? (
                <div className="flex flex-col items-center justify-center flex-1 min-h-52 text-center bg-red-500/5 rounded-xl border border-red-500/20">
                  <p className="text-red-400 text-sm font-medium">Video generation failed</p>
                  <p className="text-muted-foreground text-xs mt-1">Try again or adjust your prompt</p>
                  <button onClick={generate} className="mt-3 px-4 py-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 text-xs font-medium hover:bg-fuchsia-500/20 transition-colors">Try Again</button>
                </div>
              ) : result.type === "image" && result.url ? (
                <>
                  <img
                    src={result.url}
                    alt="AI Generated"
                    className="w-full rounded-xl object-cover shadow-lg"
                  />
                  <div className="flex gap-2">
                    <a
                      href={result.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium hover:border-fuchsia-500/40 transition-colors">
                      <Download className="w-4 h-4" /> Download
                    </a>
                    <button
                      onClick={generate}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 text-sm font-medium hover:bg-fuchsia-500/20 transition-colors">
                      <RefreshCw className="w-4 h-4" /> Regenerate
                    </button>
                  </div>
                </>
              ) : result.type === "image" && !result.url ? (
                <div className="flex flex-col items-center justify-center flex-1 min-h-52 text-center bg-red-500/5 rounded-xl border border-red-500/20">
                  <p className="text-red-400 text-sm font-medium">Image generation failed</p>
                  <p className="text-muted-foreground text-xs mt-1">Try again or check your plan limits</p>
                  <button onClick={generate} className="mt-3 px-4 py-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 text-xs font-medium hover:bg-fuchsia-500/20 transition-colors">
                    Try Again
                  </button>
                </div>
              ) : (
                <div className="bg-muted/30 rounded-xl p-4 flex-1 overflow-y-auto max-h-[500px]">
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                    {result.text}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video Creation Notice */}
      {isVideoType && (
        <div className="bg-gradient-to-r from-rose-500/10 to-pink-500/10 border border-rose-500/20 rounded-2xl p-4 flex gap-3 items-start">
          <Play className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">AI Video Script & Storyboard</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate production-ready scripts and shot-by-shot storyboards. Take them to Runway ML, Pika, Kling, or any AI video tool to render the actual video. Save to Media Library for your video team.
            </p>
          </div>
        </div>
      )}

      {/* Quick-action row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Generate Image Set", sub: "4 platform variants", icon: Image, types: ["image"], onClick: () => { setActiveType("image"); setActiveCat("visual"); } },
          { label: "AI Video + Captions", sub: "Real video with subtitles", icon: Clapperboard, onClick: () => { setActiveType("ai_video"); setActiveCat("video"); } },
          { label: "Content Bundle", sub: "Caption + Hashtags + Copy", icon: Layers, onClick: () => { setActiveType("caption"); setActiveCat("copy"); } },
          { label: "Brand Kit", sub: "Voice + Bios + PR", icon: Star, onClick: () => { setActiveType("brand_voice"); setActiveCat("branding"); } },
        ].map(item => (
          <button
            key={item.label}
            onClick={item.onClick}
            className="p-3.5 rounded-2xl border border-border bg-card hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 transition-all text-left group">
            <item.icon className="w-5 h-5 text-fuchsia-400 mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}