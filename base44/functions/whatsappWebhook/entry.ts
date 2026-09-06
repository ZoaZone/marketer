/**
 * whatsappWebhook — Meta Cloud API webhook, multi-tenant.
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
 * Env: only WHATSAPP_GRAPH_API_URL (the Graph base, defaulted) and
 * WHATSAPP_MASTER_ACCOUNT. Credentials live per tenant in WhatsAppAccount.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Resolves which WhatsApp account a request belongs to.
 *
 * Two kinds of account share this code:
 *
 *   the master account   the platform's own number, configured in the
 *                        environment and enabled by WHATSAPP_MASTER_ACCOUNT=
 *                        true. This is what the app itself messages from.
 *   tenant accounts      rows in WhatsAppAccount, each holding credentials a
 *                        tenant connected through whatsappAccounts so they can
 *                        message under their OWN business name.
 *
 * Everything routes on phone_number_id, the id Meta puts in every delivery's
 * value.metadata, so the two kinds never mix: a tenant's traffic is signed with
 * their app secret and answered with their token, and the platform's with its
 * own. There is deliberately no "if we cannot tell, use the platform account"
 * branch — that is how one business ends up messaging under another's verified
 * name and quality rating.
 *
 * WHATSAPP_MASTER_ACCOUNT is off unless deliberately turned on, so a fork of
 * this app cannot start messaging from the platform's number by inheriting a
 * config file.
 */
const IS_MASTER = (Deno.env.get('WHATSAPP_MASTER_ACCOUNT') || '').toLowerCase() === 'true';
const GRAPH_API_URL = Deno.env.get('WHATSAPP_GRAPH_API_URL') || 'https://graph.facebook.com/v20.0';

interface WhatsAppAccount {
  id?: string;
  tenant_id?: string;
  label?: string;
  phone_number_id: string;
  waba_id?: string;
  access_token?: string;
  verify_token?: string;
  app_secret?: string;
  relay_token?: string;
  is_master?: boolean;
  ai_function?: string;
  auto_ack_template?: string;
  auto_ack_language?: string;
}

/** The platform's own account, and only when this deployment is the platform. */
function masterAccount(): WhatsAppAccount | null {
  if (!IS_MASTER) return null;
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  if (!phoneNumberId) return null;
  return {
    tenant_id: '',
    label: 'Platform account',
    phone_number_id: phoneNumberId,
    waba_id: Deno.env.get('WHATSAPP_WABA_ID') || '',
    access_token: Deno.env.get('WHATSAPP_SYSTEM_USER_TOKEN') || '',
    verify_token: Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || '',
    app_secret: Deno.env.get('WHATSAPP_APP_SECRET') || '',
    relay_token: Deno.env.get('WHATSAPP_RELAY_TOKEN') || '',
    is_master: true,
    ai_function: Deno.env.get('WHATSAPP_AI_FUNCTION') || '',
    auto_ack_template: Deno.env.get('WHATSAPP_AUTO_ACK_TEMPLATE') || '',
    auto_ack_language: Deno.env.get('WHATSAPP_AUTO_ACK_LANGUAGE') || 'en_US',
  };
}

/** Every connected account, tenants' rows first and the platform's last. */
async function allAccounts(db: any): Promise<WhatsAppAccount[]> {
  const rows = await db.entities.WhatsAppAccount.list().catch(() => []);
  const master = masterAccount();
  return master ? [...(rows || []), master] : (rows || []);
}

/**
 * The account that owns a phone number id — the routing key Meta puts in
 * every delivery's value.metadata. Returns null rather than a default: an
 * unrecognised number is someone else's, and answering it with whatever
 * credentials happen to be lying around is exactly the cross-tenant leak this
 * function exists to prevent.
 */
async function accountByPhoneNumberId(db: any, phoneNumberId: string): Promise<WhatsAppAccount | null> {
  if (!phoneNumberId) return null;
  const rows = await db.entities.WhatsAppAccount
    .filter({ phone_number_id: phoneNumberId }).catch(() => []);
  if (rows?.length) return rows[0] as WhatsAppAccount;
  const master = masterAccount();
  return master && master.phone_number_id === phoneNumberId ? master : null;
}

/** The accounts a caller may act on: their tenant's, or all of them for an admin. */
async function accountsForUser(db: any, user: any): Promise<WhatsAppAccount[]> {
  const accounts = await allAccounts(db);
  if (user?.role === 'admin') return accounts;
  const tenantId = user?.tenant_id || user?.client_id || user?.organization_id || '';
  // An account with no tenant_id is app-wide; one with a tenant_id belongs to
  // exactly that tenant and is invisible to everyone else.
  return accounts.filter((a) => !a.tenant_id || a.tenant_id === tenantId);
}

/** True when the account has enough to actually talk to Graph. */
function isUsable(account: WhatsAppAccount | null): boolean {
  return !!(account?.phone_number_id && account?.access_token);
}


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
async function verifyMetaSignature(rawBody: string, header: string, appSecret: string): Promise<boolean> {
  if (!appSecret || !header) return false;
  const expectedHex = header.startsWith('sha256=') ? header.slice(7) : header;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(actualHex, expectedHex.toLowerCase());
}

// ── persistence ─────────────────────────────────────────────────────────────

async function upsertContact(db: any, waId: string, profileName: string, account: WhatsAppAccount) {
  const existing = await db.entities.WhatsAppContact
    .filter({ wa_id: waId, phone_number_id: account.phone_number_id }).catch(() => []);
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
    phone_number_id: account.phone_number_id,
    tenant_id: account.tenant_id || '',
    tags: [],
    opted_out: false,
  });
}

/**
 * Threads are keyed on (wa_id, phone_number_id), not wa_id alone: the same
 * person can hold separate conversations with two tenants on this platform,
 * and merging them would show one tenant the other's messages.
 */
async function upsertConversation(db: any, contact: any, waId: string, account: WhatsAppAccount) {
  const existing = await db.entities.WhatsAppConversation
    .filter({ wa_id: waId, phone_number_id: account.phone_number_id }).catch(() => []);
  if (existing?.length) return existing[0];
  return await db.entities.WhatsAppConversation.create({
    contact_id: contact?.id || '',
    wa_id: waId,
    phone_number_id: account.phone_number_id,
    waba_id: account.waba_id || '',
    tenant_id: account.tenant_id || '',
    account_id: account.id || '',
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

/** POSTs one already-built payload from the account's own number and token. */
async function graphSend(account: WhatsAppAccount, payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH_API_URL}/${account.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.access_token}`,
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
    phone_number_id: conversation.phone_number_id || '',
    tenant_id: conversation.tenant_id || '',
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
async function replyWithAI(
  db: any, account: WhatsAppAccount, conversation: any, contact: any, inbound: any,
): Promise<boolean> {
  let replyText = '';
  try {
    const res = await db.functions.invoke(account.ai_function as string, {
      channel: 'whatsapp',
      conversation_id: conversation.id,
      tenant_id: account.tenant_id || undefined,
      agent_id: conversation.agent_id || undefined,
      contact: { wa_id: contact?.wa_id, name: contact?.profile_name || '' },
      message: { type: inbound.message_type, text: inbound.body },
    });
    replyText = res?.data?.reply || res?.data?.text || res?.reply || '';
  } catch (err) {
    await log(db, 'whatsapp_ai_reply', 'error', `${account.ai_function}: ${(err as Error).message}`);
    return false;
  }
  if (!replyText || typeof replyText !== 'string') return false;

  const { ok, json, wamid } = await graphSend(account, {
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
async function sendAutoAck(db: any, account: WhatsAppAccount, conversation: any, contact: any) {
  if (conversation.auto_ack_sent_at) return;

  const templateName = String(account.auto_ack_template || '');
  const language = String(account.auto_ack_language || 'en_US');
  const { ok, json, wamid } = await graphSend(account, {
    to: contact.wa_id,
    type: 'template',
    template: { name: templateName, language: { code: language } },
  });
  await recordOutbound(db, conversation, contact, {
    wamid, author: 'ai_agent', message_type: 'template',
    template_name: templateName, template_language: language,
    body: `Acknowledgement template: ${templateName}`,
    status: ok ? 'sent' : 'failed',
    error_detail: ok ? '' : JSON.stringify(json?.error || {}).slice(0, 500),
  });
  await db.entities.WhatsAppConversation.update(conversation.id, {
    auto_ack_sent_at: new Date().toISOString(),
  }).catch(() => {});
  await log(db, 'whatsapp_auto_ack', ok ? 'ok' : 'error',
    ok ? `acknowledged ${contact.wa_id}` : JSON.stringify(json?.error || {}));
}

/**
 * Runs whichever automatic reply THIS tenant configured; does nothing when they
 * configured none. Both settings live on the account row, so one tenant turning
 * on a bot never speaks for another.
 */
async function runAutopilot(db: any, account: WhatsAppAccount, conversation: any, contact: any, inbound: any) {
  if (!isUsable(account)) return;
  try {
    if (account.ai_function && await replyWithAI(db, account, conversation, contact, inbound)) return;
    if (account.auto_ack_template) await sendAutoAck(db, account, conversation, contact);
  } catch (err) {
    await log(db, 'whatsapp_autopilot', 'error', (err as Error).message);
  }
}

// ── change handlers ─────────────────────────────────────────────────────────

async function handleInboundMessages(
  db: any, account: WhatsAppAccount, value: any, stats: Record<string, number>,
) {
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

    const contact = await upsertContact(db, waId, profileByWaId.get(waId) || '', account);
    const conversation = await upsertConversation(db, contact, waId, account);

    await db.entities.WhatsAppMessage.create({
      conversation_id: conversation.id,
      wa_id: waId,
      phone_number_id: account.phone_number_id,
      tenant_id: account.tenant_id || '',
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
      await runAutopilot(db, account, conversation, contact, norm);
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
  //
  // Meta sends no phone number id on the handshake, so the verify token is what
  // identifies the tenant: it is matched against every connected account. Each
  // tenant therefore has to pick a token nobody else on this deployment uses —
  // which is the same requirement Meta already places on it, since a guessable
  // token lets anyone complete someone else's subscription.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';

    if (mode === 'subscribe' && token) {
      const base44 = createClientFromRequest(req);
      const accounts = await allAccounts(base44.asServiceRole).catch(() => [] as WhatsAppAccount[]);
      const matched = accounts.some((a) => a.verify_token && safeEqual(token, a.verify_token));
      if (matched) {
        // Meta wants the challenge as a bare body, not JSON.
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  }

  // ── POST: identify the tenant, then authenticate against their secrets ────
  //
  // The body has to be parsed before the signature can be checked, because the
  // phone number id inside it is what selects the secret to check against. That
  // ordering is safe: JSON.parse of an untrusted body is inert, and nothing is
  // read from the parse beyond the routing key until the signature verifies —
  // no entity is touched, no reply is sent, and an unverified delivery still
  // leaves with a 401 having changed nothing.
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') || '';
  const relayToken = req.headers.get('x-relay-token') || '';

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const phoneNumberId = String(
    payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || '',
  );
  const account = await accountByPhoneNumberId(db, phoneNumberId);
  if (!account) {
    // Nobody on this deployment has connected that number. Refusing is the
    // point: the alternative is processing another platform's traffic with
    // whichever credentials happen to be lying around.
    log('error', `delivery for unconnected phone_number_id ${phoneNumberId || '(absent)'}`);
    return Response.json(
      { error: 'No WhatsApp account is connected for this phone number id' },
      { status: 404 },
    );
  }

  const signatureOk = await verifyMetaSignature(rawBody, signature, account.app_secret || '')
    .catch(() => false);
  const relayOk = !!account.relay_token && safeEqual(relayToken, account.relay_token);
  if (!signatureOk && !relayOk) {
    // Neither Meta's signature nor this tenant's relay secret checked out. An
    // account with neither secret stored is unauthenticated, not open.
    return Response.json({ error: 'Unauthorized webhook delivery' }, { status: 401 });
  }

  const stats: Record<string, number> = {
    messages: 0, statuses: 0, duplicates: 0, skipped: 0, orphan_statuses: 0,
  };

  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== 'messages') continue;
        const value = change?.value || {};
        // A single delivery only ever carries one number's traffic, but Meta
        // does not promise it, so each change is re-checked against the
        // account this request authenticated as.
        if (String(value?.metadata?.phone_number_id || '') !== account.phone_number_id) {
          stats.skipped++;
          continue;
        }
        await handleInboundMessages(db, account, value, stats);
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
