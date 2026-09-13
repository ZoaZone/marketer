import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, CheckCircle2, ExternalLink, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { BRAND } from '@/lib/brand';
import { whatsappContactUrl } from '@/lib/whatsapp/contactLink';
import { WhatsAppGlyph } from '@/components/whatsapp/WhatsAppContactButton';
import TurnstileWidget from '@/components/TurnstileWidget';
import SreeChat from '@/components/support/SreeChat';

/**
 * The single "talk to us" surface for the whole app.
 *
 * Earlier this app pinned a floating WhatsApp button of its own to the
 * corner with nothing to stack above (the chat launcher it was written to
 * sit next to was never actually mounted — see App.jsx), and had no other
 * way for a visitor to reach a human. This replaces both gaps with one
 * launcher and one panel with two ways to reach us:
 *
 * - Chat: a real form backed by the same public `captureLeadFromForm`
 *   function every other lead source on this site already uses — no new
 *   backend, and it inherits that function's IP rate-limit + Turnstile gate.
 * - WhatsApp: the existing wa.me deep link (src/lib/whatsapp/contactLink.js)
 *   to the platform's real shared business number. Free, no Meta API cost,
 *   and deliberately manual — this is not the automated WhatsApp CRM inbox
 *   at /whatsapp-inbox, which is a paid-tier product feature for this app's
 *   own customers, not a support channel for this app's own visitors.
 *
 * - Ask Sree: the site's AI assistant. It used to float its own launcher from
 *   inside Home.jsx at `fixed bottom-6 right-6 z-[9999]`, directly over this
 *   widget's launcher, so the landing page showed two round chat buttons in
 *   one corner. It is a tab here now (SreeChat, in `embedded` mode so it
 *   contributes only its body).
 *
 * No "Call" tab: there is no telephony number or infra behind this app to
 * point one at.
 */
export default function ContactWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('sree');

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            role="dialog"
            aria-label={`Contact ${BRAND.name}`}
            className="fixed z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-card text-card-foreground rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
            style={{
              right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
              maxHeight: '520px',
            }}
          >
            <div className="bg-gradient-to-r from-fuchsia-500 to-purple-600 px-4 py-3 flex items-center justify-between shrink-0">
              <div>
                <p className="text-white text-sm font-semibold">Chat with {BRAND.name}</p>
                <p className="text-white/70 text-xs">We usually reply within a few hours</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1.5 hover:bg-white/20 rounded-lg text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex border-b border-border shrink-0">
              <TabButton active={tab === 'sree'} onClick={() => setTab('sree')} icon={<Sparkles className="w-4 h-4" />} label="Ask Sree" />
              <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={<MessageCircle className="w-4 h-4" />} label="Message" />
              <TabButton active={tab === 'whatsapp'} onClick={() => setTab('whatsapp')} icon={<WhatsAppGlyph className="w-4 h-4" />} label="WhatsApp" />
            </div>

            <div className="flex-1 overflow-y-auto">
              {tab === 'sree' ? <SreeChat embedded /> : tab === 'chat' ? <ChatTab /> : <WhatsAppTab />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : `Chat with ${BRAND.name}`}
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        }}
        className="fixed z-50 w-14 h-14 rounded-full shadow-lg shadow-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform motion-reduce:transition-none motion-reduce:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'open'}
            initial={{ opacity: 0, rotate: -30 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 30 }}
            transition={{ duration: 0.15 }}
          >
            {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
        (active
          ? 'border-fuchsia-500 text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground')
      }
    >
      {icon}
      {label}
    </button>
  );
}

function ChatTab() {
  const [form, setForm] = useState({ full_name: '', email: '', message: '' });
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !form.message.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await base44.functions.invoke('captureLeadFromForm', {
        form_data: {
          full_name: form.full_name,
          email: form.email,
          message: form.message,
          description: form.message,
          source: 'website',
          utm_source: 'chat_widget',
        },
        turnstile_token: turnstileToken,
      });
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="p-6 flex flex-col items-center text-center gap-2">
        <CheckCircle2 className="w-9 h-9 text-emerald-500" />
        <p className="font-semibold text-foreground">Message sent</p>
        <p className="text-sm text-muted-foreground">
          Thanks, {form.full_name.split(' ')[0]} — we'll get back to you at {form.email}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
      <input
        value={form.full_name}
        onChange={set('full_name')}
        placeholder="Your name"
        required
        className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400"
      />
      <input
        type="email"
        value={form.email}
        onChange={set('email')}
        placeholder="Your email"
        required
        className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400"
      />
      <textarea
        value={form.message}
        onChange={set('message')}
        placeholder="How can we help?"
        required
        rows={3}
        className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400 resize-none"
      />
      <TurnstileWidget onToken={setTurnstileToken} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Send message
      </button>
    </form>
  );
}

function WhatsAppTab() {
  const href = whatsappContactUrl({ appName: BRAND.name, service: BRAND.tagline });
  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Message us on WhatsApp and we'll reply as soon as we can. This opens WhatsApp with a note already started.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold bg-[#25D366] hover:bg-[#1FB855] transition-colors"
      >
        <WhatsAppGlyph className="w-4 h-4" />
        Continue on WhatsApp
        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
      </a>
    </div>
  );
}
