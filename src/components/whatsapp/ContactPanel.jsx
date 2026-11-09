/**
 * ContactPanel — the metadata column: who this is, how they are being
 * handled, and the CRM fields an agent edits while talking to them.
 *
 * On desktop it sits beside the thread; on mobile WhatsAppInbox renders it as
 * a slide-over, because a permanent third column on a phone leaves no room for
 * the conversation itself.
 */
import { useEffect, useState } from 'react';
import { Save, X, Tag, Phone, Clock, Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import AgentModeToggle from './AgentModeToggle';
import { formatPhone, formatWindowRemaining, withinServiceWindow } from '@/lib/whatsapp/payload';

export default function ContactPanel({
  conversation, contact, busy, autopilotConfigured,
  onClaim, onRelease, onSaveContact, onToggleStatus, onClose,
}) {
  const [displayName, setDisplayName] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [optedOut, setOptedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reload the form whenever a different contact is opened. Keyed on id so an
  // in-flight edit is not clobbered by a background refetch of the same row.
  useEffect(() => {
    setDisplayName(contact?.display_name || '');
    setTagsText((contact?.tags || []).join(', '));
    setNotes(contact?.notes || '');
    setOptedOut(!!contact?.opted_out);
    setSaved(false);
    // Deliberately keyed on the id alone. contact.tags is a fresh array on
    // every refetch, so depending on the fields themselves would reset the
    // form under the agent mid-edit every few seconds.
  }, [contact?.id]);

  const save = async () => {
    if (!contact?.id) return;
    setSaving(true);
    try {
      await onSaveContact({
        id: contact.id,
        patch: {
          display_name: displayName,
          tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
          notes,
          opted_out: optedOut,
        },
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const closed = conversation?.status === 'closed';
  const windowOpen = withinServiceWindow(conversation?.last_inbound_at);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <h3 className="text-sm font-semibold text-slate-900">Contact & controls</h3>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close panel"
                  className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AgentModeToggle
          mode={conversation?.handling_mode}
          claimedByEmail={conversation?.claimed_by_email}
          autopilotConfigured={autopilotConfigured}
          busy={busy}
          onClaim={onClaim}
          onRelease={onRelease}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium">{formatPhone(contact?.phone_e164 || conversation?.wa_id)}</span>
          </div>
          {contact?.profile_name && (
            <p className="text-slate-500">WhatsApp profile: {contact.profile_name}</p>
          )}
          <div className="flex items-center gap-2 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {windowOpen
                ? `Reply window: ${formatWindowRemaining(conversation?.last_inbound_at)} left`
                : 'Reply window closed — templates only'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Display name</span>
            <input
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
              placeholder={contact?.profile_name || 'Unnamed contact'}
              className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tags (comma separated)
            </span>
            <input
              value={tagsText}
              onChange={(e) => { setTagsText(e.target.value); setSaved(false); }}
              placeholder="lead, vip, support"
              className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Notes</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
              className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl resize-y
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={optedOut}
              onChange={(e) => { setOptedOut(e.target.checked); setSaved(false); }}
              className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500/30"
            />
            Opted out — block all outbound messages
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving || !contact?.id}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white
                       text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : 'Save contact'}
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleStatus}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200
                     bg-white text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {closed ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          {closed ? 'Reopen conversation' : 'Close conversation'}
        </button>
      </div>
    </div>
  );
}
