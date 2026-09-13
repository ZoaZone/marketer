import React from "react";
import { Bot, MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Sree, the site's AI assistant.
 *
 * This lived inside src/pages/Home.jsx and mounted its own launcher at
 * `fixed bottom-6 right-6 z-[9999]` -- the exact spot ContactWidget's launcher
 * already occupies (App.jsx, right/bottom 1.5rem, z-50), just painted on top
 * of it. So the landing page, and only the landing page, showed two round chat
 * buttons in one corner: the "two chat boxes, one on top and one at the
 * bottom" report.
 *
 * It is a component in its own right now, with an `embedded` mode: embedded it
 * renders only its body -- messages, quick questions and composer -- with no
 * launcher and no fixed shell, so ContactWidget can host it as a tab. The
 * default still gives the original standalone float for any caller that wants
 * one.
 */

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
PRICING: two lanes. Business (AI credits for images, short video, voiceover and campaigns) — Creator $19/mo (150 credits), Starter $49/mo (400), Growth $149/mo (1,250), Agency $399/mo (3,500). Studio & Dubbing (Render Minutes for per-scene AI video, commercial dubbing and lip-sync) — Indie $99/mo (60 Render Minutes), Studio $399/mo (250), Dubbing House $499/mo (400), Enterprise $1,499/mo (1,200, custom volume available). A $49/mo BYO Providers add-on lets you run jobs on your own Replicate/ElevenLabs/LLM keys; it is included free with Studio, Dubbing House and Enterprise. All prices + applicable taxes. Free trial: 25 AI generations (1 generation = 1 AI image or one voiceover up to 1,500 characters; enough for a few short narrated videos), no credit card required. Per-scene AI video, AI music and dubbing require a paid plan. Pay-as-you-go AI credits start at $10.
Always be helpful, concise (under 80 words). If asked about pricing, always mention the free trial.
`;

export default function SreeChat({ accentColor = "#d946ef", embedded = false }) {
  const [open, setOpen] = React.useState(embedded);
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

      {!embedded && (
      <button onClick={() => setOpen((o) => !o)} className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-[0_6px_28px_rgba(217,70,239,0.3)]" style={{ background: `linear-gradient(135deg, ${ac}, ${ac}bb)` }}>
        {open ? <X size={22} color="white" /> : <MessageCircle size={24} color="white" />}
        {!open && unread > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{unread}</span>}
      </button>
      )}

      {open &&
      <div className={embedded
        ? "h-[360px] flex flex-col glass-panel overflow-hidden"
        : "fixed bottom-[90px] right-6 z-[9998] w-[360px] max-h-[520px] h-[80vh] rounded-2xl flex flex-col glass-panel shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"}>
          {/* Embedded, the hosting panel supplies the title bar and close
              button; only the speaker toggle is worth repeating. */}
          <div className="flex items-center gap-3 p-3 border-b border-white/10 bg-white/5 shrink-0">
            {!embedded && (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg,${ac},${ac}99)` }}><Bot size={18} color="white" /></div>
            )}
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
