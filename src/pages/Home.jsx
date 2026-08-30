import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles, Megaphone, Share2, GitBranch, UserPlus, Globe,
  BarChart3, Zap, ArrowRight, Check, PlayCircle, Bot, Monitor,
  Menu, X, Send, MessageCircle, Mic, MicOff, Volume2, VolumeX, Wand2, Users,
  Film, Music, Sliders, PenTool, Briefcase, Clapperboard } from
"lucide-react";
import { BRAND } from "@/lib/brand";
import { useSeo, SEO, injectStructuredData } from "@/lib/seo";

const M_LOGO = "/favicon.png";

// Direct video file (mp4/webm) for the "Watch Demo" modal. Leave empty to show
// the in-app feature tour instead of a broken/placeholder embed.
const DEMO_VIDEO_URL = "https://media.base44.com/videos/public/69c3c2f5acaefc3a7afad5fd/916073a9e_demo-walkthrough.webm";

// Creative tools first — the primary experience — with marketing/CRM
// tools still fully present, just later in the grid.
const FEATURES = [
{ Icon: Film, title: "Movie Maker", desc: "Feature-length AI films: generate scripts, AI images per scene, full voiceover narration, background music, subtitles, and dubbing into any language.", colSpan: "md:col-span-2", color: "from-cyan-500 to-blue-600", badge: "Movie Maker Pro" },
{ Icon: Music, title: "Song Creator", desc: "Generate original song lyrics in any language, AI voiceover rendering with dubbing into any other language.", colSpan: "md:col-span-1", color: "from-violet-500 to-pink-600", badge: "Movie Maker Pro" },
{ Icon: Sliders, title: "AI Media Editor", desc: "Apply AI style presets to any image or video: cinematic grading, anime, pop art, and more. Add captions, music, and export directly to your library.", colSpan: "md:col-span-1", color: "from-sky-500 to-indigo-600", badge: "Movie Maker Pro" },
{ Icon: Wand2, title: "AI Content Studio", desc: "Generate images, videos, voiceovers, ad creatives and branded captions with AI, then assemble them into ready-to-post content in one place.", colSpan: "md:col-span-1", color: "from-fuchsia-500 to-purple-600" },
{ Icon: Monitor, title: "AI Demo Video Maker", desc: "Paste any website URL and AI scans it, writes a script, and assembles a narrated demo video — great for sales outreach, onboarding, and social proof.", colSpan: "md:col-span-1", color: "from-indigo-500 to-violet-600" },
{ Icon: PenTool, title: "Ad Creator", desc: "AI-generated ad copy and visuals for Instagram, TikTok, Facebook, LinkedIn, YouTube, and Google — post directly to any connected account after review.", colSpan: "md:col-span-1", color: "from-fuchsia-500 to-pink-600" },
{ Icon: Share2, title: "Social Scheduling", desc: "Connect Instagram, TikTok, LinkedIn, YouTube, Facebook & Pinterest with live connection verification. Visual content calendar.", colSpan: "md:col-span-1", color: "from-violet-500 to-indigo-600" },
{ Icon: GitBranch, title: "Funnel Builder", desc: "Drag-drop visual funnels. Automated follow-up sequences.", colSpan: "md:col-span-1", color: "from-amber-500 to-orange-600" },
{ Icon: Megaphone, title: "Bulk Messaging", desc: "Send thousands of SMS, WhatsApp & Email campaigns with real-time tracking.", colSpan: "md:col-span-2", color: "from-pink-500 to-rose-600" },
{ Icon: UserPlus, title: "Lead Capture", desc: "QR codes, forms, social leads. Score and nurture automatically.", colSpan: "md:col-span-1", color: "from-emerald-500 to-teal-600" },
{ Icon: Globe, title: "Website Scanner", desc: "Scan any website to extract brand voice, services and offers, then auto-generate ad creatives and campaign copy.", colSpan: "md:col-span-1", color: "from-cyan-500 to-blue-600" },
{ Icon: BarChart3, title: "Analytics & ROI", desc: "Track campaign performance, conversion rates, and revenue.", colSpan: "md:col-span-1", color: "from-red-500 to-rose-600" },
{ Icon: Users, title: "Brand & Agency Manager", desc: "Manage multiple brands or client workspaces, each with its own voice, colors and connected accounts.", colSpan: "md:col-span-1", color: "from-sky-500 to-cyan-600" },
{ Icon: Zap, title: "Automation Engine", desc: "Trigger sequences from form fills or stage changes. Fully automated.", colSpan: "md:col-span-1", color: "from-yellow-500 to-amber-600" }];


// Two lanes, priced for what they actually cost — full breakdown on
// /pricing. Kept intentionally light here (starting price + a few
// highlights) rather than duplicating every tier, so this teaser can't
// drift out of sync with the real price list on /pricing.
// Kept in sync with /studio's own lane chooser (Studio.jsx's LANES array) —
// same audience labels and names, so a visitor sees one consistent story
// from the marketing site through to the app itself.
const LANES = [
  {
    key: "business", name: "Quick Create", audience: "For Business / Marketing", icon: Briefcase,
    desc: "For businesses, influencers, and marketers — ad creatives, campaigns, and quick AI video on pooled platform credits, no per-minute AI billing.",
    fromPrice: 19, color: "from-fuchsia-500 to-purple-600",
    features: ["Pooled AI credits — images, short video, voiceover", "Ad Creator, Social Scheduling, Bulk Messaging", "Funnel Builder, Lead Capture & Analytics"],
  },
  {
    key: "movie-maker-pro", name: "Movie Maker Pro", audience: "For Film & Studios", icon: Clapperboard,
    desc: "For film studios, artists, and dubbing houses — feature-length AI films with per-scene AI video, music, dubbing, and lip-sync on weighted render-credits.",
    fromPrice: 99, color: "from-cyan-500 to-blue-600",
    features: ["Per-scene AI video (Kling / MiniMax)", "AI music, dubbing & lip-sync", "Finite render-credit pool, transparent overage"],
  },
];


const TESTIMONIALS = [
{ name: "Sarah M.", role: "Marketing Director", text: "DigitalStudios.app replaced 6 different tools. Our campaign output tripled in the first month.", rating: 5 },
{ name: "James K.", role: "Agency Owner", text: "Managing 20 clients from one dashboard. The funnel builder alone saved us 10 hours a week.", rating: 5 },
{ name: "Priya R.", role: "E-commerce Founder", text: "The AI media generation is insane. Professional ad creatives in minutes, not days.", rating: 5 }];


const SITE_KNOWLEDGE = `
You are Sree, the AI assistant for ${BRAND.name} — ${BRAND.tagline.toLowerCase()}.
PLATFORM OVERVIEW: ${BRAND.name} is an AI creative platform covering:
- Movie Maker: feature-length AI films — scripts, AI images per scene, voiceover narration, background music, subtitles, and dubbing into any language.
- Song Creator: original song lyrics in any language, AI voiceover rendering, and dubbing into any other language.
- AI Media Editor: style presets for any image or video, captions, background music.
- AI Content Studio: generate images, videos, voiceovers, ad creatives and branded captions, then assemble them into ready-to-post content.
- AI Demo Video Maker: paste any website URL and AI scans it, writes a narration script, and assembles a narrated demo video.
- Reference Library: carry a reference character or style across a whole project for consistent AI generation.
- Marketing tools are also included: Ad Creator, Social Scheduling, Bulk Messaging (Email/SMS/WhatsApp), Funnel Builder & Lead Capture, Website Scanner, Analytics & ROI tracking, and a Brand & Agency Manager for multiple brands or client workspaces.
PRICING: two lanes. Lane 1 Business (pooled AI credits) — Creator $19/mo, Starter $49/mo, Growth $149/mo, Agency $399/mo. Lane 2 Movie Maker Pro (weighted render-credits for per-scene AI video, dubbing, lip-sync) — Indie $99/mo, Studio $399/mo, Dubbing House $499/mo, Enterprise from $1,499/mo. A $49/mo BYOK add-on lets you bring your own Replicate/ElevenLabs/LLM key. All prices + applicable taxes. Free trial: 25 AI generations (~5 images or 3 short videos), no credit card required. Pay-as-you-go AI credits start at $10.
Always be helpful, concise (under 80 words). If asked about pricing, always mention the free trial.
`;

function SreeFloatBot({ accentColor }) {
  const [open, setOpen] = React.useState(false);
  const [msgs, setMsgs] = React.useState([{ role: "assistant", content: `Hi! I'm Sree 👋 I'm here to help you with ${BRAND.name}. Ask me about features, pricing, or how to get started!` }]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [speakerOn, setSpeakerOn] = React.useState(true);
  const [unread, setUnread] = React.useState(0);
  const endRef = React.useRef(null);
  const recogRef = React.useRef(null);
  const ac = accentColor;

  React.useEffect(() => {endRef.current?.scrollIntoView({ behavior: "smooth" });}, [msgs]);
  React.useEffect(() => {if (!open && msgs.length > 1) setUnread((u) => u + 1);}, [msgs]);
  React.useEffect(() => {if (open) setUnread(0);}, [open]);
  React.useEffect(() => {if (!open) window.speechSynthesis?.cancel();}, [open]);

  const speak = (text) => {
    if (!speakerOn || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0;utt.pitch = 1.0;utt.lang = "en-IN";
    window.speechSynthesis.speak(utt);
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (!next) window.speechSynthesis?.cancel();
  };

  const sendMsg = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    const history = [...msgs, { role: "user", content: msg }];
    setMsgs(history);
    setLoading(true);
    try {
      const res = await fetch("https://sreeagent.base44.app/functions/sriChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: history.slice(-8), systemPrompt: SITE_KNOWLEDGE })
      });
      const data = await res.json();
      const reply = data?.reply || data?.content || "How can I help you today?";
      setMsgs((h) => [...h, { role: "assistant", content: reply }]);
      speak(reply);
    } catch {
      setMsgs((h) => [...h, { role: "assistant", content: "Something went wrong. Please try again!" }]);
    }
    setLoading(false);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {alert("Voice input requires Chrome browser.");return;}
    window.speechSynthesis?.cancel();
    if (listening) {recogRef.current?.stop();return;}
    const r = new SR();
    recogRef.current = r;
    r.lang = "en-IN";r.continuous = false;r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onresult = (e) => {setListening(false);sendMsg(e.results[0][0].transcript);};
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
  };

  const QUICK = ["What features do you offer?", "Tell me about pricing", "How does AI content work?"];
  const btnBase = { border: "none", cursor: "pointer", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, flexShrink: 0, transition: "opacity 0.2s" };

  return (
    <>
      <style>{`
        @keyframes sree-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes sree-pulse-ring{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.6);opacity:0}}
        .sree-mic-pulse::before{content:'';position:absolute;inset:-6px;border-radius:50%;background:${ac}55;animation:sree-pulse-ring 1s ease-out infinite;}
        .glass-panel { background: rgba(10, 10, 10, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
      `}</style>

      <button onClick={() => setOpen((o) => !o)} className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-[0_6px_28px_rgba(217,70,239,0.3)]" style={{ background: `linear-gradient(135deg, ${ac}, ${ac}bb)` }}>
        {open ? <X size={22} color="white" /> : <MessageCircle size={24} color="white" />}
        {!open && unread > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{unread}</span>}
      </button>

      {open &&
      <div className="fixed bottom-[90px] right-6 z-[9998] w-[360px] max-h-[520px] h-[80vh] rounded-2xl flex flex-col glass-panel shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 p-3 border-b border-white/10 bg-white/5 shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg,${ac},${ac}99)` }}><Bot size={18} color="white" /></div>
            <div className="flex-1">
              <p className="m-0 text-[13px] font-bold text-white">Sree AI</p>
              <p className="m-0 text-[10px] text-emerald-400">● DigitalStudios.app · Online</p>
            </div>
            <button onClick={toggleSpeaker} style={{ ...btnBase, width: 30, height: 30, background: speakerOn ? `${ac}22` : "rgba(255,255,255,0.07)" }}>
              {speakerOn ? <Volume2 size={14} color={ac} /> : <VolumeX size={14} color="#666" />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
            {msgs.map((m, i) =>
          <div key={i} className={`flex gap-2 items-end ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg,${ac},${ac}88)` }}><Bot size={12} color="white" /></div>}
                <div className={`max-w-[82%] p-3 text-[13px] leading-relaxed ${m.role === "user" ? "rounded-[14px_14px_3px_14px] text-white" : "rounded-[3px_14px_14px_14px] bg-white/10 text-slate-200"}`} style={m.role === "user" ? { background: `linear-gradient(135deg,${ac},${ac}bb)` } : {}}>
                  {m.content}
                </div>
              </div>
          )}
            {loading &&
          <div className="flex gap-2 items-end">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg,${ac},${ac}88)` }}><Bot size={12} color="white" /></div>
                <div className="p-3 rounded-[3px_14px_14px_14px] bg-white/10 flex gap-1 items-center">
                  {[0, 1, 2].map((j) => <span key={j} className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block animate-pulse" style={{ animationDelay: `${j * 0.15}s` }} />)}
                </div>
              </div>
          }
            {msgs.length === 1 &&
          <div className="flex flex-col gap-1.5 mt-1">
                {QUICK.map((q) => <button key={q} onClick={() => sendMsg(q)} className="p-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-[11px] text-left hover:bg-white/10 transition-colors">{q}</button>)}
              </div>
          }
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-white/10 flex gap-2 shrink-0 items-center bg-black/20">
            <div className="relative shrink-0">
              {listening && <span className="sree-mic-pulse" />}
              <button onClick={startVoice} style={{ ...btnBase, background: listening ? "linear-gradient(135deg,#ef4444,#dc2626)" : `linear-gradient(135deg,${ac},${ac}bb)` }}>
                {listening ? <MicOff size={16} color="white" /> : <Mic size={16} color="white" />}
              </button>
            </div>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {if (e.key === "Enter") {e.preventDefault();sendMsg();}}} placeholder={listening ? "Listening..." : "Type or speak..."} disabled={loading} className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-white text-[13px] outline-none focus:border-fuchsia-500/50 transition-colors" />
            <button onClick={() => sendMsg()} disabled={!input.trim() || loading} style={{ ...btnBase, background: `linear-gradient(135deg,${ac},${ac}bb)`, opacity: !input.trim() || loading ? 0.4 : 1 }}>
              <Send size={15} color="white" />
            </button>
          </div>
        </div>
      }
    </>);

}

export default function Home() {
  useSeo(SEO.home);
  useEffect(() => { injectStructuredData(); }, []);

  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <>
    <div className="min-h-screen bg-[#050505] text-white selection:bg-fuchsia-500/30">

      {/* NAV */}
      <nav className={`fixed top-0 w-full z-40 transition-all duration-300 ${scrolled ? "border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center">
            
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <Link to="/auth" className="text-sm font-bold text-white/80 hover:text-white transition-colors">Sign In</Link>
            <Link to="/free-trial" className="text-sm font-bold px-6 py-2.5 rounded-full bg-white text-black hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              Start Free Trial
            </Link>
          </div>
          <button className="md:hidden p-2 text-white/70 hover:text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        
        {mobileOpen &&
          <div className="md:hidden bg-[#0a0a0a] border-b border-white/10 px-6 py-6 space-y-4 absolute w-full animate-in slide-in-from-top-4">
            {["features", "pricing", "testimonials"].map((s) =>
            <a key={s} href={`#${s}`} className="block text-base font-medium text-white/80 py-2 capitalize" onClick={() => setMobileOpen(false)}>{s}</a>
            )}
            <div className="pt-4 flex flex-col gap-3">
              <Link to="/auth" className="block text-center py-3 rounded-xl border border-white/10 font-bold">Sign In</Link>
              <Link to="/free-trial" className="block text-center py-3 rounded-xl bg-white text-black font-bold">Start Free Trial</Link>
            </div>
          </div>
          }
      </nav>

      {/* HERO */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 pt-32 pb-20 overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-fuchsia-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative max-w-5xl mx-auto text-center z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">

          {/* Brand lockup. Previously this was the opaque logo-wordmark JPEG
              blown up to 45vh full-bleed behind the copy, wrapped in
              .mask-fade-edges. That mask tops out at rgba(0,0,0,0.7), so
              combined with opacity-90 the logo never rendered above ~63%
              opacity, and its top and bottom dissolved completely — which read
              as the logo sitting *under* an overlay. animate-kenburns then
              scaled it 1.05→1.15, cropping the wordmark against the container.
              Now it uses /brand/wordmark.png (real alpha channel, cropped tight
              to the mark) at full opacity in normal flow, with the glow behind
              it rather than over it. */}
          <div className="relative flex justify-center mb-10">
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 mx-auto w-[130%] max-w-[820px] blur-[70px] opacity-60 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at center, rgba(217,70,239,0.28), transparent 70%)" }}
            />
            <img
              src="/brand/wordmark.png"
              alt={BRAND.name}
              width="956"
              height="189"
              className="w-full max-w-[300px] sm:max-w-[420px] md:max-w-[520px] h-auto object-contain drop-shadow-[0_2px_24px_rgba(0,0,0,0.55)]"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 text-xs font-bold mb-8 uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" /> The AI Creative Platform
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[1.1] tracking-tight mb-8">
            <span className="text-white">One AI studio for</span><br />
            <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              every creator.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Create feature-length AI movies with scenes, music, subtitles and dubbing. Generate images and songs. Dub any video into any language. Carry a reference character or style across a whole project — all in {BRAND.name}.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link to="/free-trial" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-black font-black text-base hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.15)]">
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </Link>
            <button onClick={() => setShowDemo(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-neutral-700 bg-neutral-900/50 text-white font-bold text-base hover:bg-neutral-800 transition-colors">
              <PlayCircle className="w-5 h-5 text-fuchsia-400" /> Watch Demo
            </button>
          </div>
          
          <div className="pt-10 border-t border-white/5">
            <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest mb-6">Replaces your entire stack</p>
            <div className="flex items-center justify-center gap-4 md:gap-8 flex-wrap opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
              {["Instagram", "TikTok", "LinkedIn", "YouTube", "Mailchimp", "Twilio"].map((p) =>
                <span key={p} className="text-sm md:text-base font-bold text-white">{p}</span>
                )}
            </div>
          </div>
        </div>
      </section>

      {/* BENTO BOX FEATURES */}
      <section id="features" className="py-32 px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">One studio. <span className="text-fuchsia-400">Every creative tool.</span></h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto">From feature-length AI films to marketing campaigns — create, dub, and launch without leaving {BRAND.name}.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) =>
              <div key={f.title} className={`${f.colSpan} p-8 rounded-3xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent hover:border-white/10 transition-colors group relative overflow-hidden`}>
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${f.color} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity`} />
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center shadow-lg`}>
                    <f.Icon className="w-6 h-6 text-white" />
                  </div>
                  {f.badge &&
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                      {f.badge}
                    </span>
                  }
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
                <p className="text-neutral-400 leading-relaxed">{f.desc}</p>
              </div>
              )}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">Simple pricing.<br /><span className="text-neutral-500">Unfair advantage.</span></h2>
          </div>
          
          {/* Credits callout */}
          <div className="mb-10 p-5 rounded-2xl border border-fuchsia-500/25 bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Zap className="w-5 h-5 text-fuchsia-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-white">Pay-as-you-go AI Credits</p>
                <p className="text-xs text-neutral-400 mt-0.5">No subscription needed. 1 credit = 1 AI image or video scene = $0.06. Packs from $10. Credits never expire.</p>
              </div>
            </div>
            <Link to="/pricing" className="shrink-0 px-4 py-2 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-bold hover:bg-fuchsia-500/30 transition-all whitespace-nowrap">
              View credit packs →
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-start max-w-3xl mx-auto">
            {LANES.map((lane) =>
              <div key={lane.key} className="relative rounded-3xl p-7 border border-white/10 bg-white/5 backdrop-blur-xl transition-transform hover:-translate-y-1 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${lane.color} flex items-center justify-center shadow-lg shrink-0`}>
                    <lane.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">{lane.audience}</p>
                </div>
                <h3 className="text-xl font-black text-white mb-1.5">{lane.name}</h3>
                <p className="text-neutral-400 text-xs mb-5">{lane.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-neutral-500 text-xs">From</span>
                  <span className="text-4xl font-black text-white">${lane.fromPrice}</span>
                  <span className="text-neutral-500 font-medium text-sm">/mo + tax</span>
                </div>
                <div className="space-y-3 mb-8 flex-1">
                  {lane.features.map((f) =>
                  <div key={f} className="flex items-start gap-2.5 text-xs text-neutral-300 font-medium">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-fuchsia-400" /> {f}
                    </div>
                  )}
                </div>
                <Link to="/pricing" className="block text-center py-3 rounded-xl font-bold text-sm transition-all bg-white/10 hover:bg-white/20 text-white">
                  View {lane.name} Pricing
                </Link>
              </div>
              )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 md:p-20 rounded-[3rem] border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/10 to-transparent relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-fuchsia-500/20 rounded-full blur-[100px] pointer-events-none" />
            <h2 className="text-4xl md:text-6xl font-black text-white mb-6 relative z-10 tracking-tight">Ready to create your first project?</h2>
            <p className="text-neutral-400 text-lg md:text-xl mb-10 relative z-10 max-w-2xl mx-auto">Join creators using {BRAND.name} to make AI movies, songs, and campaigns — all in one place.</p>
            <Link to="/free-trial" className="relative z-10 inline-flex items-center gap-2 px-10 py-5 rounded-full bg-white text-black font-black text-lg hover:scale-105 transition-transform shadow-[0_0_40px_rgba(255,255,255,0.2)]">
              Start Free Trial <ArrowRight className="w-6 h-6" />
            </Link>
            <p className="text-sm text-neutral-500 mt-6 relative z-10 font-medium">14-day free trial · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-12 px-6 bg-neutral-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <img src="/brand/wordmark.png" alt={BRAND.name} className="h-8 w-auto object-contain" onError={(e) => e.target.style.display = "none"} />
          </div>
          <div className="flex flex-wrap gap-6 text-sm font-medium items-center justify-center">
            <a href="mailto:care@aevoice.ai" className="text-neutral-400 hover:text-white transition-colors">care@aevoice.ai</a>
            <a href="https://aevoice.ai" className="text-neutral-400 hover:text-white transition-colors">aevoice.ai</a>
            <Link to="/agent-program" className="text-fuchsia-400 hover:text-fuchsia-300 transition-colors">🤝 Agent Program</Link>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-8 text-center md:text-left text-neutral-600 text-xs font-medium border-t border-white/5 pt-8">
          © 2026 {BRAND.name}. {BRAND.tagline}.
        </div>
      </footer>

      {/* CINEMATIC WATCH DEMO MODAL */}
      {showDemo &&
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-6xl overflow-hidden shadow-[0_0_100px_rgba(217,70,239,0.15)] relative flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md absolute top-0 w-full z-10">
              <h3 className="font-bold text-white flex items-center gap-3 text-lg">
                <Sparkles className="w-5 h-5 text-fuchsia-500" /> {BRAND.name}
              </h3>
              <button
                onClick={() => setShowDemo(false)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white backdrop-blur-md">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Container */}
            {DEMO_VIDEO_URL ?
            <div className="aspect-video w-full bg-black relative pt-[72px]">
                <video
                src={DEMO_VIDEO_URL}
                title={`${BRAND.name} Demo`}
                className="w-full h-full object-contain"
                controls
                autoPlay
                playsInline>
                </video>
              </div> : (

            /* Fallback product tour — shown until a real recorded demo video is added above */
            <div className="w-full bg-neutral-950 relative pt-[88px] pb-8 px-6 md:px-12 max-h-[80vh] overflow-y-auto">
                <div className="max-w-2xl mb-10 animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
                  <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">Everything you can create in one place.</h2>
                  <p className="text-fuchsia-400 font-medium mt-4 text-base md:text-xl">AI movies, songs, images, and dubbing — plus marketing tools, all built in.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  {FEATURES.map((f) =>
                <div key={f.title} className={`${f.colSpan} p-6 rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent relative overflow-hidden`}>
                      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${f.color} opacity-10 blur-3xl`} />
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                        <f.Icon className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                      <p className="text-neutral-400 text-sm leading-relaxed">{f.desc}</p>
                    </div>
                )}
                </div>
                <div className="mt-10 text-center">
                  <Link to="/free-trial" onClick={() => setShowDemo(false)} className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-black font-black text-base hover:scale-105 transition-transform">
                    Start Free Trial <ArrowRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>)
            }
          </div>
        </div>
        }


      {/* Universal Contact */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4 border-t border-border/30">
        <a href="tel:+12566998899" className="hover:text-foreground transition-colors flex items-center gap-1.5">
          <span>📞</span>
          <span>+1 256 699 8899</span>
          <span className="opacity-60">· {BRAND.name} AI Assistant 24/7</span>
        </a>
      </div>
    </div>
    <SreeFloatBot accentColor="#d946ef" />
    </>);

}