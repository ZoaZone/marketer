/**
 * SreeVoiceChatbot.jsx — Universal floating voice+text chatbot
 * Works across ALL AEVOICE ecosystem apps.
 * Drop in anywhere: import SreeVoiceChatbot from '@/components/SreeVoiceChatbot';
 * Usage: <SreeVoiceChatbot appContext="cream" clientId={clientId} />
 *
 * appContext options: "cream" | "os" | "health" | "marketer" | "aevothon" | "general"
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Mic, MicOff, Bot, User, Loader2, Minimize2, Zap } from 'lucide-react';

const SREE_ENGINE = "https://sreeagent.base44.app/functions/sreeAgenticEngine";

const APP_CONTEXTS = {
  cream: {
    name: "Sree AI",
    icon: "🎙️",
    gradient: "from-indigo-600 to-purple-600",
    shadow: "shadow-indigo-300/50",
    system: `You are Sree — the AI assistant for cream.aevoice.ai, an enterprise voice AI + CRM platform.
You help users: set up AI agents, manage calls and leads, configure phone numbers, build knowledge bases, view analytics, and navigate the platform.
App entities: Agency, Client, Agent, PhoneNumber, KnowledgeBase, Appointment, CallLog, Campaign, Lead.
Be concise, direct, and action-oriented.`,
    quickPrompts: ["How do I create a new agent?", "Show my recent call logs", "How do I set up a phone number?", "What's my active campaign status?"],
  },
  os: {
    name: "Sree Dev",
    icon: "⚡",
    gradient: "from-emerald-600 to-teal-600",
    shadow: "shadow-emerald-300/50",
    system: `You are Sree Dev — the AI developer brain for os.aevoice.ai (Sree OS).
You help users: write and push code, read entity data, run backend functions, manage the AEVOICE.AI ecosystem repos, and build features.
GitHub repos: ZoaZone/os-aevoice, ZoaZone/intelligent-aevoice, ZoaZone/health, ZoaZone/marketer, ZoaZone/aevothon-ai.
You are an executor, not just a chatbot. Tell users what you can DO.`,
    quickPrompts: ["Show WhiteGloveJob records", "Write a new backend function", "List all FreeUser records", "What repos do you manage?"],
  },
  health: {
    name: "HealthAI",
    icon: "💙",
    gradient: "from-blue-500 to-violet-600",
    shadow: "shadow-violet-300/50",
    system: `You are HealthAI — a compassionate AI health assistant for health.workautomation.app.
Help patients understand medications, lab results, health records, appointments. Help providers with clinical workflow, patient management.
CRITICAL: You are NOT a doctor. Never diagnose or prescribe. For emergencies, say: "Call 112/911 NOW."
Be warm, clear, and always recommend consulting a healthcare professional for medical decisions.`,
    quickPrompts: ["What do my medications do?", "Explain my lab result", "Book an appointment", "Show my upcoming appointments"],
  },
  marketer: {
    name: "Marketer AI",
    icon: "📣",
    gradient: "from-orange-500 to-pink-600",
    shadow: "shadow-pink-300/50",
    system: `You are Marketer AI — the AI assistant for media.aevoice.ai, an AI marketing platform.
Help users: create campaigns, write ad copy, generate social content, analyze leads, build funnels, and automate outreach.
Be creative, data-driven, and action-oriented.`,
    quickPrompts: ["Write an Instagram caption", "Analyze my campaign performance", "Generate 5 ad headlines", "Build a lead capture funnel"],
  },
  aevothon: {
    name: "Aevathon AI",
    icon: "🛠️",
    gradient: "from-cyan-500 to-blue-600",
    shadow: "shadow-blue-300/50",
    system: `You are Aevathon AI — the assistant for aevathon.aevoice.ai, a platform of AI-powered tools.
Help users discover, use, and combine AI tools for business automation, content creation, and data processing.`,
    quickPrompts: ["What tools are available?", "Help me automate my workflow", "Generate a business report", "What can Aevathon do?"],
  },
  general: {
    name: "Sree AI",
    icon: "✨",
    gradient: "from-slate-700 to-slate-900",
    shadow: "shadow-slate-300/50",
    system: `You are Sree — a universal AI assistant for the AEVOICE.AI ecosystem.
Help users with any question, task, or navigation need across the platform.`,
    quickPrompts: ["What is AEVOICE?", "How do I get started?", "What apps are available?", "Contact support"],
  },
};

export default function SreeVoiceChatbot({ appContext = "general", clientId = "", extraContext = "" }) {
  const ctx = APP_CONTEXTS[appContext] || APP_CONTEXTS.general;
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !greeted) {
      setGreeted(true);
      setMessages([{ role: "assistant", content: `Hi! I'm ${ctx.name} ${ctx.icon} How can I help you today?`, ts: new Date() }]);
    }
  }, [isOpen, greeted, ctx]);

  const buildSystem = () => extraContext ? `${ctx.system}\n\nCONTEXT:\n${extraContext}` : ctx.system;

  const sendMessage = async (text) => {
    if (!text?.trim() || isLoading) return;
    setMessages(prev => [...prev, { role: "user", content: text, ts: new Date() }]);
    setInput("");
    setIsLoading(true);
    try {
      const res = await fetch(SREE_ENGINE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
          system_prompt: buildSystem(),
          surface: `${appContext}_chatbot`,
          plan: "pro",
          client_id: clientId,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || "Sorry, I couldn't process that. Try again.", ts: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection issue. Please try again.", ts: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert("Voice input requires Chrome browser.");
      return;
    }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-IN";
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => { const t = e.results[0][0].transcript; setInput(t); sendMessage(t); };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  const fmt = (d) => d?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            onClick={() => setIsOpen(true)}
            className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br ${ctx.gradient} rounded-full shadow-lg ${ctx.shadow} flex items-center justify-center hover:scale-110 transition-transform`}
            title={`${ctx.name} — Click to chat`}>
            <span className="text-xl">{ctx.icon}</span>
            <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
            style={{ maxHeight: isMinimized ? "auto" : "560px" }}>

            {/* Header */}
            <div className={`bg-gradient-to-r ${ctx.gradient} px-4 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-lg">{ctx.icon}</div>
                <div>
                  <p className="text-white text-sm font-semibold">{ctx.name}</p>
                  <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" /><p className="text-white/70 text-xs">Online · AI powered</p></div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-white/20 rounded-lg"><Minimize2 className="w-4 h-4 text-white" /></button>
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg"><X className="w-4 h-4 text-white" /></button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: "380px" }}>
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className={`w-7 h-7 bg-gradient-to-br ${ctx.gradient} rounded-lg flex items-center justify-center text-xs shrink-0 mt-0.5`}>{ctx.icon}</div>
                      )}
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${msg.role === "user" ? "bg-gray-900 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-gray-400" : "text-gray-400"}`}>{fmt(msg.ts)}</p>
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 bg-gray-200 rounded-lg flex items-center justify-center shrink-0 mt-0.5"><User className="w-3.5 h-3.5 text-gray-500" /></div>
                      )}
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-2">
                      <div className={`w-7 h-7 bg-gradient-to-br ${ctx.gradient} rounded-lg flex items-center justify-center text-xs shrink-0`}>{ctx.icon}</div>
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
                        <div className="flex gap-1">
                          {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                        </div>
                      </div>
                    </div>
                  )}

                  {messages.length === 1 && (
                    <div className="space-y-1.5 pt-1">
                      {ctx.quickPrompts.map((q, i) => (
                        <button key={i} onClick={() => sendMessage(q)}
                          className="w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 rounded-xl px-3 py-2 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="border-t border-gray-100 p-3">
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type or speak..."
                      disabled={isLoading}
                      className="flex-1 text-sm bg-gray-100 border-0 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300 placeholder-gray-400 disabled:opacity-60" />
                    <button type="button" onClick={toggleVoice}
                      className={`p-2 rounded-xl transition-colors ${isListening ? "bg-red-100 text-red-500 animate-pulse" : "bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600"}`}>
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button type="submit" disabled={!input.trim() || isLoading}
                      className={`p-2 bg-gradient-to-r ${ctx.gradient} disabled:opacity-40 text-white rounded-xl transition-all`}>
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  <p className="text-[10px] text-gray-400 text-center mt-1.5">{ctx.name} · Powered by AEVOICE.AI</p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
