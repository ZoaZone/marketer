/**
 * WhatsAppInbox — the CRM inbox for the "Hello Biz" WABA (+1 256 699-8899).
 *
 * Layout is one responsive rule applied twice:
 *
 *   < 768px   one pane at a time. The list is the screen; opening a thread
 *             replaces it, Back returns. Contact controls are a slide-over.
 *   ≥ 768px   list + conversation side by side.
 *   ≥ 1280px  list + conversation + a permanent contact/controls column.
 *
 * The open thread lives in the URL (/whatsapp-inbox/:conversationId) so a
 * conversation can be shared, bookmarked, or reopened by the PWA shortcut, and
 * so the phone's back gesture does the obvious thing.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Radio, WifiOff, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import ConversationList from '@/components/whatsapp/ConversationList';
import ConversationPanel from '@/components/whatsapp/ConversationPanel';
import ContactPanel from '@/components/whatsapp/ContactPanel';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';

const BUSINESS_NUMBER = '+1 (256) 699-8899';

export default function WhatsAppInbox() {
  const navigate = useNavigate();
  const { conversationId = '' } = useParams();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const inbox = useWhatsAppInbox({ conversationId, search });

  const selectConversation = useCallback((id) => {
    navigate(`/whatsapp-inbox/${id}`);
    setDetailsOpen(false);
  }, [navigate]);

  const goBack = useCallback(() => {
    navigate('/whatsapp-inbox');
    setDetailsOpen(false);
  }, [navigate]);

  // Closing a thread on mobile should also dismiss anything layered over it.
  useEffect(() => {
    if (!conversationId) { setDetailsOpen(false); setTemplatesOpen(false); }
  }, [conversationId]);

  const waId = inbox.conversation?.wa_id || '';

  const handleSendText = useCallback(
    (body) => inbox.sendText({ to: waId, body }), [inbox, waId],
  );
  const handleSendMedia = useCallback(
    ({ file, caption }) => inbox.sendMedia({ to: waId, file, caption }), [inbox, waId],
  );
  const handleSendTemplate = useCallback(async (template) => {
    await inbox.sendTemplate({ to: waId, ...template });
    setTemplatesOpen(false);
  }, [inbox, waId]);

  const showList = !isMobile || !conversationId;
  const showThread = !isMobile || !!conversationId;

  return (
    // 100dvh rather than 100vh: on iOS Safari the dynamic viewport unit is what
    // keeps the composer above the URL bar instead of behind it.
    <div className="h-[100dvh] flex flex-col bg-slate-100">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-900 leading-tight">WhatsApp Inbox</h1>
            <p className="text-[11px] text-slate-400 truncate">Hello Biz · {BUSINESS_NUMBER}</p>
          </div>
        </div>

        <span
          title={inbox.connection === 'live'
            ? 'Streaming live updates'
            : 'Streaming unavailable — polling every few seconds'}
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium shrink-0
            ${inbox.connection === 'live' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
        >
          {inbox.connection === 'live' ? <Radio className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {inbox.connection === 'live' ? 'Live' : 'Polling'}
        </span>
      </header>

      <div className="flex-1 flex min-h-0">
        {showList && (
          <aside className="w-full md:w-80 lg:w-96 shrink-0 border-r border-slate-200 min-h-0">
            <ConversationList
              conversations={inbox.conversations}
              activeId={conversationId}
              onSelect={selectConversation}
              search={search}
              onSearchChange={setSearch}
              filter={filter}
              onFilterChange={setFilter}
              loading={inbox.isLoadingConversations}
              error={inbox.conversationsError}
              onRefresh={inbox.refetchConversations}
              unreadTotal={inbox.unreadTotal}
            />
          </aside>
        )}

        {showThread && (
          <main className="flex-1 min-w-0 min-h-0">
            <ConversationPanel
              conversation={inbox.conversation}
              contact={inbox.contact}
              messages={inbox.messages}
              loading={inbox.isLoadingThread}
              error={inbox.threadError}
              connection={inbox.connection}
              sending={inbox.isSending}
              sendError={inbox.sendError}
              onSendText={handleSendText}
              onSendMedia={handleSendMedia}
              onBack={goBack}
              onOpenDetails={() => setDetailsOpen(true)}
              onOpenTemplates={() => setTemplatesOpen(true)}
            />
          </main>
        )}

        {/* Permanent metadata column on wide screens only. */}
        {inbox.conversation && (
          <aside className="hidden xl:block w-80 shrink-0 border-l border-slate-200 min-h-0">
            <ContactPanel
              conversation={inbox.conversation}
              contact={inbox.contact}
              busy={inbox.isSwitchingMode}
              autopilotConfigured={inbox.autopilotConfigured}
              onClaim={() => inbox.claim(conversationId)}
              onRelease={() => inbox.release(conversationId)}
              onSaveContact={inbox.saveContact}
              onToggleStatus={() => inbox.setStatus({
                id: conversationId,
                next: inbox.conversation.status === 'closed' ? 'open' : 'closed',
              })}
            />
          </aside>
        )}
      </div>

      {/* Same panel as a slide-over below xl. */}
      {detailsOpen && inbox.conversation && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            aria-label="Close contact panel"
            onClick={() => setDetailsOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm shadow-xl">
            <ContactPanel
              conversation={inbox.conversation}
              contact={inbox.contact}
              busy={inbox.isSwitchingMode}
              autopilotConfigured={inbox.autopilotConfigured}
              onClaim={() => inbox.claim(conversationId)}
              onRelease={() => inbox.release(conversationId)}
              onSaveContact={inbox.saveContact}
              onToggleStatus={() => inbox.setStatus({
                id: conversationId,
                next: inbox.conversation.status === 'closed' ? 'open' : 'closed',
              })}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
        </div>
      )}

      <TemplatePicker
        open={templatesOpen && !!inbox.conversation}
        templates={inbox.templates}
        error={inbox.templatesError}
        sending={inbox.isSending}
        onClose={() => setTemplatesOpen(false)}
        onSend={handleSendTemplate}
      />

      {inbox.conversationsError && !inbox.conversations.length && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2
                        rounded-xl bg-slate-900 text-white text-xs shadow-lg">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Inbox unavailable — check that the WhatsApp functions are deployed.
        </div>
      )}
    </div>
  );
}
