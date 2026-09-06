/**
 * whatsappAPI — browser-side client for the WhatsApp CRM inbox.
 *
 * Two transports, because they solve different problems:
 *
 *   call()          → base44.functions.invoke, for every request/response
 *                     action (list threads, send, claim, templates…). The
 *                     system-user token stays server-side; the browser only
 *                     ever carries its own Base44 session.
 *   openMessageStream() → a hand-rolled fetch + ReadableStream SSE reader.
 *                     EventSource cannot set an Authorization header, and the
 *                     alternative — a session token in the query string —
 *                     would leak it into every proxy and access log on the
 *                     path, so the stream is read manually instead.
 *
 * Streaming is treated as an optimisation throughout: openMessageStream throws
 * StreamUnsupportedError when response.body is unavailable (older iOS Safari,
 * some corporate proxies that buffer text/event-stream into oblivion), and the
 * caller in src/hooks/useWhatsAppInbox.js falls back to polling. The inbox is
 * correct either way; the stream only decides whether new messages land in a
 * second or on the next poll.
 */
import { base44 } from './base44Client';

const TOKEN_KEY = 'base44_access_token';
const APP_ID_KEY = 'base44_app_id';

/**
 * The functions origin for this app.
 *
 * Read from the SDK client first, then the build env, then the key
 * src/lib/app-params.js writes on boot — different apps in this org configure
 * their app id in different ways, and the SSE endpoint has to be addressed by
 * hand (functions.invoke has no streaming mode), so it has to work under all
 * of them. Override with VITE_WHATSAPP_FUNCTIONS_URL for a self-hosted
 * backend.
 */
function resolveAppId() {
  if (base44?.appId) return base44.appId;
  if (import.meta.env.VITE_BASE44_APP_ID) return import.meta.env.VITE_BASE44_APP_ID;
  try {
    return (typeof window !== 'undefined' && localStorage.getItem(APP_ID_KEY)) || '';
  } catch {
    return ''; // Safari private mode throws on storage access
  }
}

const SERVER_URL = String(
  import.meta.env.VITE_BASE44_BACKEND_URL || 'https://base44.app',
).replace(/\/+$/, '');

function functionsBaseUrl() {
  if (import.meta.env.VITE_WHATSAPP_FUNCTIONS_URL) return import.meta.env.VITE_WHATSAPP_FUNCTIONS_URL;
  return `${SERVER_URL}/api/apps/prod/${resolveAppId()}/functions`;
}

export class StreamUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StreamUnsupportedError';
  }
}

function sessionToken() {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return ''; // Safari private mode throws on storage access
  }
}

/**
 * Invokes a deployed Base44 function and unwraps its body.
 *
 * The SDK has returned the payload either bare or under `.data` depending on
 * build, so both shapes are accepted rather than pinned to one.
 */
async function call(fnName, payload) {
  const res = await base44.functions.invoke(fnName, payload);
  const data = res?.data !== undefined ? res.data : res;
  if (data?.error) {
    const err = new Error(
      typeof data.error === 'string' ? data.error : data.error.message || 'Request failed',
    );
    err.code = data.code || data.error?.code || '';
    err.detail = data.detail || data.error?.detail || '';
    err.payload = data;
    throw err;
  }
  return data || {};
}

// ── read + control ──────────────────────────────────────────────────────────

export function listConversations({ search = '', status = '', limit } = {}) {
  return call('whatsappInbox', { action: 'conversations', search, status, limit });
}

export function loadThread(conversationId, { limit } = {}) {
  return call('whatsappInbox', { action: 'thread', conversation_id: conversationId, limit });
}

/** Human takeover — the AI autopilot stops answering this thread. */
export function claimConversation(conversationId) {
  return call('whatsappInbox', { action: 'claim', conversation_id: conversationId });
}

/** Hands the thread back to the AI autopilot. */
export function releaseConversation(conversationId) {
  return call('whatsappInbox', { action: 'release', conversation_id: conversationId });
}

export function markRead(conversationId) {
  return call('whatsappInbox', { action: 'read', conversation_id: conversationId });
}

export function setConversationStatus(conversationId, status) {
  return call('whatsappInbox', {
    action: status === 'closed' ? 'close' : 'reopen',
    conversation_id: conversationId,
  });
}

export function updateContact(contactId, patch) {
  return call('whatsappInbox', { action: 'contact', contact_id: contactId, ...patch });
}

/** Meta media URLs expire within minutes, so they are resolved per view. */
export function resolveMedia(mediaId) {
  return call('whatsappInbox', { action: 'media', media_id: mediaId });
}

// ── outbound ────────────────────────────────────────────────────────────────

// Every send names the thread it belongs to. The backend resolves the sending
// number from that rather than trusting the caller, so a reply always leaves
// from the number the customer actually wrote to.

export function sendText(to, body, { conversationId, accountId } = {}) {
  return call('whatsappSend', {
    action: 'text', to, body, conversation_id: conversationId, account_id: accountId,
  });
}

export function sendMedia(to, { mediaType, mediaId, link, caption, filename, conversationId, accountId }) {
  return call('whatsappSend', {
    action: 'media', to, media_type: mediaType, media_id: mediaId, link, caption, filename,
    conversation_id: conversationId, account_id: accountId,
  });
}

export function sendTemplate(to, { name, language, components, conversationId, accountId }) {
  return call('whatsappSend', {
    action: 'template', to, template_name: name, language, components,
    conversation_id: conversationId, account_id: accountId,
  });
}

export function listTemplates({ accountId, conversationId } = {}) {
  return call('whatsappTemplates', {
    action: 'list', account_id: accountId, conversation_id: conversationId,
  });
}

// ── connected accounts (BYOK) ───────────────────────────────────────────────
//
// Credentials go in and never come back: the backend returns a four-character
// tail per secret so a form can show what is stored without being able to
// reveal it. Nothing here ever holds a token in browser memory.

/** Numbers the signed-in user may work in — the inbox's account switcher. */
export function listInboxAccounts() {
  return call('whatsappInbox', { action: 'accounts' });
}

export function listAccounts() {
  return call('whatsappAccounts', { action: 'list' });
}

/**
 * Creates or updates one account. Omitting a secret field keeps the stored
 * value; passing an empty string clears it. That asymmetry is deliberate —
 * a token cannot be read back, so a blank field must not mean "delete".
 */
export function saveAccount(account) {
  return call('whatsappAccounts', { action: 'save', ...account });
}

/** Asks Graph to confirm the credentials before anyone depends on them. */
export function testAccount(id) {
  return call('whatsappAccounts', { action: 'test', id });
}

export function deleteAccount(id) {
  return call('whatsappAccounts', { action: 'delete', id });
}

/** The callback URL and field subscription to paste into the Meta dashboard. */
export function getWebhookUrl() {
  return call('whatsappAccounts', { action: 'webhook_url' });
}

/** Reads a File into the base64 body whatsappSend's "upload" action expects. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadMedia(file, { conversationId, accountId } = {}) {
  const media_base64 = await fileToBase64(file);
  return call('whatsappSend', {
    action: 'upload',
    media_base64,
    mime_type: file.type || 'application/octet-stream',
    filename: file.name || 'upload',
    conversation_id: conversationId,
    account_id: accountId,
  });
}

// ── SSE ─────────────────────────────────────────────────────────────────────

/** Splits an SSE buffer into whole frames, returning the unconsumed tail. */
function parseFrames(buffer, onEvent) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  for (const frame of frames) {
    let event = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue; // keepalive comment
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      onEvent(event, JSON.parse(dataLines.join('\n')));
    } catch {
      // A frame we cannot parse is dropped rather than killing the stream —
      // the poller behind this will pick up whatever it described.
    }
  }
  return remainder;
}

/**
 * Opens the SSE feed and calls onEvent(name, data) per frame.
 * Returns a close() function. Throws StreamUnsupportedError when the transport
 * is unavailable, which is the caller's cue to poll instead.
 */
export function openMessageStream({ since, conversationId, onEvent, onError } = {}) {
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
    throw new StreamUnsupportedError('fetch streaming is unavailable in this browser');
  }

  const controller = new AbortController();
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (conversationId) params.set('conversation_id', conversationId);
  const appId = resolveAppId();
  if (!appId) {
    // Without an app id there is no URL to stream from. Polling still works,
    // so this is a demotion, not a failure.
    throw new StreamUnsupportedError('no Base44 app id available to build a stream URL');
  }
  const url = `${functionsBaseUrl()}/whatsappStream${params.toString() ? `?${params}` : ''}`;

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${sessionToken()}`,
          'X-App-Id': appId,
        },
      });
      if (!res.ok) throw new StreamUnsupportedError(`stream responded ${res.status}`);
      if (!res.body || typeof res.body.getReader !== 'function') {
        throw new StreamUnsupportedError('ReadableStream response bodies are unsupported');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseFrames(buffer, onEvent || (() => {}));
      }
      // A clean end is the function's 4-minute window closing, not an outage.
      onEvent?.('closed', {});
    } catch (err) {
      if (controller.signal.aborted) return; // deliberate close
      onError?.(err);
    }
  })();

  return () => controller.abort();
}

export const __testing = { parseFrames, functionsBaseUrl, resolveAppId };
