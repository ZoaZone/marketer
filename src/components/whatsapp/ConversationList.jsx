/**
 * ConversationList — the inbox sidebar: threads newest-first, with unread
 * counts, the phone number, contact tags and who (or what) is handling each.
 *
 * On phones this is a full-screen view rather than a sidebar; WhatsAppInbox
 * swaps between it and the conversation panel instead of showing both.
 */
import { useMemo } from 'react';
import { Search, MessageSquare, Bot, UserCheck, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { formatPhone, relativeTime } from '@/lib/whatsapp/payload';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'human', label: 'Mine' },
  { key: 'closed', label: 'Closed' },
];

function initialsOf(name, waId) {
  const source = (name || '').trim();
  if (source) {
    return source.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }
  return String(waId || '?').slice(-2);
}

function ConversationRow({ conversation, active, onSelect }) {
  const name = conversation.name || formatPhone(conversation.phone_e164 || conversation.wa_id);
  const unread = conversation.unread_count > 0;
  const isHuman = conversation.handling_mode === 'human';

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={active ? 'true' : undefined}
      className={`w-full text-left px-4 py-3 flex gap-3 items-start border-b border-slate-100 transition-colors
        ${active ? 'bg-emerald-50/70' : 'hover:bg-slate-50 active:bg-slate-100'}`}
    >
      <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold
        ${isHuman ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {initialsOf(conversation.name, conversation.wa_id)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>
            {name}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">
            {relativeTime(conversation.last_message_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`truncate text-xs ${unread ? 'text-slate-700' : 'text-slate-400'}`}>
            {conversation.last_message_direction === 'outbound' && (
              <span className="text-slate-400">You: </span>
            )}
            {conversation.last_message_preview || 'No messages yet'}
          </span>
          {unread && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium
            ${isHuman ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {isHuman ? <UserCheck className="w-2.5 h-2.5" /> : <Bot className="w-2.5 h-2.5" />}
            {isHuman ? 'Human' : 'AI'}
          </span>
          {conversation.opted_out && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
              <AlertCircle className="w-2.5 h-2.5" /> Opted out
            </span>
          )}
          {(conversation.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

export default function ConversationList({
  conversations, activeId, onSelect, search, onSearchChange,
  filter, onFilterChange, loading, error, onRefresh, unreadTotal,
}) {
  const visible = useMemo(() => {
    if (filter === 'unread') return conversations.filter((c) => c.unread_count > 0);
    if (filter === 'human') return conversations.filter((c) => c.handling_mode === 'human');
    if (filter === 'closed') return conversations.filter((c) => c.status === 'closed');
    // "All" hides closed threads — they are archive, not inbox.
    return conversations.filter((c) => c.status !== 'closed');
  }, [conversations, filter]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            Conversations
            {unreadTotal > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-semibold">
                {unreadTotal}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh conversations"
            className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, number or tag"
            // 16px min prevents iOS Safari from zooming the viewport on focus.
            className="w-full pl-9 pr-3 py-2 text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
        </div>

        <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                ${filter === f.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        {loading && !conversations.length && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {!loading && !visible.length && !error && (
          <div className="px-6 py-12 text-center">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No conversations here yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Messages sent to +1 (256) 699-8899 land in this list.
            </p>
          </div>
        )}

        {visible.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
