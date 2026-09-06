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
 * every thread from the very agents meant to work them. The gate is instead
 * the session check at the top of the handler — an unauthenticated caller
 * never reaches the entity store.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const SYSTEM_USER_TOKEN = Deno.env.get('WHATSAPP_SYSTEM_USER_TOKEN') || '';
const GRAPH_API_URL = Deno.env.get('WHATSAPP_GRAPH_API_URL') || 'https://graph.facebook.com/v20.0';
/**
 * Whether whatsappWebhook has anything to answer with. Reported to the UI so
 * the auto-pilot switch can say "nothing is configured" instead of implying a
 * bot that does not exist.
 */
const AUTOPILOT_CONFIGURED =
  !!(Deno.env.get('WHATSAPP_AI_FUNCTION') || Deno.env.get('WHATSAPP_AUTO_ACK_TEMPLATE'));

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

  if (action === 'health_probe') {
    return Response.json({
      status: 'ok',
      phone_number_id: PHONE_NUMBER_ID || null,
      autopilot_configured: AUTOPILOT_CONFIGURED,
    });
  }

  // ── list threads ────────────────────────────────────────────────────────
  if (action === 'conversations') {
    const limit = Math.min(Number(body.limit) || DEFAULT_CONVERSATION_LIMIT, 500);
    const conversations = await listAll(db.entities.WhatsAppConversation, null, limit);
    const contacts = await listAll(db.entities.WhatsAppContact, null, 1000);
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
      autopilot_configured: AUTOPILOT_CONFIGURED,
      server_time: new Date().toISOString(),
    });
  }

  // ── one thread ──────────────────────────────────────────────────────────
  if (action === 'thread') {
    const conversationId = String(body.conversation_id || '');
    if (!conversationId) return Response.json({ error: 'conversation_id is required' }, { status: 400 });

    const conv = await db.entities.WhatsAppConversation.get(conversationId).catch(() => null);
    if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 });

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
    if (!SYSTEM_USER_TOKEN) return Response.json({ error: 'WhatsApp is not configured' }, { status: 503 });

    // Graph hands back a URL that expires in minutes and needs the bearer token
    // to fetch, so it is resolved per view rather than stored.
    const res = await fetch(`${GRAPH_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${SYSTEM_USER_TOKEN}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({ error: json?.error?.message || 'Media lookup failed' }, { status: res.status });
    }
    return Response.json({ url: json?.url || '', mime_type: json?.mime_type || '', file_size: json?.file_size || 0 });
  }

  return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
});
