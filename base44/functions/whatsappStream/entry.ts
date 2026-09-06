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
          const rows = await recentMessages(db, MAX_ROWS_PER_TAIL);
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
