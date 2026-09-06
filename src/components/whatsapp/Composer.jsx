/**
 * Composer — the reply box.
 *
 * It knows one rule the agent should not have to remember: outside the
 * 24-hour customer service window WhatsApp refuses everything but an approved
 * template. Rather than let a reply be typed and rejected by Graph, the free
 * -text field disables itself and the composer points at the template picker.
 * The same rule is enforced server-side in whatsappSend — this is the
 * courteous half of it, not the load-bearing half.
 */
import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, FileText, Loader2, Lock, AlertCircle } from 'lucide-react';
import { formatWindowRemaining, withinServiceWindow } from '@/lib/whatsapp/payload';

const MAX_TEXT_LENGTH = 4096;
/** Grow the textarea to this many pixels, then scroll inside it. */
const MAX_TEXTAREA_PX = 140;

export default function Composer({
  conversation, sending, error, onSendText, onSendMedia, onOpenTemplates,
}) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const optedOut = !!conversation?.opted_out;
  const windowOpen = withinServiceWindow(conversation?.last_inbound_at);
  const canFreeForm = windowOpen && !optedOut;

  // Auto-grow, so a long reply is readable on a phone without a scroll war.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [text]);

  // Switching threads must not carry a half-typed reply to the wrong contact.
  useEffect(() => { setText(''); setAttachment(null); }, [conversation?.id]);

  const submit = async () => {
    if (sending) return;
    if (attachment) {
      await onSendMedia({ file: attachment, caption: text.trim() });
      setAttachment(null);
      setText('');
      return;
    }
    const body = text.trim();
    if (!body) return;
    setText('');
    await onSendText(body);
  };

  const onKeyDown = (e) => {
    // Enter sends on a physical keyboard; Shift+Enter is a newline. On touch
    // keyboards Enter inserts a newline and the send button is the way out.
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && window.matchMedia('(min-width: 768px)').matches) {
      e.preventDefault();
      submit();
    }
  };

  if (optedOut) {
    return (
      <div className="border-t border-slate-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-xs text-red-700">
        <Lock className="w-4 h-4 shrink-0" />
        This contact has opted out. Clear the opt-out flag before messaging them again.
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 bg-white">
      {!windowOpen && (
        <div className="px-4 py-2 bg-amber-50 text-[11px] text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          The 24-hour reply window has closed. Only an approved template can be sent now.
        </div>
      )}
      {windowOpen && (
        <div className="px-4 pt-2 text-[11px] text-slate-400">
          Free-form window closes in {formatWindowRemaining(conversation?.last_inbound_at)}
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 p-2 rounded-lg bg-red-50 text-red-700 text-[11px] flex gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error.message || String(error)}</span>
        </div>
      )}

      {attachment && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-slate-100 text-xs text-slate-600 flex items-center justify-between gap-2">
          <span className="truncate">{attachment.name}</span>
          <button type="button" onClick={() => setAttachment(null)} className="text-slate-400 hover:text-slate-700">
            Remove
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <button
          type="button"
          onClick={onOpenTemplates}
          aria-label="Send a template"
          className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
        >
          <FileText className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canFreeForm}
          aria-label="Attach a file"
          className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40 shrink-0"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setAttachment(file);
            e.target.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          disabled={!canFreeForm}
          maxLength={MAX_TEXT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={canFreeForm ? 'Type a reply…' : 'Use a template to reopen this conversation'}
          // 16px on mobile keeps iOS Safari from zooming when the field focuses.
          className="flex-1 resize-none px-3 py-2.5 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-2xl
                     focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400
                     disabled:bg-slate-100 disabled:text-slate-400"
        />

        <button
          type="button"
          onClick={submit}
          disabled={sending || (!attachment && !text.trim()) || !canFreeForm}
          aria-label="Send message"
          className="p-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700
                     disabled:opacity-40 disabled:hover:bg-emerald-600 shrink-0"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
