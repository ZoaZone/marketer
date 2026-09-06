/**
 * whatsappWebhook — Meta Cloud API webhook for the "Hello Biz" WABA.
 *
 * One function serves both halves of Meta's contract:
 *
 *   GET   → the subscription handshake. Meta calls this once when you save the
 *           callback URL in the App Dashboard and expects hub.challenge echoed
 *           back as a bare 200 body.
 *   POST  → every inbound message and every delivery-status update.
 *
 * Topology. The callback URL registered with Meta is the public PHP relay at
 * https://zoazoneservices.com/webhook.php (cPanel; the relay's source lives in
 * ZoaZone/os-aevoice under deploy/zoazoneservices/),
 * which forwards the untouched raw body here and adds X-Relay-Token. Meta may
 * also be pointed straight at this function's URL — both paths are accepted,
 * which is why authentication below is "valid Meta signature OR valid relay
 * token" rather than one fixed scheme.
 *
 * Idempotency. Meta retries a delivery until it gets a 200, and retries carry
 * the same wamid. Every inbound message is therefore looked up by wamid before
 * it is written; a second delivery of the same wamid is counted and dropped.
 * For that same reason this handler answers 200 even when its own bookkeeping
 * fails (the failure is logged instead) — a 500 here buys nothing
 * but an infinite retry loop against a bug that a retry cannot fix. The two
 * exceptions are an unauthenticated POST (401) and a malformed body (400):
 * neither is worth retrying and neither should look like success.
 *
 * Realtime. There is no broker in front of the entity store, so the UI is fed
 * by base44/functions/whatsappStream (SSE) tailing WhatsAppMessage by id. That
 * makes the write below the notification: nothing else has to be published.
 *
 * Answering automatically is opt-in and configured, never assumed. A thread in
 * ai_autopilot is answered by whichever of these is configured, in order:
 *
 *   WHATSAPP_AI_FUNCTION       name of a deployed function that returns a
 *                              reply for a message. Wire this to whatever
 *                              assistant this app already has.
 *   WHATSAPP_AUTO_ACK_TEMPLATE an approved template, sent once per thread —
 *                              "we got your message" and nothing more.
 *   neither                    the thread stays unread for a human.
 *
 * Doing nothing is the default and the safe failure mode: an unanswered
 * message sits visibly in the inbox, whereas a wrong automated reply has
 * already been delivered to a customer by the time anyone notices.
 *
 * Env (Base44 secrets tab):
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN  required — GET handshake
 *   WHATSAPP_APP_SECRET            optional — X-Hub-Signature-256 verification
 *   WHATSAPP_RELAY_TOKEN           optional — shared secret with the PHP relay
 *   WHATSAPP_AI_FUNCTION           optional — see above
 *   WHATSAPP_AUTO_ACK_TEMPLATE     optional — see above
 *   WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_WABA_ID / WHATSAPP_SYSTEM_USER_TOKEN /
 *   WHATSAPP_GRAPH_API_URL
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') || '';
const RELAY_TOKEN = Deno.env.get('WHATSAPP_RELAY_TOKEN') || '';
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const WABA_ID = Deno.env.get('WHATSAPP_WABA_ID') || '';
const SYSTEM_USER_TOKEN = Deno.env.get('WHATSAPP_SYSTEM_USER_TOKEN') || '';
const GRAPH_API_URL = Deno.env.get('WHATSAPP_GRAPH_API_URL') || 'https://graph.facebook.com/v20.0';
const AI_FUNCTION = Deno.env.get('WHATSAPP_AI_FUNCTION') || '';
const AUTO_ACK_TEMPLATE = Deno.env.get('WHATSAPP_AUTO_ACK_TEMPLATE') || '';
const AUTO_ACK_LANGUAGE = Deno.env.get('WHATSAPP_AUTO_ACK_LANGUAGE') || 'en_US';

/** Message types whose text lives somewhere other than `.text.body`. */
const CAPTIONED_MEDIA = ['image', 'video', 'document', 'audio'];

// ── helpers (mirrored, and unit tested, in src/lib/whatsapp/payload.js) ──────

/** Digits-only wa_id → E.164. Meta never sends the leading '+'. */
function toE164(waId: string): string {
  const digits = String(waId || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Meta sends Unix seconds as a string; the entity store wants ISO. */
function toIso(timestamp: unknown): string {
  const secs = Number(timestamp);
  if (!Number.isFinite(secs) || secs <= 0) return new Date().toISOString();
  return new Date(secs * 1000).toISOString();
}

/**
 * Flattens one Meta message object into the shape WhatsAppMessage stores.
 * Unknown types are kept as `unsupported` with the original JSON in `raw`
 * rather than dropped — an unrenderable message is still a message the agent
 * needs to see happened.
 */
function normalizeInbound(msg: Record<string, any>) {
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
    body = (msg?.contacts || []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(', ');
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
function previewOf(m: { message_type: string; body: string }): string {
  if (m.body) return m.body.slice(0, 140);
  const labels: Record<string, string> = {
    image: '📷 Photo', video: '🎥 Video', audio: '🎙 Voice message',
    document: '📄 Document', sticker: 'Sticker', location: '📍 Location',
    contacts: '👤 Contact card', reaction: 'Reaction',
  };
  return labels[m.message_type] || `[${m.message_type}]`;
}

/** Constant-time string compare — the verify token is a secret. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body). */
async function verifyMetaSignature(rawBody: string, header: string): Promise<boolean> {
  if (!APP_SECRET || !header) return false;
  const expectedHex = header.startsWith('sha256=') ? header.slice(7) : header;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(actualHex, expectedHex.toLowerCase());
}

// ── persistence ─────────────────────────────────────────────────────────────

async function upsertContact(db: any, waId: string, profileName: string) {
  const existing = await db.entities.WhatsAppContact.filter({ wa_id: waId }).catch(() => []);
  if (existing?.length) {
    const row = existing[0];
    // Only overwrite profile_name — display_name is the agent's own label.
    if (profileName && row.profile_name !== profileName) {
      await db.entities.WhatsAppContact.update(row.id, { profile_name: profileName }).catch(() => {});
    }
    return row;
  }
  return await db.entities.WhatsAppContact.create({
    wa_id: waId,
    phone_e164: toE164(waId),
    profile_name: profileName || '',
    tags: [],
    opted_out: false,
  });
}

async function upsertConversation(db: any, contact: any, waId: string) {
  const existing = await db.entities.WhatsAppConversation.filter({ wa_id: waId }).catch(() => []);
  if (existing?.length) return existing[0];
  return await db.entities.WhatsAppConversation.create({
    contact_id: contact?.id || '',
    wa_id: waId,
    phone_number_id: PHONE_NUMBER_ID,
    waba_id: WABA_ID,
    status: 'open',
    handling_mode: 'ai_autopilot',
    unread_count: 0,
  });
}

/**
 * Operational logging goes to the platform function log rather than an entity.
 *
 * Delivery counters are not application data: writing them into whatever audit
 * table this app happens to have would both couple the module to that schema
 * and bury the rows that table exists to hold.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function log(_db: unknown, action: string, status: string, detail: string) {
  const line = `[${action}] ${status}: ${detail.slice(0, 2000)}`;
  if (status === 'error') console.error(line); else console.log(line);
}

// ── automatic replies ───────────────────────────────────────────────────────

/** POSTs one already-built payload to the Graph messages edge. */
async function graphSend(payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SYSTEM_USER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json, wamid: json?.messages?.[0]?.id || '' };
}

async function recordOutbound(db: any, conversation: any, contact: any, row: Record<string, unknown>) {
  const now = new Date().toISOString();
  await db.entities.WhatsAppMessage.create({
    conversation_id: conversation.id,
    wa_id: contact.wa_id,
    direction: 'outbound',
    wa_timestamp: now,
    ...row,
  });
  await db.entities.WhatsAppConversation.update(conversation.id, {
    last_message_at: now,
    last_message_preview: String(row.body || '').slice(0, 140),
    last_message_direction: 'outbound',
  }).catch(() => {});
}

/**
 * Asks the configured assistant function for a reply and sends it.
 *
 * Deliberately best-effort: if the function is unavailable or returns nothing
 * usable, the thread stays unanswered and shows up unread for a human. That is
 * the safe failure mode — a wrong automated reply to a customer is worse than
 * a slow human one.
 */
async function replyWithAI(db: any, conversation: any, contact: any, inbound: any): Promise<boolean> {
  let replyText = '';
  try {
    const res = await db.functions.invoke(AI_FUNCTION, {
      channel: 'whatsapp',
      conversation_id: conversation.id,
      agent_id: conversation.agent_id || undefined,
      contact: { wa_id: contact?.wa_id, name: contact?.profile_name || '' },
      message: { type: inbound.message_type, text: inbound.body },
    });
    replyText = res?.data?.reply || res?.data?.text || res?.reply || '';
  } catch (err) {
    await log(db, 'whatsapp_ai_reply', 'error', `${AI_FUNCTION}: ${(err as Error).message}`);
    return false;
  }
  if (!replyText || typeof replyText !== 'string') return false;

  const { ok, json, wamid } = await graphSend({
    to: contact.wa_id, type: 'text', text: { preview_url: false, body: replyText },
  });
  await recordOutbound(db, conversation, contact, {
    wamid, author: 'ai_agent', message_type: 'text', body: replyText,
    status: ok ? 'sent' : 'failed',
    error_detail: ok ? '' : JSON.stringify(json?.error || {}).slice(0, 500),
  });
  await log(db, 'whatsapp_ai_reply', ok ? 'ok' : 'error',
    ok ? `replied to ${contact.wa_id}` : JSON.stringify(json?.error || {}));
  return true;
}

/**
 * Sends the one approved acknowledgement template a thread gets, then stamps
 * the conversation so a contact who sends five messages receives one auto
 * -reply rather than five. Stamped even on failure: retrying on every
 * subsequent inbound message would turn one Graph error into a flood.
 */
async function sendAutoAck(db: any, conversation: any, contact: any) {
  if (conversation.auto_ack_sent_at) return;

  const { ok, json, wamid } = await graphSend({
    to: contact.wa_id,
    type: 'template',
    template: { name: AUTO_ACK_TEMPLATE, language: { code: AUTO_ACK_LANGUAGE } },
  });
  await recordOutbound(db, conversation, contact, {
    wamid, author: 'ai_agent', message_type: 'template',
    template_name: AUTO_ACK_TEMPLATE, template_language: AUTO_ACK_LANGUAGE,
    body: `Acknowledgement template: ${AUTO_ACK_TEMPLATE}`,
    status: ok ? 'sent' : 'failed',
    error_detail: ok ? '' : JSON.stringify(json?.error || {}).slice(0, 500),
  });
  await db.entities.WhatsAppConversation.update(conversation.id, {
    auto_ack_sent_at: new Date().toISOString(),
  }).catch(() => {});
  await log(db, 'whatsapp_auto_ack', ok ? 'ok' : 'error',
    ok ? `acknowledged ${contact.wa_id}` : JSON.stringify(json?.error || {}));
}

/** Runs whichever automatic reply is configured; does nothing when none is. */
async function runAutopilot(db: any, conversation: any, contact: any, inbound: any) {
  if (!SYSTEM_USER_TOKEN || !PHONE_NUMBER_ID) return;
  try {
    if (AI_FUNCTION && await replyWithAI(db, conversation, contact, inbound)) return;
    if (AUTO_ACK_TEMPLATE) await sendAutoAck(db, conversation, contact);
  } catch (err) {
    await log(db, 'whatsapp_autopilot', 'error', (err as Error).message);
  }
}

// ── change handlers ─────────────────────────────────────────────────────────

async function handleInboundMessages(db: any, value: any, stats: Record<string, number>) {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  const profileByWaId = new Map<string, string>();
  for (const c of value?.contacts || []) {
    if (c?.wa_id) profileByWaId.set(String(c.wa_id), c?.profile?.name || '');
  }

  for (const msg of messages) {
    const waId = String(msg?.from || '');
    const norm = normalizeInbound(msg);
    if (!waId || !norm.wamid) { stats.skipped++; continue; }

    // Meta retries until it sees a 200, so the same wamid arrives more than
    // once whenever a delivery is slow. Check before writing.
    const dupes = await db.entities.WhatsAppMessage.filter({ wamid: norm.wamid }).catch(() => []);
    if (dupes?.length) { stats.duplicates++; continue; }

    const contact = await upsertContact(db, waId, profileByWaId.get(waId) || '');
    const conversation = await upsertConversation(db, contact, waId);

    await db.entities.WhatsAppMessage.create({
      conversation_id: conversation.id,
      wa_id: waId,
      wamid: norm.wamid,
      direction: 'inbound',
      author: 'contact',
      message_type: norm.message_type,
      body: norm.body,
      media_id: norm.media_id,
      media_mime: norm.media_mime,
      media_filename: norm.media_filename,
      status: 'delivered',
      wa_timestamp: norm.wa_timestamp,
      raw: JSON.stringify(msg).slice(0, 8000),
    });

    const preview = previewOf(norm);
    await db.entities.WhatsAppConversation.update(conversation.id, {
      status: 'open',
      unread_count: Number(conversation.unread_count || 0) + 1,
      last_message_at: norm.wa_timestamp,
      last_message_preview: preview,
      last_message_direction: 'inbound',
      last_inbound_at: norm.wa_timestamp,
    }).catch(() => {});
    await db.entities.WhatsAppContact.update(contact.id, {
      last_message_at: norm.wa_timestamp,
    }).catch(() => {});

    stats.messages++;

    // The claim check: a thread a human took over is never answered by the bot.
    const claimed = conversation.handling_mode === 'human';
    if (!claimed && !contact.opted_out) {
      await runAutopilot(db, conversation, contact, norm);
    }
  }
}

async function handleStatuses(db: any, value: any, stats: Record<string, number>) {
  for (const st of value?.statuses || []) {
    const wamid = st?.id;
    const status = st?.status;
    if (!wamid || !status) continue;
    const rows = await db.entities.WhatsAppMessage.filter({ wamid }).catch(() => []);
    if (!rows?.length) { stats.orphan_statuses++; continue; }
    const patch: Record<string, unknown> = { status };
    if (status === 'failed') {
      const err = (st?.errors || [])[0] || {};
      patch.error_code = String(err.code || '');
      patch.error_detail = String(err.title || err.message || '').slice(0, 500);
    }
    await db.entities.WhatsAppMessage.update(rows[0].id, patch).catch(() => {});
    stats.statuses++;
  }
}

// ── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── GET: subscription handshake ───────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';

    if (mode === 'subscribe' && VERIFY_TOKEN && safeEqual(token, VERIFY_TOKEN)) {
      // Meta wants the challenge as a bare body, not JSON.
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  }

  // ── POST: authenticate before parsing ─────────────────────────────────────
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') || '';
  const relayToken = req.headers.get('x-relay-token') || '';

  const signatureOk = await verifyMetaSignature(rawBody, signature).catch(() => false);
  const relayOk = !!RELAY_TOKEN && safeEqual(relayToken, RELAY_TOKEN);
  if (!signatureOk && !relayOk) {
    // Neither Meta's own signature nor the relay's shared secret checked out.
    // If both secrets are unset the deployment is misconfigured, not open.
    return Response.json(
      { error: 'Unauthorized webhook delivery' },
      { status: 401 },
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const stats: Record<string, number> = {
    messages: 0, statuses: 0, duplicates: 0, skipped: 0, orphan_statuses: 0,
  };

  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== 'messages') continue;
        const value = change?.value || {};
        await handleInboundMessages(db, value, stats);
        await handleStatuses(db, value, stats);
      }
    }
  } catch (err) {
    // Swallowed on purpose — see the header note on why a 500 here is worse
    // than a 200. The failure is recorded where an operator will find it.
    await log(db, 'whatsapp_webhook', 'error', (err as Error).message);
    return Response.json({ received: true, error: 'logged' }, { status: 200 });
  }

  if (stats.messages || stats.statuses) {
    await log(db, 'whatsapp_webhook', 'ok', JSON.stringify(stats));
  }
  return Response.json({ received: true, ...stats }, { status: 200 });
});
