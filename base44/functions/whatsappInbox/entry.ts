/**
 * whatsappInbox — read + control plane for the WhatsApp CRM inbox.
 *
 * POST /functions/whatsappInbox
 *   { action: "conversations", limit?, status?, search? }  → thread list
 *   { action: "thread",  conversation_id, limit?, after_id? } → messages
 *   { action: "claim",   conversation_id }   human takeover (bot goes silent)
 *   { action: "release", conversation_id }   hand back to AI autopilot
 *   { action: "read",    conversation_id }   clear the unread badge
 *   { action: "close" | "reopen", conversation_id }
 *   { action: "contact", contact_id, display_name?, tags?, notes?, opted_out? }
 *   { action: "media",   media_id }          → short-lived download URL
 *
 * Everything reads through asServiceRole because the inbox is shared team
 * state, not per-user rows: the webhook writes conversations with no
 * created_by_id, so the row-level read rule on WhatsAppConversation would hide
 * every thread from the very agents meant to work them.
 *
 * Bypassing RLS means the tenancy check has to be explicit and it has to be
 * here. Every read is filtered to the phone numbers the caller's tenant has
 * connected (plus the platform's own account for an admin), so one tenant's
 * agents never see another's conversations even though both live in the same
 * table. An unauthenticated caller never reaches the entity store at all.
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

/**
 * Whether an account has anything to answer with. Reported to the UI so the
 * auto-pilot switch can say "nothing is configured" instead of implying a bot
 * that does not exist.
 */
function autopilotConfigured(accounts: WhatsAppAccount[]): boolean {
  return accounts.some((a) => a.ai_function || a.auto_ack_template);
}

const DEFAULT_CONVERSATION_LIMIT = 100;
const DEFAULT_THREAD_LIMIT = 200;
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Base44's list/filter signature varies across SDK builds; sorting is a hint,
 * not a guarantee, so ordering is redone locally on the returned rows.
 */
async function listAll(entity: any, query: Record<string, unknown> | null, limit: number) {
  try {
    return query
      ? await entity.filter(query, '-created_date', limit)
      : await entity.list('-created_date', limit);
  } catch {
    try {
      return query ? await entity.filter(query) : await entity.list();
    } catch {
      return [];
    }
  }
}

function timeOf(row: any): number {
  return Date.parse(row?.last_message_at || row?.wa_timestamp || row?.created_date || '') || 0;
}

/** Threads the UI shows first: most recent activity at the top. */
function byRecencyDesc(a: any, b: any) { return timeOf(b) - timeOf(a); }
/** Messages read top-to-bottom, oldest first. */
function byTimeAsc(a: any, b: any) { return timeOf(a) - timeOf(b); }

function withinServiceWindow(lastInboundAt: string | undefined): boolean {
  const t = Date.parse(lastInboundAt || '');
  return Number.isFinite(t) && Date.now() - t < SERVICE_WINDOW_MS;
}

function matchesSearch(conv: any, contact: any, needle: string): boolean {
  if (!needle) return true;
  const hay = [
    conv?.wa_id, conv?.last_message_preview,
    contact?.display_name, contact?.profile_name, contact?.phone_e164,
    ...(contact?.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(needle);
}

/** Shape the list view needs — contact fields folded in, nothing extra. */
function toListItem(conv: any, contact: any) {
  return {
    id: conv.id,
    wa_id: conv.wa_id,
    phone_e164: contact?.phone_e164 || (conv.wa_id ? `+${conv.wa_id}` : ''),
    name: contact?.display_name || contact?.profile_name || '',
    tags: contact?.tags || [],
    contact_id: conv.contact_id || contact?.id || '',
    opted_out: !!contact?.opted_out,
    status: conv.status || 'open',
    handling_mode: conv.handling_mode || 'ai_autopilot',
    claimed_by_email: conv.claimed_by_email || '',
    unread_count: Number(conv.unread_count || 0),
    last_message_at: conv.last_message_at || conv.created_date || '',
    last_message_preview: conv.last_message_preview || '',
    last_message_direction: conv.last_message_direction || '',
    last_inbound_at: conv.last_inbound_at || '',
    within_service_window: withinServiceWindow(conv.last_inbound_at),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || 'conversations');
  const db = base44.asServiceRole;

  const permitted = await accountsForUser(db, user);
  const permittedNumbers = new Set(permitted.map((a) => a.phone_number_id));

  /** Rows the caller's tenant owns. The tenancy gate for every read below. */
  function visible(rows: any[]): any[] {
    return (rows || []).filter((r) => permittedNumbers.has(r?.phone_number_id));
  }

  if (action === 'health_probe') {
    return Response.json({
      status: 'ok',
      connected_accounts: permitted.filter(isUsable).length,
      autopilot_configured: autopilotConfigured(permitted),
    });
  }

  if (action === 'accounts') {
    // The inbox's number switcher. Ids and labels only — whatsappAccounts is
    // the one place credentials are read or written.
    return Response.json({
      accounts: permitted.map((a) => ({
        id: a.id || '', label: a.label || '', phone_number_id: a.phone_number_id,
        tenant_id: a.tenant_id || '', is_master: !!a.is_master, usable: isUsable(a),
      })),
    });
  }

  // ── list threads ────────────────────────────────────────────────────────
  if (action === 'conversations') {
    const limit = Math.min(Number(body.limit) || DEFAULT_CONVERSATION_LIMIT, 500);
    const conversations = visible(await listAll(db.entities.WhatsAppConversation, null, limit));
    const contacts = visible(await listAll(db.entities.WhatsAppContact, null, 1000));
    const contactById = new Map(contacts.map((c: any) => [c.id, c]));
    const contactByWaId = new Map(contacts.map((c: any) => [c.wa_id, c]));
    const needle = String(body.search || '').trim().toLowerCase();
    const statusFilter = body.status ? String(body.status) : '';

    const items = conversations
      .map((conv: any) => {
        const contact = contactById.get(conv.contact_id) || contactByWaId.get(conv.wa_id) || null;
        return { conv, contact };
      })
      .filter(({ conv, contact }: any) =>
        (!statusFilter || (conv.status || 'open') === statusFilter) &&
        matchesSearch(conv, contact, needle))
      .map(({ conv, contact }: any) => toListItem(conv, contact))
      .sort(byRecencyDesc);

    return Response.json({
      conversations: items,
      unread_total: items.reduce((n: number, c: any) => n + c.unread_count, 0),
      autopilot_configured: autopilotConfigured(permitted),
      server_time: new Date().toISOString(),
    });
  }

  // ── one thread ──────────────────────────────────────────────────────────
  if (action === 'thread') {
    const conversationId = String(body.conversation_id || '');
    if (!conversationId) return Response.json({ error: 'conversation_id is required' }, { status: 400 });

    const conv = await db.entities.WhatsAppConversation.get(conversationId).catch(() => null);
    if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 });
    // 404 rather than 403: whether a thread exists on another tenant's number
    // is itself information the caller is not entitled to.
    if (!permittedNumbers.has(conv.phone_number_id)) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const contact = conv.contact_id
      ? await db.entities.WhatsAppContact.get(conv.contact_id).catch(() => null)
      : (await listAll(db.entities.WhatsAppContact, { wa_id: conv.wa_id }, 1))[0] || null;

    const limit = Math.min(Number(body.limit) || DEFAULT_THREAD_LIMIT, 500);
    const rows = await listAll(db.entities.WhatsAppMessage, { conversation_id: conversationId }, limit);
    const messages = rows.sort(byTimeAsc).map((m: any) => ({
      id: m.id,
      wamid: m.wamid || '',
      direction: m.direction,
      author: m.author || (m.direction === 'inbound' ? 'contact' : 'human_agent'),
      author_email: m.author_email || '',
      message_type: m.message_type || 'text',
      body: m.body || '',
      media_id: m.media_id || '',
      media_mime: m.media_mime || '',
      media_filename: m.media_filename || '',
      media_url: m.media_url || '',
      template_name: m.template_name || '',
      status: m.status || 'sent',
      error_code: m.error_code || '',
      error_detail: m.error_detail || '',
      call_session_id: m.call_session_id || '',
      wa_timestamp: m.wa_timestamp || m.created_date || '',
    }));

    return Response.json({
      conversation: toListItem(conv, contact),
      contact: contact
        ? {
            id: contact.id, wa_id: contact.wa_id, phone_e164: contact.phone_e164 || '',
            profile_name: contact.profile_name || '', display_name: contact.display_name || '',
            tags: contact.tags || [], notes: contact.notes || '', opted_out: !!contact.opted_out,
          }
        : null,
      messages,
      cursor: messages.length ? messages[messages.length - 1].id : '',
      server_time: new Date().toISOString(),
    });
  }

  // ── control actions on a thread ─────────────────────────────────────────
  if (['claim', 'release', 'read', 'close', 'reopen'].includes(action)) {
    const conversationId = String(body.conversation_id || '');
    if (!conversationId) return Response.json({ error: 'conversation_id is required' }, { status: 400 });
    const target = await db.entities.WhatsAppConversation.get(conversationId).catch(() => null);
    if (!target || !permittedNumbers.has(target.phone_number_id)) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    const now = new Date().toISOString();

    const patch: Record<string, unknown> =
      action === 'claim'
        ? { handling_mode: 'human', claimed_by_id: user.id, claimed_by_email: user.email || '', claimed_at: now, unread_count: 0 }
      : action === 'release'
        // Clearing the claim fields matters: the list shows "held by <email>"
        // off them, and a released thread has no holder.
        ? { handling_mode: 'ai_autopilot', claimed_by_id: '', claimed_by_email: '', claimed_at: '' }
      : action === 'read'   ? { unread_count: 0 }
      : action === 'close'  ? { status: 'closed' }
      :                       { status: 'open' };

    const updated = await db.entities.WhatsAppConversation.update(conversationId, patch).catch((e: any) => {
      return { __error: e?.message || 'update failed' };
    });
    if ((updated as any)?.__error) {
      return Response.json({ error: (updated as any).__error }, { status: 500 });
    }
    return Response.json({ ok: true, action, conversation_id: conversationId, ...patch });
  }

  // ── contact edits ───────────────────────────────────────────────────────
  if (action === 'contact') {
    const contactId = String(body.contact_id || '');
    if (!contactId) return Response.json({ error: 'contact_id is required' }, { status: 400 });
    const targetContact = await db.entities.WhatsAppContact.get(contactId).catch(() => null);
    if (!targetContact || !permittedNumbers.has(targetContact.phone_number_id)) {
      return Response.json({ error: 'Contact not found' }, { status: 404 });
    }
    const patch: Record<string, unknown> = {};
    if (typeof body.display_name === 'string') patch.display_name = body.display_name.slice(0, 120);
    if (Array.isArray(body.tags)) patch.tags = body.tags.map((t: unknown) => String(t).slice(0, 40)).slice(0, 20);
    if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 4000);
    if (typeof body.opted_out === 'boolean') patch.opted_out = body.opted_out;
    if (!Object.keys(patch).length) return Response.json({ error: 'Nothing to update' }, { status: 400 });

    await db.entities.WhatsAppContact.update(contactId, patch).catch(() => {});
    return Response.json({ ok: true, contact_id: contactId, ...patch });
  }

  // ── media URL resolution ────────────────────────────────────────────────
  if (action === 'media') {
    const mediaId = String(body.media_id || '');
    if (!mediaId) return Response.json({ error: 'media_id is required' }, { status: 400 });

    // Attachments are fetched with the credentials of the account that received
    // them — a tenant's media is not readable with the platform's token.
    const owner = await db.entities.WhatsAppMessage.filter({ media_id: mediaId }).catch(() => []);
    const ownerNumber = owner?.[0]?.phone_number_id || '';
    if (!ownerNumber || !permittedNumbers.has(ownerNumber)) {
      return Response.json({ error: 'Attachment not found' }, { status: 404 });
    }
    const mediaAccount = permitted.find((a) => a.phone_number_id === ownerNumber);
    if (!isUsable(mediaAccount || null)) {
      return Response.json({ error: 'That account is not connected' }, { status: 503 });
    }

    // Graph hands back a URL that expires in minutes and needs the bearer token
    // to fetch, so it is resolved per view rather than stored.
    const res = await fetch(`${GRAPH_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${(mediaAccount as WhatsAppAccount).access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({ error: json?.error?.message || 'Media lookup failed' }, { status: res.status });
    }
    return Response.json({ url: json?.url || '', mime_type: json?.mime_type || '', file_size: json?.file_size || 0 });
  }

  return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
});
