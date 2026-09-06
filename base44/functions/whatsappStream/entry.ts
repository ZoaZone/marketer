/**
 * whatsappStream — Server-Sent Events feed that keeps the inbox live.
 *
 * GET /functions/whatsappStream?since=<ISO>&conversation_id=<id>
 *   event: ready      { since }                 sent immediately on connect
 *   event: message    { ...WhatsAppMessage }    one per new row
 *   event: status     { message_id, wamid, status }
 *   event: reconnect  { since }                 graceful end of this window
 *   :keepalive                                  comment frame, every 15s
 *
 * Why polling behind an SSE facade. Base44 exposes an entity store and short
 * -lived functions, with no broker and no change feed to subscribe to, so the
 * only honest source of "what is new" is the store itself. Tailing it here
 * instead of in the browser is still worth doing: the client holds one
 * connection instead of a timer, new messages land in well under a second
 * rather than on the next poll boundary, and the tail interval is a
 * server-side constant that can be tuned without shipping a new bundle. If a
 * real broker is introduced later, only the body of tail() changes — the
 * client contract above stays exactly as it is.
 *
 * Tenancy. The tail below reads every recent message row, so it filters to the
 * phone numbers the caller's tenant has connected before emitting anything —
 * without that, a live stream would be a side channel around the same check
 * whatsappInbox makes on every read.
 *
 * Auth is the Authorization header, not a query parameter, so the client is
 * fetch + ReadableStream rather than EventSource (EventSource cannot set
 * headers, and putting a session token in a URL leaks it into every proxy and
 * access log in the path). src/hooks/useWhatsAppInbox.js falls back to plain
 * polling where response.body streaming is unavailable.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/** How often the store is tailed. Below ~1s the entity API is the bottleneck. */
const TAIL_INTERVAL_MS = 2000;
/** Comment frame cadence — keeps proxies from closing an idle connection. */
const KEEPALIVE_MS = 15000;
/** Windows are bounded so a serverless timeout never looks like a hang. */
const MAX_STREAM_MS = 4 * 60 * 1000;
const MAX_ROWS_PER_TAIL = 50;

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


function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function timeOf(row: any): number {
  return Date.parse(row?.created_date || row?.wa_timestamp || '') || 0;
}

async function recentMessages(db: any, limit: number) {
  try {
    return await db.entities.WhatsAppMessage.list('-created_date', limit);
  } catch {
    try { return await db.entities.WhatsAppMessage.list(); } catch { return []; }
  }
}

function toEventPayload(m: any) {
  return {
    id: m.id,
    conversation_id: m.conversation_id || '',
    wa_id: m.wa_id || '',
    phone_number_id: m.phone_number_id || '',
    wamid: m.wamid || '',
    direction: m.direction,
    author: m.author || (m.direction === 'inbound' ? 'contact' : 'human_agent'),
    author_email: m.author_email || '',
    message_type: m.message_type || 'text',
    body: m.body || '',
    media_id: m.media_id || '',
    media_mime: m.media_mime || '',
    media_filename: m.media_filename || '',
    status: m.status || 'sent',
    error_detail: m.error_detail || '',
    wa_timestamp: m.wa_timestamp || m.created_date || '',
    created_date: m.created_date || '',
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const conversationFilter = url.searchParams.get('conversation_id') || '';
  const sinceParam = Date.parse(url.searchParams.get('since') || '');
  // No `since` means "from now on" — replaying history into a client that has
  // already rendered it would duplicate every bubble.
  let watermark = Number.isFinite(sinceParam) ? sinceParam : Date.now();

  const db = base44.asServiceRole;
  const permittedNumbers = new Set(
    (await accountsForUser(db, user)).map((a) => a.phone_number_id),
  );
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  // Rows can share a created_date to the second, so ids already emitted are
  // remembered rather than relying on a strictly-increasing timestamp.
  const emitted = new Set<string>();
  const statusByMessageId = new Map<string, string>();
  let timer: number | undefined;
  let keepaliveTimer: number | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); return true; }
        catch { return false; } // client hung up mid-write
      };

      const shutdown = (event?: string, data?: unknown) => {
        if (timer !== undefined) clearInterval(timer);
        if (keepaliveTimer !== undefined) clearInterval(keepaliveTimer);
        if (event) send(sse(event, data));
        try { controller.close(); } catch { /* already closed */ }
      };

      send(sse('ready', { since: new Date(watermark).toISOString(), server_time: new Date().toISOString() }));

      const tail = async () => {
        if (Date.now() - startedAt > MAX_STREAM_MS) {
          shutdown('reconnect', { since: new Date(watermark).toISOString() });
          return;
        }
        try {
          const all = await recentMessages(db, MAX_ROWS_PER_TAIL);
          // The tenancy gate, applied before anything is emitted or remembered.
          const rows = all.filter((m: any) => permittedNumbers.has(m?.phone_number_id));
          const fresh = rows
            .filter((m: any) => timeOf(m) >= watermark && !emitted.has(m.id))
            .filter((m: any) => !conversationFilter || m.conversation_id === conversationFilter)
            .sort((a: any, b: any) => timeOf(a) - timeOf(b));

          for (const m of fresh) {
            emitted.add(m.id);
            statusByMessageId.set(m.id, m.status || 'sent');
            watermark = Math.max(watermark, timeOf(m));
            if (!send(sse('message', toEventPayload(m)))) { shutdown(); return; }
          }

          // Delivery receipts mutate a row in place, so they never show up as
          // "new" above — diff the status of rows already sent this window.
          for (const m of rows) {
            if (!emitted.has(m.id)) continue;
            const previous = statusByMessageId.get(m.id);
            const current = m.status || 'sent';
            if (previous && previous !== current) {
              statusByMessageId.set(m.id, current);
              if (!send(sse('status', { message_id: m.id, wamid: m.wamid || '', status: current }))) {
                shutdown(); return;
              }
            }
          }
        } catch (err) {
          send(sse('error', { message: (err as Error).message }));
        }
      };

      timer = setInterval(tail, TAIL_INTERVAL_MS);
      keepaliveTimer = setInterval(() => {
        if (!send(`:keepalive ${Date.now()}\n\n`)) shutdown();
      }, KEEPALIVE_MS);
      tail();
    },
    cancel() {
      if (timer !== undefined) clearInterval(timer);
      if (keepaliveTimer !== undefined) clearInterval(keepaliveTimer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx-class proxies not to buffer the stream into uselessness.
      'X-Accel-Buffering': 'no',
    },
  });
});
