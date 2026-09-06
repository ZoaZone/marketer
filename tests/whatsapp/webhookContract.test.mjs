/**
 * Contract tests for the WhatsApp Deno functions.
 *
 * The whatsapp function entry points use Deno.serve and npm: specifiers, so Node
 * cannot import and invoke them. Following the pattern already established in
 * tests/security/satyaDevProxyAuth.test.cjs, each rule that matters is tested
 * two ways:
 *
 *   1. a pure mirror of the decision, exercised in isolation, and
 *   2. an assertion that the real source still contains the guard being
 *      mirrored — so removing it in the function fails the suite even though
 *      the function itself never runs here.
 *
 * Run with: npm run test:whatsapp
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (name) => readFileSync(join(root, 'base44', 'functions', name, 'entry.ts'), 'utf8');

const webhookSource = read('whatsappWebhook');
const sendSource = read('whatsappSend');
const streamSource = read('whatsappStream');
const inboxSource = read('whatsappInbox');
const templatesSource = read('whatsappTemplates');
const payloadSource = readFileSync(join(root, 'src', 'lib', 'whatsapp', 'payload.js'), 'utf8');

// ── mirrors of the webhook's own decisions ──────────────────────────────────

/** Mirrors the GET branch: mode must be 'subscribe' and the token must match. */
function decideHandshake({ mode, token, challenge }, verifyToken) {
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: 'Forbidden' };
}

/** Mirrors the POST gate: a valid Meta signature OR a valid relay token. */
function decideWebhookAuth({ signatureOk, relayTokenOk }) {
  return signatureOk || relayTokenOk ? null : { status: 401 };
}

function metaSignature(body, secret) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('GET handshake (mirrored logic)', () => {
  const VERIFY_TOKEN = 'my_custom_secret_token_123';

  test('a correct subscribe echoes hub.challenge with a 200', () => {
    expect(decideHandshake(
      { mode: 'subscribe', token: VERIFY_TOKEN, challenge: '1158201444' }, VERIFY_TOKEN,
    )).toEqual({ status: 200, body: '1158201444' });
  });

  test('a wrong verify token is refused', () => {
    expect(decideHandshake(
      { mode: 'subscribe', token: 'guess', challenge: 'x' }, VERIFY_TOKEN,
    ).status).toBe(403);
  });

  test('a mode other than subscribe is refused even with the right token', () => {
    expect(decideHandshake(
      { mode: 'unsubscribe', token: VERIFY_TOKEN, challenge: 'x' }, VERIFY_TOKEN,
    ).status).toBe(403);
  });

  test('an unset verify token refuses everything rather than accepting anything', () => {
    expect(decideHandshake({ mode: 'subscribe', token: '', challenge: 'x' }, '').status).toBe(403);
  });
});

describe('POST authentication (mirrored logic)', () => {
  test('a valid Meta signature is accepted', () => {
    expect(decideWebhookAuth({ signatureOk: true, relayTokenOk: false })).toBeNull();
  });

  test('a valid relay token is accepted, for deliveries via the PHP relay', () => {
    expect(decideWebhookAuth({ signatureOk: false, relayTokenOk: true })).toBeNull();
  });

  test('neither one means 401 — an unconfigured deployment is closed, not open', () => {
    expect(decideWebhookAuth({ signatureOk: false, relayTokenOk: false })).toEqual({ status: 401 });
  });
});

describe('X-Hub-Signature-256 computation', () => {
  const secret = 'app-secret-under-test';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  test('the signature over the exact raw body verifies', () => {
    const header = metaSignature(body, secret);
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(header).toBe(expected);
  });

  test('one changed byte invalidates it — this is why the raw body is forwarded verbatim', () => {
    const header = metaSignature(body, secret);
    const tampered = `sha256=${createHmac('sha256', secret).update(`${body} `).digest('hex')}`;
    expect(tampered).not.toBe(header);
  });
});

// ── source invariants ───────────────────────────────────────────────────────

describe('whatsappWebhook source invariants', () => {
  test('answers the handshake with hub.challenge as a bare 200 body', () => {
    expect(webhookSource).toMatch(/hub\.mode/);
    expect(webhookSource).toMatch(/hub\.verify_token/);
    expect(webhookSource).toMatch(/hub\.challenge/);
    expect(webhookSource).toMatch(/new Response\(challenge/);
    expect(webhookSource).toMatch(/text\/plain/);
  });

  test('compares the verify token in constant time', () => {
    expect(webhookSource).toMatch(/function safeEqual/);
    expect(webhookSource).toMatch(/safeEqual\(token, VERIFY_TOKEN\)/);
  });

  test('verifies the Meta signature with HMAC-SHA256 over the raw body', () => {
    expect(webhookSource).toMatch(/x-hub-signature-256/);
    expect(webhookSource).toMatch(/HMAC/);
    expect(webhookSource).toMatch(/SHA-256/);
    expect(webhookSource).toMatch(/verifyMetaSignature\(rawBody/);
  });

  test('rejects a delivery that carries neither a signature nor a relay token', () => {
    expect(webhookSource).toMatch(/if \(!signatureOk && !relayOk\)/);
    expect(webhookSource).toMatch(/status: 401/);
  });

  test('authenticates before parsing the body', () => {
    const authIdx = webhookSource.indexOf('if (!signatureOk && !relayOk)');
    const parseIdx = webhookSource.indexOf('JSON.parse(rawBody)');
    expect(authIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(parseIdx);
  });

  test('dedupes on wamid, because Meta retries the same delivery', () => {
    expect(webhookSource).toMatch(/WhatsAppMessage\s*\.filter\(\{ wamid/);
    expect(webhookSource).toMatch(/stats\.duplicates\+\+/);
  });

  test('only handles the "messages" field', () => {
    expect(webhookSource).toMatch(/change\?\.field !== 'messages'/);
  });

  test('processes delivery statuses as well as messages', () => {
    expect(webhookSource).toMatch(/handleStatuses/);
    expect(webhookSource).toMatch(/value\?\.statuses/);
  });

  test('a thread a human has claimed is never answered by the bot', () => {
    expect(webhookSource).toMatch(/handling_mode === 'human'/);
    expect(webhookSource).toMatch(/if \(!claimed && !contact\.opted_out\)/);
  });

  test('sends through Graph with the system user token as a bearer', () => {
    expect(webhookSource).toMatch(/\$\{GRAPH_API_URL\}\/\$\{PHONE_NUMBER_ID\}\/messages/);
    expect(webhookSource).toMatch(/Bearer \$\{SYSTEM_USER_TOKEN\}/);
  });

  test('automatic replies are opt-in: nothing is sent unless one is configured', () => {
    // The whole point of the ordering below is that an unconfigured
    // deployment answers nobody, rather than falling back to some default.
    expect(webhookSource).toMatch(/Deno\.env\.get\('WHATSAPP_AI_FUNCTION'\)/);
    expect(webhookSource).toMatch(/Deno\.env\.get\('WHATSAPP_AUTO_ACK_TEMPLATE'\)/);
    expect(webhookSource).toMatch(/if \(AI_FUNCTION && await replyWithAI/);
    expect(webhookSource).toMatch(/if \(AUTO_ACK_TEMPLATE\) await sendAutoAck/);
  });

  test('the assistant function is named by configuration, never hardcoded', () => {
    expect(webhookSource).toMatch(/db\.functions\.invoke\(AI_FUNCTION,/);
    expect(webhookSource).not.toMatch(/invoke\(['"]\w+Chat['"]/);
  });

  test('the acknowledgement is sent at most once per thread', () => {
    expect(webhookSource).toMatch(/if \(conversation\.auto_ack_sent_at\) return;/);
    expect(webhookSource).toMatch(/auto_ack_sent_at: new Date\(\)\.toISOString\(\)/);
  });

  test('an assistant that returns nothing usable leaves the thread for a human', () => {
    expect(webhookSource).toMatch(/if \(!replyText \|\| typeof replyText !== 'string'\) return false;/);
  });

  test('webhook counters stay out of the entity store', () => {
    // Delivery statistics are not application data, and coupling this module
    // to whatever audit table an app happens to have would break the port.
    expect(webhookSource).toMatch(/console\.error\(line\)/);
    expect(webhookSource).not.toMatch(/SatyaActionLog|AiInteractionLog/);
  });

  test('no secret is hardcoded — every one is read from the environment', () => {
    expect(webhookSource).toMatch(/Deno\.env\.get\('WHATSAPP_WEBHOOK_VERIFY_TOKEN'\)/);
    expect(webhookSource).toMatch(/Deno\.env\.get\('WHATSAPP_SYSTEM_USER_TOKEN'\)/);
    // A real Meta system-user token starts with EAA and runs to ~200 chars.
    expect(webhookSource).not.toMatch(/EAA[A-Za-z0-9]{40,}/);
  });
});

describe('whatsappSend source invariants', () => {
  test('requires an authenticated session before doing anything', () => {
    const authIdx = sendSource.indexOf('base44.auth.me()');
    const bodyIdx = sendSource.indexOf('await req.json()');
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(bodyIdx);
    expect(sendSource).toMatch(/status: 401/);
  });

  test('posts to the v20.0 messages edge for the Hello Biz phone number id', () => {
    expect(sendSource).toMatch(/\$\{GRAPH_API_URL\}\/\$\{PHONE_NUMBER_ID\}\/messages/);
    expect(sendSource).toMatch(/Authorization: `Bearer \$\{SYSTEM_USER_TOKEN\}`/);
    expect(sendSource).toMatch(/'Content-Type': 'application\/json'/);
  });

  test('supports text, media and template sends', () => {
    expect(sendSource).toMatch(/'text', 'media', 'template'/);
    expect(sendSource).toMatch(/type: 'template'/);
    expect(sendSource).toMatch(/\/media`/);
  });

  test('enforces the 24-hour window for anything that is not a template', () => {
    expect(sendSource).toMatch(/SERVICE_WINDOW_MS/);
    expect(sendSource).toMatch(/action !== 'template' && !withinServiceWindow/);
    expect(sendSource).toMatch(/outside_service_window/);
  });

  test('refuses to message a contact who opted out', () => {
    expect(sendSource).toMatch(/contact\?\.opted_out/);
    expect(sendSource).toMatch(/opted_out'/);
  });

  test('records a failed send instead of dropping it', () => {
    expect(sendSource).toMatch(/status: 'failed'/);
  });
});

describe('whatsappStream source invariants', () => {
  test('serves a real event stream, unbuffered', () => {
    expect(streamSource).toMatch(/text\/event-stream/);
    expect(streamSource).toMatch(/'X-Accel-Buffering': 'no'/);
    expect(streamSource).toMatch(/Cache-Control': 'no-cache/);
  });

  test('authenticates the connection', () => {
    expect(streamSource).toMatch(/base44\.auth\.me\(\)/);
    expect(streamSource).toMatch(/status: 401/);
  });

  test('keeps the connection alive and closes it on a bounded window', () => {
    expect(streamSource).toMatch(/keepalive/);
    expect(streamSource).toMatch(/MAX_STREAM_MS/);
    expect(streamSource).toMatch(/'reconnect'/);
  });

  test('clears its timers when the client disconnects', () => {
    expect(streamSource).toMatch(/cancel\(\)/);
    expect(streamSource).toMatch(/clearInterval/);
  });
});

describe('whatsappInbox and whatsappTemplates source invariants', () => {
  test('both refuse unauthenticated callers', () => {
    for (const source of [inboxSource, templatesSource]) {
      expect(source).toMatch(/base44\.auth\.me\(\)/);
      expect(source).toMatch(/status: 401/);
    }
  });

  test('claim and release actually flip handling_mode', () => {
    expect(inboxSource).toMatch(/handling_mode: 'human'/);
    expect(inboxSource).toMatch(/handling_mode: 'ai_autopilot'/);
  });

  test('only APPROVED templates are offered to the composer', () => {
    expect(templatesSource).toMatch(/APPROVED/);
    expect(templatesSource).toMatch(/message_templates/);
  });
});

describe('webhook and frontend agree on how a message is flattened', () => {
  // normalizeInbound exists twice — once in the Deno webhook, once in the
  // frontend helper — because a Deno function cannot import from src/. These
  // assertions are what stops the two copies drifting apart unnoticed.
  const branches = [
    "type === 'text'", "CAPTIONED_MEDIA.includes(type)", "type === 'sticker'",
    "type === 'location'", "type === 'button'", "type === 'interactive'",
    "type === 'reaction'", "type === 'contacts'",
  ];

  test.each(branches)('both implementations handle %s', (branch) => {
    expect(webhookSource).toContain(branch);
    expect(payloadSource).toContain(branch);
  });

  test('both default an unknown type to unsupported', () => {
    expect(webhookSource).toMatch(/msg\?\.type \|\| 'unsupported'/);
    expect(payloadSource).toMatch(/msg\?\.type \|\| 'unsupported'/);
  });
});
