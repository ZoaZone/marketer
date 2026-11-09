/**
 * whatsappSend — outbound dispatch to the Meta Cloud API, per account.
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
 * No token reaches the browser: the client calls this function with its Base44
 * session, and the function loads the sending account's credentials
 * server-side — the platform's from the environment, a tenant's from their
 * WhatsAppAccount row. Which account is used is decided by the thread, not by
 * the caller, so an agent cannot send from a number their tenant has not
 * connected.
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


const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];
/** Meta's own ceiling for a text body. */
const MAX_TEXT_LENGTH = 4096;
/** Base44 function payloads are JSON, so an upload arrives base64-inflated. */
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

function toWaId(input: string): string {
  return String(input || '').replace(/\D/g, '');
}

function graphHeaders(account: WhatsAppAccount) {
  return {
    Authorization: `Bearer ${account.access_token}`,
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

async function findConversation(db: any, waId: string, phoneNumberId: string) {
  const rows = await db.entities.WhatsAppConversation
    .filter({ wa_id: waId, phone_number_id: phoneNumberId }).catch(() => []);
  return rows?.[0] || null;
}

async function findContact(db: any, waId: string, phoneNumberId: string) {
  const rows = await db.entities.WhatsAppContact
    .filter({ wa_id: waId, phone_number_id: phoneNumberId }).catch(() => []);
  return rows?.[0] || null;
}

/** Creates the thread on first outbound contact so the reply has somewhere to live. */
async function ensureThread(db: any, waId: string, account: WhatsAppAccount) {
  let contact = await findContact(db, waId, account.phone_number_id);
  if (!contact) {
    contact = await db.entities.WhatsAppContact.create({
      wa_id: waId,
      phone_e164: `+${waId}`,
      phone_number_id: account.phone_number_id,
      tenant_id: account.tenant_id || '',
      tags: [],
      opted_out: false,
    });
  }
  let conversation = await findConversation(db, waId, account.phone_number_id);
  if (!conversation) {
    conversation = await db.entities.WhatsAppConversation.create({
      contact_id: contact.id,
      wa_id: waId,
      phone_number_id: account.phone_number_id,
      waba_id: account.waba_id || '',
      tenant_id: account.tenant_id || '',
      account_id: account.id || '',
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

  const db = base44.asServiceRole;
  const action = String(body.action || 'text');

  // systemHealthCheck probes every function with this payload.
  if (action === 'health_probe') {
    const usable = (await allAccounts(db)).filter(isUsable).length;
    return Response.json({
      status: usable > 0 ? 'ok' : 'degraded',
      connected_accounts: usable,
      is_master: IS_MASTER,
    });
  }

  /**
   * The sending account. Named explicitly by account_id, otherwise taken from
   * the thread being replied to — never defaulted, so a reply always leaves
   * from the number the customer wrote to.
   */
  async function resolveSendingAccount(): Promise<WhatsAppAccount | null> {
    if (body.account_id) {
      const row = await db.entities.WhatsAppAccount.get(String(body.account_id)).catch(() => null);
      return row as WhatsAppAccount | null;
    }
    if (body.conversation_id) {
      const conv = await db.entities.WhatsAppConversation.get(String(body.conversation_id)).catch(() => null);
      if (conv?.phone_number_id) return accountByPhoneNumberId(db, conv.phone_number_id);
    }
    if (body.phone_number_id) return accountByPhoneNumberId(db, String(body.phone_number_id));
    // A caller with exactly one account to send from does not have to say so.
    const permitted = (await accountsForUser(db, user)).filter(isUsable);
    return permitted.length === 1 ? permitted[0] : null;
  }

  const account = await resolveSendingAccount();
  if (!isUsable(account)) {
    return Response.json({
      error: 'No connected WhatsApp account for this request',
      code: 'no_account',
      detail: 'Connect a WhatsApp Business account in settings, or name the account to send from.',
    }, { status: 503 });
  }
  const sender = account as WhatsAppAccount;

  // A caller may only send from an account their tenant owns. Without this a
  // signed-in user of one tenant could message from another tenant's number
  // just by passing its id.
  const permittedIds = new Set((await accountsForUser(db, user)).map((a) => a.phone_number_id));
  if (!permittedIds.has(sender.phone_number_id)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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

    const res = await fetch(`${GRAPH_API_URL}/${sender.phone_number_id}/media`, {
      method: 'POST',
      // No Content-Type here on purpose: fetch sets the multipart boundary.
      headers: { Authorization: `Bearer ${sender.access_token}` },
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

  const { contact, conversation } = await ensureThread(db, to, sender);

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
  const res = await fetch(`${GRAPH_API_URL}/${sender.phone_number_id}/messages`, {
    method: 'POST',
    headers: graphHeaders(sender),
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
      phone_number_id: sender.phone_number_id,
      tenant_id: sender.tenant_id || '',
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
    phone_number_id: sender.phone_number_id,
    tenant_id: sender.tenant_id || '',
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
