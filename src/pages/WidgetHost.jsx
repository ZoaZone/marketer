import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, X, MessageSquare, Volume2, VolumeX, Bot, Loader2 } from "lucide-react";

const SRI_FN     = "https://sreeagent.base44.app/functions/sriChat";
const TTS_FN     = "https://sreeagent.base44.app/functions/ttsStream";
const LOGO_URL   = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/692b24a5bac54e3067972063/2e8a22a03_AevoiceLogo.JPG";
const SITE_COLOR = "#d946ef";
const SITE_NAME  = "MARKETER";
const SITE_URL   = "https://media.aevoice.ai";
const SYSTEM_PROMPT = `You are Sree, the AI marketing assistant for MARKETER at media.aevoice.ai. MARKETER is an AI marketing OS — generates content, schedules to 10+ social platforms, runs bulk SMS/WhatsApp/email campaigns, builds funnels, captures leads. Plans: Starter $49, Growth $149, Agency $399. Keep answers under 80 words.`;

function getConfig() {
  const p = new URLSearchParams(window.location.search);
  return {
    name:    p.get("name")    || SITE_NAME,
    color:   p.get("color")   || SITE_COLOR,
    logo:    p.get("logo")    || LOGO_URL,
    mode:    p.get("mode")    || "both",  // "text" | "voice" | "both"
    prompt:  p.get("prompt")  || SYSTEM_PROMPT,
  };
}

export default function WidgetHost() {
  const cfg = getConfig();
  const [msgs, setMsgs]           = useState([{ role:"assistant", content:`Hi! I'm Sree, your AI assistant for ${cfg.name}. How can I help you today?` }]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking]   = useState(false);
  const [muted, setMuted]         = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle"); // idle | listening | processing | speaking
  const bottomRef  = useRef(null);
  const audioRef   = useRef(null);
  const recognRef  = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  // ── Text send ──
  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    const history = [...msgs, { role:"user", content:msg }];
    setMsgs(history);
    setLoading(true);
    try {
      const res = await fetch(SRI_FN, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ message:msg, history: history.slice(-8), systemPrompt: cfg.prompt })
      });
      const data = await res.json();
      const reply = data?.reply || data?.content || "I'm here to help — ask me anything!";
      setMsgs(h => [...h, { role:"assistant", content:reply }]);
      if (!muted && cfg.mode !== "text") speakText(reply);
    } catch {
      setMsgs(h => [...h, { role:"assistant", content:"Something went wrong. Please try again!" }]);
    }
    setLoading(false);
  };

  // ── TTS ──
  const speakText = async (text) => {
    setSpeaking(true); setVoiceStatus("speaking");
    try {
      // Try TTS backend first, fallback to browser TTS
      const res = await fetch(TTS_FN, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ text, voice:"alloy" })
      });
      if (res.ok) {
        const buf  = await res.arrayBuffer();
        const blob = new Blob([buf], { type:"audio/mp3" });
        const url  = URL.createObjectURL(blob);
        audioRef.current?.pause();
        const a = new Audio(url); audioRef.current = a;
        a.onended = () => { setSpeaking(false); setVoiceStatus("idle"); URL.revokeObjectURL(url); };
        a.play();
        return;
      }
    } catch {}
    // Browser TTS fallback
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0; utt.pitch = 1.0;
    utt.onend = () => { setSpeaking(false); setVoiceStatus("idle"); };
    window.speechSynthesis.speak(utt);
  };

  const stopSpeaking = () => {
    audioRef.current?.pause();
    window.speechSynthesis.cancel();
    setSpeaking(false); setVoiceStatus("idle");
  };

  // ── STT ──
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser. Please use Chrome."); return; }
    stopSpeaking();
    const r = new SR();
    recognRef.current = r;
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onstart  = () => { setListening(true); setVoiceStatus("listening"); };
    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false); setVoiceStatus("processing");
      setTimeout(() => send(transcript), 300);
    };
    r.onerror  = () => { setListening(false); setVoiceStatus("idle"); };
    r.onend    = () => { setListening(false); if (voiceStatus === "listening") setVoiceStatus("idle"); };
    r.start();
  };

  const stopListening = () => {
    recognRef.current?.stop();
    setListening(false); setVoiceStatus("idle");
  };

  const statusLabel = { idle:"", listening:"Listening...", processing:"Processing...", speaking:"Speaking..." };

  return (
    <div style={{ fontFamily:"Inter,sans-serif", background:"#050d1a", minHeight:"100vh", display:"flex", flexDirection:"column", color:"white" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes bounce {0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes spin {from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes pulse {0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
        .dot-bounce { animation: bounce 1s ease-in-out infinite; }
        .spin { animation: spin 1.5s linear infinite; }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:4px; }
      `}</style>

      {/* Header */}
      <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"rgba(255,255,255,0.02)", display:"flex", alignItems:"center", gap:"12px", flexShrink:0 }}>
        <div style={{ width:40, height:40, borderRadius:12, overflow:"hidden", border:`1px solid ${cfg.color}44`, flexShrink:0 }}>
          <img src={cfg.logo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontWeight:700, fontSize:14, margin:0 }}>Sree AI</p>
          <p style={{ fontSize:11, color:cfg.color, margin:0, opacity:0.8 }}>MARKETER</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={()=>setMuted(!muted)} title={muted?"Unmute":"Mute"}
            style={{ background:"none", border:"none", cursor:"pointer", color:muted?"#64748b":cfg.color, padding:4 }}>
            {muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
          </button>
          <div style={{ width:8, height:8, borderRadius:"50%", background:listening||speaking?"#10b981":"#64748b" }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 12px", display:"flex", flexDirection:"column", gap:10 }}>
        {msgs.map((m,i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", gap:8, alignItems:"flex-end" }}>
            {m.role==="assistant" && (
              <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${cfg.color},${cfg.color}99)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Bot size={14} color="white"/>
              </div>
            )}
            <div style={{ maxWidth:"78%", padding:"10px 14px", borderRadius:m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px", fontSize:13, lineHeight:1.5,
              background:m.role==="user" ? `linear-gradient(135deg,${cfg.color},${cfg.color}bb)` : "rgba(255,255,255,0.05)",
              color:m.role==="user"?"white":"#cbd5e1" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${cfg.color},${cfg.color}99)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Bot size={14} color="white"/>
            </div>
            <div style={{ background:"rgba(255,255,255,0.05)", padding:"10px 14px", borderRadius:"4px 16px 16px 16px", display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(j => <span key={j} className="dot-bounce" style={{ width:6, height:6, borderRadius:"50%", background:"#64748b", display:"inline-block", animationDelay:`${j*0.15}s` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Voice status bar */}
      {voiceStatus !== "idle" && (
        <div style={{ textAlign:"center", padding:"6px", fontSize:12, color:cfg.color, background:"rgba(255,255,255,0.02)", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
          {listening && <span className="pulse" style={{display:"inline-block"}}>🎙️</span>} {statusLabel[voiceStatus]}
        </div>
      )}

      {/* Input area */}
      <div style={{ padding:"12px", borderTop:"1px solid rgba(255,255,255,0.06)", background:"rgba(255,255,255,0.02)", display:"flex", gap:8, alignItems:"flex-end" }}>
        {cfg.mode !== "text" && (
          <button onClick={listening ? stopListening : startListening}
            className={listening ? "pulse" : ""}
            style={{ width:40, height:40, borderRadius:12, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              background: listening ? `linear-gradient(135deg,#ef4444,#dc2626)` : `linear-gradient(135deg,${cfg.color},${cfg.color}bb)` }}>
            {listening ? <MicOff size={16} color="white"/> : <Mic size={16} color="white"/>}
          </button>
        )}
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); } }}
          placeholder="Ask me anything..."
          rows={1}
          style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"10px 12px", color:"white", fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", lineHeight:1.5 }} />
        <button onClick={()=>send()} disabled={!input.trim()||loading}
          style={{ width:40, height:40, borderRadius:12, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, opacity:(!input.trim()||loading)?0.4:1,
            background:`linear-gradient(135deg,${cfg.color},${cfg.color}bb)` }}>
          {loading ? <Loader2 size={16} color="white" className="spin"/> : <Send size={16} color="white"/>}
        </button>
      </div>

      {/* Powered by */}
      <div style={{ textAlign:"center", padding:"8px", fontSize:10, color:"#334155" }}>
        Powered by Sree AI · <a href="https://aevoice.ai" style={{color:"#334155"}} target="_blank">AEVOICE.AI</a>
      </div>
    </div>
  );
}
