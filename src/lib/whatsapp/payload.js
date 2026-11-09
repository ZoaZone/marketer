/**
 * Pure helpers for the WhatsApp CRM inbox.
 *
 * Everything here is a plain function over plain data: no network, no React,
 * no Deno. That keeps the rules that matter — the 24-hour service window, how
 * a Meta message object flattens into a bubble, how a template's {{n}} slots
 * become Graph components — testable in Jest (tests/whatsapp/payload.test.cjs)
 * even though the code that enforces them at send time lives in a Deno
 * function that Node cannot import.
 *
 * normalizeInbound/previewOf are mirrored by base44/functions/whatsappWebhook;
 * the webhook contract test asserts the two stay in step.
 */

/** WhatsApp's free-form messaging window. Outside it, templates only. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Media kinds that carry an optional caption. */
export const CAPTIONED_MEDIA = ['image', 'video', 'document', 'audio'];

const TYPE_LABELS = {
  image: '📷 Photo',
  video: '🎥 Video',
  audio: '🎙 Voice message',
  document: '📄 Document',
  sticker: 'Sticker',
  location: '📍 Location',
  contacts: '👤 Contact card',
  reaction: 'Reaction',
};

/** Digits-only wa_id (Meta's format) → E.164 for display. */
export function toE164(waId) {
  const digits = String(waId || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Anything a human might type → the digits-only id Graph expects. */
export function toWaId(input) {
  return String(input || '').replace(/\D/g, '');
}

/**
 * Pretty US/Canada formatting, verbatim passthrough for everything else —
 * guessing at grouping rules for numbering plans we do not know produces
 * confidently wrong output, which is worse than a bare +<digits>.
 */
export function formatPhone(input) {
  const digits = toWaId(input);
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return toE164(digits);
}

/** Meta sends Unix seconds as a string; everything downstream wants ISO. */
export function toIso(timestamp) {
  const secs = Number(timestamp);
  if (!Number.isFinite(secs) || secs <= 0) return new Date().toISOString();
  return new Date(secs * 1000).toISOString();
}

/**
 * Flattens one Meta message object into the fields a bubble needs.
 * Unknown types survive as `unsupported` rather than vanishing — an
 * unrenderable message is still something the agent must know arrived.
 */
export function normalizeInbound(msg) {
  const type = String(msg?.type || 'unsupported');
  let body = '';
  let mediaId = '';
  let mediaMime = '';
  let mediaFilename = '';

  if (type === 'text') {
    body = msg?.text?.body || '';
  } else if (CAPTIONED_MEDIA.includes(type)) {
    const media = msg?.[type] || {};
    body = media.caption || '';
    mediaId = media.id || '';
    mediaMime = media.mime_type || '';
    mediaFilename = media.filename || '';
  } else if (type === 'sticker') {
    mediaId = msg?.sticker?.id || '';
    mediaMime = msg?.sticker?.mime_type || '';
  } else if (type === 'location') {
    const loc = msg?.location || {};
    body = [loc.name, loc.address, `${loc.latitude ?? ''},${loc.longitude ?? ''}`]
      .filter(Boolean).join(' · ');
  } else if (type === 'button') {
    body = msg?.button?.text || '';
  } else if (type === 'interactive') {
    const ia = msg?.interactive || {};
    body = ia?.button_reply?.title || ia?.list_reply?.title || '';
  } else if (type === 'reaction') {
    body = msg?.reaction?.emoji || '';
  } else if (type === 'contacts') {
    body = (msg?.contacts || []).map((c) => c?.name?.formatted_name).filter(Boolean).join(', ');
  }

  return {
    wamid: msg?.id || '',
    message_type: type,
    body,
    media_id: mediaId,
    media_mime: mediaMime,
    media_filename: mediaFilename,
    wa_timestamp: toIso(msg?.timestamp),
  };
}

/** One-line summary for the conversation list. */
export function previewOf(message) {
  if (message?.body) return String(message.body).slice(0, 140);
  return TYPE_LABELS[message?.message_type] || `[${message?.message_type || 'message'}]`;
}

/** True while free-form (non-template) replies are still allowed. */
export function withinServiceWindow(lastInboundAt, now = Date.now()) {
  const t = Date.parse(lastInboundAt || '');
  return Number.isFinite(t) && now - t < SERVICE_WINDOW_MS;
}

/** Milliseconds left in the window; 0 once it has closed. */
export function serviceWindowRemaining(lastInboundAt, now = Date.now()) {
  const t = Date.parse(lastInboundAt || '');
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, SERVICE_WINDOW_MS - (now - t));
}

/** "23h 41m" / "45m" / "closed" — the composer's window badge. */
export function formatWindowRemaining(lastInboundAt, now = Date.now()) {
  const ms = serviceWindowRemaining(lastInboundAt, now);
  if (ms <= 0) return 'closed';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Substitutes {{1}}, {{2}}… into a template body for the send-time preview. */
export function fillTemplate(bodyText, values = []) {
  return String(bodyText || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => {
    const value = values[Number(index) - 1];
    return value === undefined || value === '' ? match : String(value);
  });
}

/** Highest {{n}} in the body — how many values the agent must supply. */
export function countTemplateVariables(bodyText) {
  const matches = String(bodyText || '').match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  return matches.reduce((max, token) => {
    const n = Number(token.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

/**
 * Graph's `components` array for a template send. Returns [] when the template
 * takes no variables — Meta rejects an empty parameters array, so the key has
 * to be absent rather than present-and-empty.
 */
export function templateComponents(values = []) {
  const parameters = values
    .filter((v) => v !== undefined && v !== null && String(v) !== '')
    .map((v) => ({ type: 'text', text: String(v) }));
  return parameters.length ? [{ type: 'body', parameters }] : [];
}

function timeOf(message) {
  return Date.parse(message?.wa_timestamp || message?.created_date || '') || 0;
}

/** Oldest first, the order a thread reads in. */
export function sortMessages(messages = []) {
  return [...messages].sort((a, b) => timeOf(a) - timeOf(b));
}

/**
 * Merges streamed messages into the rendered thread.
 *
 * Keyed by id, then by wamid: an optimistic bubble sent locally and the same
 * message arriving back over SSE share a wamid but not an id, and rendering
 * both is the classic double-send illusion.
 */
export function mergeMessages(existing = [], incoming = []) {
  const byId = new Map();
  const wamidToId = new Map();

  for (const message of [...existing, ...incoming]) {
    if (!message) continue;
    const wamid = message.wamid || '';
    const knownId = wamid ? wamidToId.get(wamid) : undefined;
    const key = knownId || message.id || wamid;
    if (!key) continue;
    byId.set(key, { ...(byId.get(key) || {}), ...message });
    if (wamid) wamidToId.set(wamid, key);
  }
  return sortMessages(Array.from(byId.values()));
}

/** Groups a thread into day buckets so the panel can print date separators. */
export function groupByDay(messages = []) {
  const groups = [];
  let current = null;
  for (const message of sortMessages(messages)) {
    const day = (message.wa_timestamp || message.created_date || '').slice(0, 10);
    if (!current || current.day !== day) {
      current = { day, messages: [] };
      groups.push(current);
    }
    current.messages.push(message);
  }
  return groups;
}

/** "Today" / "Yesterday" / a written date, for the separator label. */
export function formatDayLabel(day, now = new Date()) {
  if (!day) return '';
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Compact relative time for the conversation list ("4m", "3h", "2d"). */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
