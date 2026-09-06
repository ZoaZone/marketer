/**
 * ConversationPanel — the chat stream: header, message list, composer.
 *
 * Scroll behaviour is the fiddly part. It pins to the bottom on new messages,
 * but only when the agent is already reading the bottom — yanking the view
 * down while someone is scrolled up reading history is the classic chat-UI
 * annoyance, so a manual scroll-up suppresses auto-scroll until they come
 * back down.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Info, Bot, UserCheck, Loader2, MessageSquare, Radio, WifiOff } from 'lucide-react';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import { formatDayLabel, formatPhone, groupByDay } from '@/lib/whatsapp/payload';

/** How close to the bottom still counts as "reading the bottom". */
const PIN_THRESHOLD_PX = 120;

function ConnectionBadge({ connection }) {
  const live = connection === 'live';
  return (
    <span
      title={live ? 'Live stream connected' : 'Polling for new messages'}
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium
        ${live ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
    >
      {live ? <Radio className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
      {live ? 'Live' : 'Polling'}
    </span>
  );
}

export default function ConversationPanel({
  conversation, contact, messages, loading, error, connection,
  sending, sendError, onSendText, onSendMedia,
  onBack, onOpenDetails, onOpenTemplates,
}) {
  const scrollRef = useRef(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pinned]);

  // A new thread always opens at its newest message.
  useEffect(() => { setPinned(true); }, [conversation?.id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX);
  };

  if (!conversation) {
    return (
      <div className="hidden md:flex flex-col items-center justify-center h-full bg-slate-50 text-center px-8">
        <MessageSquare className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">Pick a conversation to start replying.</p>
        <p className="text-xs text-slate-400 mt-1">
          Inbound messages to +1 (256) 699-8899 appear on the left as they arrive.
        </p>
      </div>
    );
  }

  const name = conversation.name || formatPhone(conversation.phone_e164 || conversation.wa_id);
  const isHuman = conversation.handling_mode === 'human';

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-0">
      <header className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden p-2 -ml-1 text-slate-500 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 truncate">{name}</h2>
            <ConnectionBadge connection={connection} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="truncate">{formatPhone(conversation.phone_e164 || conversation.wa_id)}</span>
            <span className={`inline-flex items-center gap-1 font-medium
              ${isHuman ? 'text-indigo-600' : 'text-emerald-600'}`}>
              {isHuman ? <UserCheck className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
              {isHuman ? 'Human' : 'AI auto-pilot'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDetails}
          aria-label="Contact details and controls"
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg xl:hidden"
        >
          <Info className="w-5 h-5" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overscroll-contain py-3 space-y-2 min-h-0"
      >
        {loading && !messages.length && (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && (
          <p className="mx-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs">{error}</p>
        )}

        {groupByDay(messages).map((group) => (
          <div key={group.day} className="space-y-2">
            <div className="flex justify-center">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                {formatDayLabel(group.day)}
              </span>
            </div>
            {group.messages.map((message) => (
              <MessageBubble key={message.id || message.wamid} message={message} />
            ))}
          </div>
        ))}

        {!loading && !messages.length && !error && (
          <p className="text-center text-xs text-slate-400 py-10">No messages in this thread yet.</p>
        )}
      </div>

      <Composer
        conversation={{ ...conversation, opted_out: contact?.opted_out ?? conversation.opted_out }}
        sending={sending}
        error={sendError}
        onSendText={onSendText}
        onSendMedia={onSendMedia}
        onOpenTemplates={onOpenTemplates}
      />
    </div>
  );
}
