import React from 'react';
import { Link , useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Sparkles, Megaphone, Share2, GitBranch, UserPlus, Globe, BarChart3, Zap, ArrowRight, Check, Star, Play, Bot, Image, FileText, Mail, Phone, Instagram, Youtube, Menu, X, Send, Loader2, MessageSquare, Mic, MicOff, Volume2, VolumeX, MessageCircle } from "lucide-react";

const M_LOGO = "https://media.base44.com/images/public/69b1f1d60b1fb9d791fddc64/d1aa347a6_generated_image.png";

const FEATURES = [
  { Icon: Sparkles,  title: "AI Media Creation",    desc: "Generate images, videos, scripts, ad creatives, captions and brand kits with AI in seconds.", color: "from-fuchsia-500 to-purple-600" },
  { Icon: Megaphone, title: "Bulk Messaging",        desc: "Send thousands of SMS, WhatsApp & Email campaigns with one click. Real-time delivery tracking.", color: "from-pink-500 to-rose-600" },
  { Icon: Share2,    title: "Social Scheduling",     desc: "Connect Instagram, TikTok, LinkedIn, YouTube. AI-writes captions. Visual content calendar.", color: "from-violet-500 to-indigo-600" },
  { Icon: GitBranch, title: "Funnel Builder",        desc: "Drag-drop visual funnels. Automated follow-up sequences triggered by lead behavior.", color: "from-amber-500 to-orange-600" },
  { Icon: UserPlus,  title: "Lead Capture",          desc: "QR codes, forms, social leads. Score, tag, and nurture with AI-suggested follow-ups.", color: "from-emerald-500 to-teal-600" },
  { Icon: Globe,     title: "Web & App Projects",    desc: "Manage client website and app builds. Brief → design → launch, all tracked in one place.", color: "from-blue-500 to-cyan-600" },
  { Icon: BarChart3, title: "Analytics & ROI",       desc: "Campaign performance, funnel conversion rates, lead source breakdown, revenue attribution.", color: "from-red-500 to-rose-600" },
  { Icon: Zap,       title: "Automation Engine",     desc: "Trigger sequences from form fills, link clicks, no-replies or stage changes. Fully automated.", color: "from-yellow-500 to-amber-600" },
];

const PLANS = [
  { name: "Starter", price: 49, desc: "Small businesses", features: ["1 Client", "500 AI generations/mo", "1,000 messages/mo", "3 social accounts", "Basic funnels"], popular: false },
  { name: "Growth",  price: 149, desc: "Growing teams",   features: ["5 Clients", "2,500 AI generations/mo", "10,000 messages/mo", "15 social accounts", "Website scanner", "Priority support"], popular: true },
  { name: "Agency",  price: 399, desc: "Full agencies",   features: ["Unlimited clients", "10,000 AI generations/mo", "50,000 messages/mo", "Unlimited socials", "White-label", "API access", "Dedicated manager"], popular: false },
];

const TESTIMONIALS = [
  { name: "Sarah M.", role: "Marketing Director", text: "media.aevoice.ai replaced 6 different tools. Our campaign output tripled in the first month.", rating: 5 },
  { name: "James K.", role: "Agency Owner", text: "Managing 20 clients from one dashboard. The funnel builder alone saved us 10 hours a week.", rating: 5 },
  { name: "Priya R.", role: "E-commerce Founder", text: "The AI media generation is insane. Professional ad creatives in minutes, not days.", rating: 5 },
];

// ─────────────────────────────────────────────────────────────────
// SreeFloatBot — floating voice+text chatbot with mic, speaker, site knowledge
// (icons imported at top of file)

const SITE_KNOWLEDGE = `
You are Sree, the AI assistant for media.aevoice.ai — an AI-powered marketing OS platform.

PLATFORM OVERVIEW:
media.aevoice.ai is an all-in-one AI marketing platform for agencies, brands, and marketers.

KEY FEATURES:
- AI Media Studio: Generate images, videos, ad copy, captions, hashtags, email/SMS templates, blog posts, brand kits using AI
- Video Editor: AI-powered video creation and editing
- Ad Creator: AI-generated ad creatives for Facebook, Instagram, Google, TikTok
- Script Writer: AI scripts for video, ads, email sequences, cold outreach
- Website Scanner: AI analysis of any website for SEO, content, competitor insights
- Social Hub: Schedule and publish to Instagram, Facebook, TikTok, LinkedIn, YouTube, Twitter/X, Pinterest
- Campaigns: Bulk email, SMS, WhatsApp campaigns with analytics (open rate, click rate, replies)
- Funnel Builder: Visual drag-and-drop funnel creation with stages and automation
- Lead Capture: Capture leads from any source with forms, QR codes, and UTM tracking
- Follow-Up Automation: Multi-step sequences via email, SMS, WhatsApp triggered by lead actions
- Analytics: Full marketing performance dashboard — leads, campaigns, conversions, social reach
- Media Library: Store all AI-generated and uploaded assets in one place
- Web & App Projects: Track web and mobile app development projects
- Agency Portal: Multi-client agency management with sub-accounts

PRICING PLANS:
- Starter: $49/month — 1 brand, 1,000 contacts, 5,000 messages/month, AI content, social scheduling
- Growth: $149/month — 5 brands, 10,000 contacts, 50,000 messages/month, advanced AI, funnels
- Agency: $399/month — Unlimited brands/clients, 100,000+ messages, white-label, priority support, API access
- All plans: 14-day free trial, no credit card required, cancel anytime

BETA ACCESS:
Currently in beta — users can request early access at /beta. Approved users get full Agency-tier free for 1 year.

INTEGRATIONS:
Email (SendGrid, Resend), SMS (Twilio), WhatsApp (Meta BSP), Stripe payments, all major social platforms.

CONTACT & SUPPORT:
- Email: care@aevoice.ai | hello@aevoice.ai
- Website: https://media.aevoice.ai
- Parent company: AEVOICE.AI

QUICK NAVIGATION:
- /dashboard — Main dashboard
- /media-studio — AI content creation
- /campaigns — Email/SMS/WhatsApp campaigns
- /social-hub — Social scheduling
- /funnel-builder — Build marketing funnels
- /analytics — Performance analytics
- /pricing — View and upgrade plans
- /beta — Request beta access

Always be helpful, concise (under 80 words), and guide users to relevant features or pages. If asked about pricing, always mention the free trial.
`;

function SreeFloatBot({ accentColor }) {
  const [open, setOpen]         = React.useState(false);
  const [msgs, setMsgs]         = React.useState([{ role: "assistant", content: "Hi! I'm Sree 👋 I'm here to help you with media.aevoice.ai. Ask me about features, pricing, or how to get started!" }]);
  const [input, setInput]       = React.useState("");
  const [loading, setLoading]   = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [speakerOn, setSpeakerOn] = React.useState(true);
  const [unread, setUnread]     = React.useState(0);
  const endRef   = React.useRef(null);
  const recogRef = React.useRef(null);
  const ac = accentColor;

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  React.useEffect(() => { if (!open && msgs.length > 1) setUnread(u => u + 1); }, [msgs]);
  React.useEffect(() => { if (open) setUnread(0); }, [open]);
  // Cancel speech when closed
  React.useEffect(() => { if (!open) window.speechSynthesis?.cancel(); }, [open]);

  const speak = (text) => {
    if (!speakerOn || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0; utt.pitch = 1.0; utt.lang = "en-IN";
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
      setMsgs(h => [...h, { role: "assistant", content: reply }]);
      speak(reply);
    } catch {
      setMsgs(h => [...h, { role: "assistant", content: "Something went wrong. Please try again!" }]);
    }
    setLoading(false);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome browser."); return; }
    window.speechSynthesis?.cancel();
    if (listening) { recogRef.current?.stop(); return; }
    const r = new SR();
    recogRef.current = r;
    r.lang = "en-IN"; r.continuous = false; r.interimResults = false;
    r.onstart  = () => setListening(true);
    r.onresult = (e) => { const t = e.results[0][0].transcript; setListening(false); sendMsg(t); };
    r.onerror  = () => setListening(false);
    r.onend    = () => setListening(false);
    r.start();
  };

  const QUICK = ["What features do you offer?", "Tell me about pricing", "How do I get beta access?", "How does AI content work?"];

  const btnBase = {
    border: "none", cursor: "pointer", borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 36, height: 36, flexShrink: 0, transition: "opacity 0.2s",
  };

  return React.createElement(React.Fragment, null,
    // CSS animations
    React.createElement("style", null,
      `@keyframes sree-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
       @keyframes sree-pulse-ring{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.6);opacity:0}}
       .sree-mic-pulse::before{content:'';position:absolute;inset:-6px;border-radius:50%;background:${ac}55;animation:sree-pulse-ring 1s ease-out infinite;}`
    ),

    // ── FAB ──
    React.createElement("button", {
      onClick: () => setOpen(o => !o),
      style: {
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        width: 56, height: 56, borderRadius: "50%", border: "none",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${ac}, ${ac}bb)`,
        boxShadow: `0 6px 28px ${ac}55, 0 2px 8px rgba(0,0,0,0.4)`,
        transition: "transform 0.2s", position: "fixed",
      },
      onMouseEnter: e => { e.currentTarget.style.transform = "scale(1.1)"; },
      onMouseLeave: e => { e.currentTarget.style.transform = "scale(1)"; },
    },
      React.createElement(MessageCircle, { size: 24, color: "white", style: open ? { display: "none" } : {} }),
      open && React.createElement(X, { size: 22, color: "white" }),
      !open && unread > 0 && React.createElement("span", {
        style: {
          position: "absolute", top: -3, right: -3,
          width: 20, height: 20, borderRadius: "50%",
          background: "#ef4444", color: "white",
          fontSize: 10, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
        }
      }, unread)
    ),

    // ── Chat panel ──
    open && React.createElement("div", {
      style: {
        position: "fixed", bottom: 92, right: 24, zIndex: 9998,
        width: 360, maxHeight: 520,
        borderRadius: 20, overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "rgba(5,10,22,0.97)",
        border: `1px solid ${ac}33`,
        boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${ac}22`,
        backdropFilter: "blur(20px)",
        fontFamily: "Inter, system-ui, sans-serif",
      }
    },
      // Header
      React.createElement("div", {
        style: {
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          background: `linear-gradient(135deg, ${ac}22, transparent)`,
          borderBottom: `1px solid ${ac}22`, flexShrink: 0,
        }
      },
        React.createElement("div", {
          style: { width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${ac},${ac}99)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }
        }, React.createElement(Bot, { size: 18, color: "white" })),
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 700, color: "white" } }, "Sree AI"),
          React.createElement("p", { style: { margin: 0, fontSize: 10, color: "#10b981" } }, "● media.aevoice.ai · Online")
        ),
        // Speaker toggle
        React.createElement("button", {
          onClick: toggleSpeaker,
          title: speakerOn ? "Mute speaker" : "Unmute speaker",
          style: { ...btnBase, width: 30, height: 30, background: speakerOn ? `${ac}22` : "rgba(255,255,255,0.07)", border: `1px solid ${speakerOn ? ac+'44' : 'rgba(255,255,255,0.1)'}` },
        }, speakerOn
          ? React.createElement(Volume2, { size: 14, color: ac })
          : React.createElement(VolumeX, { size: 14, color: "#666" })
        ),
      ),

      // Messages
      React.createElement("div", {
        style: { flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }
      },
        msgs.map((m, i) =>
          React.createElement("div", {
            key: i,
            style: { display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap: 6, alignItems: "flex-end" }
          },
            m.role === "assistant" && React.createElement("div", {
              style: { width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${ac},${ac}88)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }
            }, React.createElement(Bot, { size: 12, color: "white" })),
            React.createElement("div", {
              style: {
                maxWidth: "82%", padding: "8px 12px", fontSize: 12.5, lineHeight: 1.55,
                borderRadius: m.role === "user" ? "14px 14px 3px 14px" : "3px 14px 14px 14px",
                background: m.role === "user" ? `linear-gradient(135deg,${ac},${ac}bb)` : "rgba(255,255,255,0.06)",
                color: m.role === "user" ? "white" : "#d1d9e8",
              }
            }, m.content)
          )
        ),
        loading && React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "flex-end" } },
          React.createElement("div", { style: { width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${ac},${ac}88)`, display: "flex", alignItems: "center", justifyContent: "center" } },
            React.createElement(Bot, { size: 12, color: "white" })
          ),
          React.createElement("div", { style: { padding: "8px 12px", borderRadius: "3px 14px 14px 14px", background: "rgba(255,255,255,0.06)", display: "flex", gap: 3, alignItems: "center" } },
            [0,1,2].map(j => React.createElement("span", { key: j, style: { width: 5, height: 5, borderRadius: "50%", background: "#475569", display: "inline-block", animation: "sree-bounce 1s ease-in-out infinite", animationDelay: j*0.15+"s" } }))
          )
        ),
        msgs.length === 1 && React.createElement("div", {
          style: { display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }
        },
          QUICK.map(q => React.createElement("button", {
            key: q, onClick: () => sendMsg(q),
            style: { padding: "6px 10px", borderRadius: 10, border: `1px solid ${ac}25`, background: `${ac}0d`, color: "#9ca3af", fontSize: 11, cursor: "pointer", textAlign: "left" }
          }, q))
        ),
        React.createElement("div", { ref: endRef })
      ),

      // Input row
      React.createElement("div", {
        style: { padding: "8px 10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }
      },
        // Mic button with pulse ring when listening
        React.createElement("div", { style: { position: "relative", flexShrink: 0 } },
          listening && React.createElement("span", { className: "sree-mic-pulse" }),
          React.createElement("button", {
            onClick: startVoice,
            title: listening ? "Stop listening" : "Click to speak",
            style: {
              ...btnBase, position: "relative",
              background: listening ? "linear-gradient(135deg,#ef4444,#dc2626)" : `linear-gradient(135deg,${ac},${ac}bb)`,
              boxShadow: listening ? "0 0 12px rgba(239,68,68,0.5)" : `0 0 10px ${ac}44`,
            }
          }, listening
            ? React.createElement(MicOff, { size: 16, color: "white" })
            : React.createElement(Mic, { size: 16, color: "white" })
          )
        ),
        // Text input
        React.createElement("input", {
          value: input,
          onChange: e => setInput(e.target.value),
          onKeyDown: e => { if (e.key === "Enter") { e.preventDefault(); sendMsg(); } },
          placeholder: listening ? "Listening..." : "Type or tap mic to speak...",
          disabled: loading,
          style: {
            flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${listening ? ac+'44' : 'rgba(255,255,255,0.09)'}`,
            borderRadius: 10, padding: "8px 10px", color: "white", fontSize: 12, outline: "none", fontFamily: "inherit",
          }
        }),
        // Send button
        React.createElement("button", {
          onClick: () => sendMsg(),
          disabled: !input.trim() || loading,
          style: { ...btnBase, background: `linear-gradient(135deg,${ac},${ac}bb)`, opacity: (!input.trim() || loading) ? 0.4 : 1 }
        }, React.createElement(Send, { size: 15, color: "white" }))
      )
    )
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <>
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">

      {/* NAV */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl" : ""}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={M_LOGO} alt="M" className="w-8 h-8 rounded-lg" onError={(e) => e.target.style.display="none"} />
            <span className="text-xl font-black tracking-tight bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">media.aevoice.ai</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Reviews</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/dashboard" className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2">Sign In</Link>
            <Link to="/pricing" className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:opacity-90 transition-opacity shadow-lg shadow-fuchsia-500/25">
              Start Free Trial
            </Link>
          </div>
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="md:hidden bg-[#0a0a0a] border-t border-white/10 px-6 py-4 space-y-3">
            {["features","pricing","testimonials"].map(s => (
              <a key={s} href={`#${s}`} className="block text-sm text-white/70 py-2 capitalize" onClick={() => setMobileOpen(false)}>{s}</a>
            ))}
            <Link to="/pricing" className="block text-center text-sm font-semibold px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 mt-2">
              Start Free Trial
            </Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-16">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-fuchsia-500/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-purple-500/6 rounded-full blur-[80px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-pink-500/6 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 text-xs font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" /> AI-Powered Marketing OS — media.aevoice.ai
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
            <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
              Your entire marketing<br />
            </span>
            <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              team in one app.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            AI media creation, bulk SMS/WhatsApp/email, social scheduling, funnel builder, lead capture, and follow-up automation — all in one platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/pricing" className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-base hover:opacity-90 transition-opacity shadow-2xl shadow-fuchsia-500/30">
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/dashboard" className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/15 text-white/80 font-medium text-base hover:border-white/30 hover:text-white transition-all">
              <Play className="w-4 h-4" /> See Demo
            </Link>
          </div>
          <p className="text-xs text-white/30 mt-4">No credit card required · 14-day free trial · Cancel anytime</p>

          {/* Platform logos */}
          <div className="mt-16 flex items-center justify-center gap-6 flex-wrap opacity-40">
            {["Instagram", "TikTok", "LinkedIn", "YouTube", "Facebook", "WhatsApp", "Gmail", "Twilio"].map(p => (
              <span key={p} className="text-xs text-white/60 font-medium px-3 py-1.5 border border-white/10 rounded-full">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Everything you need.<br /><span className="text-white/40">Nothing you don't.</span></h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto">Replace your entire marketing stack with one intelligent platform.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-5 rounded-2xl border border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5 transition-all group">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <f.Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-white mb-4">Simple pricing.<br /><span className="text-white/40">Powerful results.</span></h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`relative rounded-2xl p-6 border ${
                plan.popular
                  ? "border-fuchsia-500/50 bg-fuchsia-500/8 shadow-2xl shadow-fuchsia-500/20"
                  : "border-white/10 bg-white/3"
              }`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-full text-xs font-bold text-white shadow-lg">
                    Most Popular
                  </div>
                )}
                <p className="text-white/50 text-sm mb-1">{plan.desc}</p>
                <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-white">${plan.price}</span>
                  <span className="text-white/40 text-sm mb-1">/month</span>
                </div>
                <div className="space-y-2.5 mb-8">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-white/70">
                      <Check className="w-4 h-4 text-fuchsia-400 flex-shrink-0" /> {f}
                    </div>
                  ))}
                </div>
                <Link to="/pricing" className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all ${
                  plan.popular
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:opacity-90 shadow-lg"
                    : "border border-white/15 text-white/80 hover:border-white/30"
                }`}>
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-white mb-4">Loved by marketers.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="p-6 rounded-2xl border border-white/8 bg-white/3">
                <div className="flex gap-1 mb-4">
                  {[...Array(t.rating)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-white/70 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{t.name}</p>
                  <p className="text-white/40 text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-12 rounded-3xl border border-fuchsia-500/20 bg-fuchsia-500/5">
            <h2 className="text-4xl font-black text-white mb-4">Ready to 10x your marketing?</h2>
            <p className="text-white/50 mb-8">Join thousands of businesses using media.aevoice.ai to automate, create and grow.</p>
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-base hover:opacity-90 shadow-2xl shadow-fuchsia-500/30">
              Start Your Free Trial <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="text-xs text-white/30 mt-4">14-day free trial · No credit card required · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={M_LOGO} alt="M" className="w-6 h-6 rounded" onError={(e) => e.target.style.display="none"} />
            <span className="font-black text-white/80 text-sm">media.aevoice.ai</span>
            <span className="text-white/30 text-xs ml-2">by AEVOICE</span>
          </div>
          <p className="text-white/30 text-xs">© 2026 AEVOICE · "The omnichannel AI platform for voice calls, SMS, web chat, WhatsApp, email, and social media." · Part of AEVOICE.AI. All rights reserved · media.aevoice.ai</p>
          <div className="flex flex-wrap gap-4 text-xs text-white/40 items-center">
            <a href="mailto:care@aevoice.ai" className="hover:text-white/70">care@aevoice.ai</a>
            <a href="https://aevoice.ai" className="hover:text-white/70">aevoice.ai</a>
            <Link to="/agent-program" className="hover:text-fuchsia-400 font-semibold text-white/50 transition-colors">🤝 Agent Program — Earn 50%</Link>
            <Link to="/agency-enquiry" className="hover:text-purple-400 font-semibold text-white/50 transition-colors">🏢 Agency Enquiry</Link>
          </div>
        </div>
      <p className="text-center text-xs text-slate-600 mt-4">Part of AEVOICE.AI — The ultimate business technology.</p>
</footer>
    </div>
      <SreeFloatBot accentColor="#d946ef" />
  </>
  );
}