/**
 * MessageBubble — one message in the thread.
 *
 * Three authors read differently and are styled to match: the contact (left,
 * white), a human agent (right, green — the familiar WhatsApp outbound), and
 * an automated reply (right, indigo, labelled). Telling an automated reply
 * from a colleague's at a glance is the whole point of running a bot and a
 * human inbox on one number.
 */
import { useState } from 'react';
import {
  Check, CheckCheck, Clock, AlertTriangle, Bot, FileText, Download, Loader2,
} from 'lucide-react';
import { resolveMedia } from '@/api/whatsappAPI';

const STATUS_ICON = {
  queued: Clock,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: AlertTriangle,
};

function timeLabel(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Media lives behind a Graph URL that expires in minutes and needs the system
 * token, so nothing is prefetched — the agent asks for an attachment and the
 * backend resolves it right then.
 */
function MediaAttachment({ message }) {
  const [url, setUrl] = useState(message.media_url || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isImage = (message.media_mime || '').startsWith('image/');
  const isAudio = (message.media_mime || '').startsWith('audio/');

  const load = async () => {
    if (!message.media_id || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await resolveMedia(message.media_id);
      if (!res.url) throw new Error('No download URL returned');
      setUrl(res.url);
    } catch (err) {
      setError(err?.message || 'Could not load attachment');
    } finally {
      setLoading(false);
    }
  };

  if (!message.media_id && !url) return null;

  if (url && isImage) {
    return <img src={url} alt={message.media_filename || 'Attachment'} className="rounded-lg max-w-full mb-1" />;
  }
  if (url && isAudio) {
    return <audio controls src={url} className="w-full mb-1">Your browser cannot play this audio.</audio>;
  }
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer"
         className="flex items-center gap-2 text-xs underline mb-1 break-all">
        <Download className="w-3.5 h-3.5 shrink-0" />
        {message.media_filename || 'Open attachment'}
      </a>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        {message.media_filename || `Load ${message.message_type}`}
      </button>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const outbound = message.direction === 'outbound';
  const fromBot = message.author === 'ai_agent';
  const StatusIcon = STATUS_ICON[message.status] || Check;
  const failed = message.status === 'failed';

  const tone = !outbound
    ? 'bg-white text-slate-800 border border-slate-200'
    : fromBot
      ? 'bg-indigo-600 text-white'
      : 'bg-emerald-600 text-white';

  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'} px-3`}>
      <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${tone}
        ${outbound ? 'rounded-br-md' : 'rounded-bl-md'}`}>

        {fromBot && (
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-80 mb-1">
            <Bot className="w-3 h-3" />
            {message.message_type === 'template' ? 'Automatic acknowledgement' : 'Automated reply'}
          </div>
        )}

        <MediaAttachment message={message} />

        {message.template_name && (
          <div className="text-[10px] uppercase tracking-wide opacity-75 mb-1">
            Template · {message.template_name}
          </div>
        )}

        {message.body && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {!message.body && !message.media_id && (
          <p className="text-sm italic opacity-70">[{message.message_type}]</p>
        )}

        <div className={`flex items-center gap-1 justify-end mt-1 text-[10px]
          ${outbound ? 'text-white/70' : 'text-slate-400'}`}>
          {message.author === 'human_agent' && message.author_email && (
            <span className="truncate max-w-[140px]">{message.author_email.split('@')[0]}</span>
          )}
          <span>{timeLabel(message.wa_timestamp)}</span>
          {outbound && (
            <StatusIcon className={`w-3.5 h-3.5 ${message.status === 'read' ? 'text-sky-200' : ''}`} />
          )}
        </div>

        {failed && message.error_detail && (
          <p className="text-[11px] mt-1 px-2 py-1 rounded bg-red-500/20 text-red-50">
            {message.error_detail}
          </p>
        )}
      </div>
    </div>
  );
}
