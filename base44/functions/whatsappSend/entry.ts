/**
 * whatsappSend — outbound dispatch to the Meta Cloud API for "Hello Biz".
 *
 * POST /functions/whatsappSend
 *   { action: "text",     to, body }
 *   { action: "media",    to, media_type: image|video|audio|document|sticker,
 *                         media_id? | link?, caption?, filename? }
 *   { action: "template", to, template_name, language?, components? }
 *   { action: "upload",   media_base64, mime_type, filename? }   → { media_id }
 *
 * Every send goes through Graph:
 *   POST https://graph.facebook.com/v20.0/902301109637859/messages
 *   Authorization: Bearer <system user token>
 *
 * Two rules are enforced here rather than left to the UI, because the UI is
 * not the only caller and Meta charges for the mistake either way:
 *
 *   1. The 24-hour customer service window. Free-form text and media may only
 *      be sent within 24h of the contact's last inbound message; outside it
 *      Meta rejects everything but an approved template. Checking locally
 *      turns a confusing Graph error into a clear one, and lets the composer
 *      switch itself to template mode.
 *   2. Opt-out. A contact who asked to stop is never messaged again, whatever
 *      the caller passes.
 *
 * The token never reaches the browser: the client calls this function with its
 * Base44 session and the function holds WHATSAPP_SYSTEM_USER_TOKEN server-side.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const SYSTEM_USER_TOKEN = Deno.env.get('WHATSAPP_SYSTEM_USER_TOKEN') || '';
const GRAPH_API_URL = Deno.env.get('WHATSAPP_GRAPH_API_URL') || 'https://graph.facebook.com/v20.0';

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];
/** Meta's own ceiling for a text body. */
const MAX_TEXT_LENGTH = 4096;
/** Base44 function payloads are JSON, so an upload arrives base64-inflated. */
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

function toWaId(input: string): string {
  return String(input || '').replace(/\D/g, '');
}

function graphHeaders() {
  return {
    Authorization: `Bearer ${SYSTEM_USER_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/** Unwraps Graph's error envelope into something an operator can act on. */
function graphError(json: any, res: Response) {
  const e = json?.error || {};
  return {
    code: String(e.code ?? res.status),
    subcode: String(e.error_subcode ?? ''),
    message: e.message || e.error_user_msg || `Graph API returned ${res.status}`,
    detail: e.error_data?.details || '',
  };
}

async function findConversation(db: any, waId: string) {
  const rows = await db.entities.WhatsAppConversation.filter({ wa_id: waId }).catch(() => []);
  return rows?.[0] || null;
}

async function findContact(db: any, waId: string) {
  const rows = await db.entities.WhatsAppContact.filter({ wa_id: waId }).catch(() => []);
  return rows?.[0] || null;
}

/** Creates the thread on first outbound contact so the reply has somewhere to live. */
async function ensureThread(db: any, waId: string) {
  let contact = await findContact(db, waId);
  if (!contact) {
    contact = await db.entities.WhatsAppContact.create({
      wa_id: waId, phone_e164: `+${waId}`, tags: [], opted_out: false,
    });
  }
  let conversation = await findConversation(db, waId);
  if (!conversation) {
    conversation = await db.entities.WhatsAppConversation.create({
      contact_id: contact.id,
      wa_id: waId,
      phone_number_id: PHONE_NUMBER_ID,
      status: 'open',
      handling_mode: 'human',
      unread_count: 0,
    });
  }
  return { contact, conversation };
}

/** True when free-form (non-template) messages are still allowed. */
function withinServiceWindow(lastInboundAt: string | undefined): boolean {
  if (!lastInboundAt) return false;
  const t = Date.parse(lastInboundAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < SERVICE_WINDOW_MS;
}

function buildGraphPayload(action: string, to: string, b: any) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

  if (action === 'text') {
    return { ...base, type: 'text', text: { preview_url: !!b.preview_url, body: b.body } };
  }
  if (action === 'media') {
    const mediaType = String(b.media_type);
    const media: Record<string, unknown> = b.media_id ? { id: b.media_id } : { link: b.link };
    // Meta rejects a caption on audio and sticker.
    if (b.caption && mediaType !== 'audio' && mediaType !== 'sticker') media.caption = b.caption;
    if (b.filename && mediaType === 'document') media.filename = b.filename;
    return { ...base, type: mediaType, [mediaType]: media };
  }
  // template
  return {
    ...base,
    type: 'template',
    template: {
      name: b.template_name,
      language: { code: b.language || 'en_US' },
      ...(Array.isArray(b.components) && b.components.length ? { components: b.components } : {}),
    },
  };
}

/** Local preview text stored alongside the message row. */
function bodyFor(action: string, b: any): string {
  if (action === 'text') return String(b.body || '');
  if (action === 'media') return String(b.caption || '');
  return `Template: ${b.template_name}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  // systemHealthCheck probes every function with this payload.
  if (body.action === 'health_probe') {
    return Response.json({
      status: SYSTEM_USER_TOKEN && PHONE_NUMBER_ID ? 'ok' : 'degraded',
      phone_number_id: PHONE_NUMBER_ID || null,
      configured: !!SYSTEM_USER_TOKEN,
    });
  }

  if (!SYSTEM_USER_TOKEN || !PHONE_NUMBER_ID) {
    return Response.json({
      error: 'WhatsApp is not configured',
      detail: 'Set WHATSAPP_SYSTEM_USER_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the Base44 secrets tab.',
    }, { status: 503 });
  }

  const db = base44.asServiceRole;
  const action = String(body.action || 'text');

  // ── media upload: browser file → Meta media id ──────────────────────────
  if (action === 'upload') {
    const b64 = String(body.media_base64 || '');
    const mime = String(body.mime_type || '');
    if (!b64 || !mime) {
      return Response.json({ error: 'media_base64 and mime_type are required' }, { status: 400 });
    }
    let bytes: Uint8Array;
    try {
      const binary = atob(b64.includes(',') ? b64.split(',')[1] : b64);
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
      return Response.json({ error: 'media_base64 is not valid base64' }, { status: 400 });
    }
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return Response.json({ error: 'File exceeds the 16 MB WhatsApp media limit' }, { status: 413 });
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([bytes], { type: mime }), String(body.filename || 'upload'));

    const res = await fetch(`${GRAPH_API_URL}/${PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      // No Content-Type here on purpose: fetch sets the multipart boundary.
      headers: { Authorization: `Bearer ${SYSTEM_USER_TOKEN}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return Response.json({ error: graphError(json, res) }, { status: res.status });
    return Response.json({ media_id: json?.id || '' });
  }

  // ── message send ────────────────────────────────────────────────────────
  if (!['text', 'media', 'template'].includes(action)) {
    return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
  }

  const to = toWaId(body.to);
  if (!to) return Response.json({ error: '"to" must be a phone number' }, { status: 400 });

  if (action === 'text') {
    const text = String(body.body || '').trim();
    if (!text) return Response.json({ error: 'Message body is empty' }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: `Message exceeds ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
    }
  }
  if (action === 'media') {
    if (!MEDIA_TYPES.includes(String(body.media_type))) {
      return Response.json({ error: `media_type must be one of ${MEDIA_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!body.media_id && !body.link) {
      return Response.json({ error: 'Either media_id or link is required' }, { status: 400 });
    }
  }
  if (action === 'template' && !body.template_name) {
    return Response.json({ error: 'template_name is required' }, { status: 400 });
  }

  const { contact, conversation } = await ensureThread(db, to);

  if (contact?.opted_out) {
    return Response.json({
      error: 'Contact has opted out of messages',
      code: 'opted_out',
    }, { status: 409 });
  }

  if (action !== 'template' && !withinServiceWindow(conversation?.last_inbound_at)) {
    return Response.json({
      error: 'Outside the 24-hour customer service window',
      code: 'outside_service_window',
      detail: 'WhatsApp only allows an approved template until the contact replies again.',
      last_inbound_at: conversation?.last_inbound_at || null,
    }, { status: 409 });
  }

  const graphPayload = buildGraphPayload(action, to, body);
  const res = await fetch(`${GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: graphHeaders(),
    body: JSON.stringify(graphPayload),
  });
  const json = await res.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (!res.ok) {
    const err = graphError(json, res);
    // Recorded as a failed row, not dropped: the agent needs to see that the
    // reply they typed did not go out, and why.
    await db.entities.WhatsAppMessage.create({
      conversation_id: conversation.id,
      wa_id: to,
      direction: 'outbound',
      author: 'human_agent',
      author_email: user.email || '',
      message_type: action === 'media' ? String(body.media_type) : action,
      body: bodyFor(action, body),
      template_name: action === 'template' ? String(body.template_name) : '',
      status: 'failed',
      error_code: err.code,
      error_detail: `${err.message} ${err.detail}`.trim().slice(0, 500),
      wa_timestamp: now,
    }).catch(() => {});
    return Response.json({ error: err }, { status: res.status });
  }

  const wamid = json?.messages?.[0]?.id || '';
  const message = await db.entities.WhatsAppMessage.create({
    conversation_id: conversation.id,
    wa_id: to,
    wamid,
    direction: 'outbound',
    author: 'human_agent',
    author_email: user.email || '',
    message_type: action === 'media' ? String(body.media_type) : action,
    body: bodyFor(action, body),
    media_id: action === 'media' ? String(body.media_id || '') : '',
    media_url: action === 'media' ? String(body.link || '') : '',
    media_filename: action === 'media' ? String(body.filename || '') : '',
    template_name: action === 'template' ? String(body.template_name) : '',
    template_language: action === 'template' ? String(body.language || 'en_US') : '',
    status: 'sent',
    wa_timestamp: now,
  });

  await db.entities.WhatsAppConversation.update(conversation.id, {
    status: 'open',
    last_message_at: now,
    last_message_preview: bodyFor(action, body).slice(0, 140) || `[${action}]`,
    last_message_direction: 'outbound',
    // A human typing in the thread is an implicit takeover — otherwise the bot
    // would answer the contact's next message on top of the agent's reply.
    handling_mode: 'human',
    claimed_by_id: conversation.claimed_by_id || user.id,
    claimed_by_email: conversation.claimed_by_email || user.email || '',
    claimed_at: conversation.claimed_at || now,
    unread_count: 0,
  }).catch(() => {});

  return Response.json({ ok: true, wamid, message_id: message?.id || '', conversation_id: conversation.id });
});
