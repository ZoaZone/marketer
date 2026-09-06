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
const accountsSource = read('whatsappAccounts');
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
    expect(webhookSource).toMatch(/safeEqual\(token, a\.verify_token\)/);
    // A plain === here would leak the token one character at a time.
    expect(webhookSource).not.toMatch(/token === .*verify_token/);
  });

  test('verifies the Meta signature with HMAC-SHA256 over the raw body', () => {
    expect(webhookSource).toMatch(/x-hub-signature-256/);
    expect(webhookSource).toMatch(/HMAC/);
    expect(webhookSource).toMatch(/SHA-256/);
    // Against the resolved account's own secret, not a shared one.
    expect(webhookSource).toMatch(/verifyMetaSignature\(rawBody, signature, account\.app_secret/);
  });

  test('rejects a delivery that carries neither a signature nor a relay token', () => {
    expect(webhookSource).toMatch(/if \(!signatureOk && !relayOk\)/);
    expect(webhookSource).toMatch(/status: 401/);
  });

  test('nothing is written or sent before the signature is checked', () => {
    // The body IS parsed first, because the phone number id inside it selects
    // which secret to verify against — that ordering is forced by
    // multi-tenancy. What matters is that the parse is inert: no entity write
    // and no outbound message happens until authentication has passed.
    const authIdx = webhookSource.indexOf('if (!signatureOk && !relayOk)');
    const parseIdx = webhookSource.indexOf('JSON.parse(rawBody)');
    const writeIdx = webhookSource.indexOf('await handleInboundMessages(db, account, value, stats)');
    const statusIdx = webhookSource.indexOf('await handleStatuses(db, value, stats)');

    expect(parseIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(parseIdx);
    expect(writeIdx).toBeGreaterThan(authIdx);
    expect(statusIdx).toBeGreaterThan(authIdx);
  });

  test('an unauthenticated delivery is refused with a 401', () => {
    expect(webhookSource).toMatch(/Unauthorized webhook delivery/);
    expect(webhookSource).toMatch(/status: 401/);
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

  test('sends through Graph from the resolved account, with its own token', () => {
    expect(webhookSource).toMatch(/\$\{GRAPH_API_URL\}\/\$\{account\.phone_number_id\}\/messages/);
    expect(webhookSource).toMatch(/Bearer \$\{account\.access_token\}/);
  });

  test('automatic replies are opt-in, per account', () => {
    // An account that configured neither answers nobody, rather than falling
    // back to some deployment-wide default that speaks for every tenant.
    expect(webhookSource).toMatch(/if \(account\.ai_function && await replyWithAI/);
    expect(webhookSource).toMatch(/if \(account\.auto_ack_template\) await sendAutoAck/);
  });

  test('the assistant function is named by the account, never hardcoded', () => {
    expect(webhookSource).toMatch(/db\.functions\.invoke\(account\.ai_function/);
    expect(webhookSource).not.toMatch(/invoke\(['"]\w+Chat['"]/);
  });

  test('the acknowledgement is sent at most once per thread', () => {
    expect(webhookSource).toMatch(/if \(conversation\.auto_ack_sent_at\) return;/);
    expect(webhookSource).toMatch(/auto_ack_sent_at: new Date\(\)\.toISOString\(\)/);
  });

  test('a delivery is refused unless some account owns the phone number id', () => {
    expect(webhookSource).toMatch(/accountByPhoneNumberId\(db, phoneNumberId\)/);
    expect(webhookSource).toMatch(/if \(!account\) \{/);
    expect(webhookSource).toMatch(/status: 404/);
  });

  test('each change is re-checked against the authenticated account', () => {
    expect(webhookSource).toMatch(
      /value\?\.metadata\?\.phone_number_id \|\| ''\) !== account\.phone_number_id/);
  });

  test('the handshake matches the token against every connected account', () => {
    expect(webhookSource).toMatch(/accounts\.some\(\(a\) => a\.verify_token && safeEqual\(token, a\.verify_token\)\)/);
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

  test('no secret is hardcoded — every one comes from an account or the env', () => {
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

  test('posts to the messages edge of the sending account, with its own token', () => {
    expect(sendSource).toMatch(/\$\{GRAPH_API_URL\}\/\$\{sender\.phone_number_id\}\/messages/);
    expect(sendSource).toMatch(/Authorization: `Bearer \$\{account\.access_token\}`/);
    expect(sendSource).toMatch(/'Content-Type': 'application\/json'/);
    // v20.0 remains the default when WHATSAPP_GRAPH_API_URL is unset.
    expect(sendSource).toMatch(/graph\.facebook\.com\/v20\.0/);
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


describe('multi-tenancy: one tenant never reaches another\'s traffic', () => {
  // Every function bypasses RLS with asServiceRole because the inbox is shared
  // team state. That makes the tenancy check explicit code rather than a
  // database rule, so it is asserted here rather than assumed.

  test('the platform account is opt-in and off by default', () => {
    for (const source of [webhookSource, sendSource, inboxSource, streamSource, templatesSource]) {
      expect(source).toMatch(/WHATSAPP_MASTER_ACCOUNT/);
      expect(source).toMatch(/if \(!IS_MASTER\) return null;/);
    }
  });

  test('there is no "when in doubt, use the platform account" fallback', () => {
    // accountByPhoneNumberId returns null for an unknown number. A default
    // here is how one business messages under another's verified name.
    expect(webhookSource).toMatch(
      /return master && master\.phone_number_id === phoneNumberId \? master : null;/);
  });

  test('threads are keyed on (wa_id, phone_number_id), not wa_id alone', () => {
    expect(webhookSource).toMatch(/filter\(\{ wa_id: waId, phone_number_id: account\.phone_number_id \}\)/);
    expect(sendSource).toMatch(/filter\(\{ wa_id: waId, phone_number_id: phoneNumberId \}\)/);
  });

  test('the inbox filters every read to the caller\'s own numbers', () => {
    expect(inboxSource).toMatch(/accountsForUser\(db, user\)/);
    expect(inboxSource).toMatch(/function visible\(rows: any\[\]\)/);
    expect(inboxSource).toMatch(/visible\(await listAll\(db\.entities\.WhatsAppConversation/);
    expect(inboxSource).toMatch(/visible\(await listAll\(db\.entities\.WhatsAppContact/);
  });

  test('a thread on someone else\'s number reads as absent, not forbidden', () => {
    // 403 would confirm the thread exists; 404 does not.
    expect(inboxSource).toMatch(/if \(!permittedNumbers\.has\(conv\.phone_number_id\)\) \{/);
    expect(inboxSource).toMatch(/Conversation not found/);
  });

  test('the live stream applies the same filter before emitting anything', () => {
    expect(streamSource).toMatch(/permittedNumbers/);
    expect(streamSource).toMatch(/all\.filter\(\(m: any\) => permittedNumbers\.has\(m\?\.phone_number_id\)\)/);
  });

  test('sending is restricted to numbers the caller\'s tenant connected', () => {
    expect(sendSource).toMatch(/permittedIds\.has\(sender\.phone_number_id\)/);
    expect(sendSource).toMatch(/status: 403/);
  });

  test('templates come from the account being composed in', () => {
    expect(templatesSource).toMatch(/account\.waba_id/);
    expect(templatesSource).toMatch(/Bearer \$\{account\.access_token\}/);
  });

  test('attachments are fetched with the receiving account\'s token', () => {
    expect(inboxSource).toMatch(/mediaAccount/);
    expect(inboxSource).not.toMatch(/Bearer \$\{SYSTEM_USER_TOKEN\}/);
  });
});

describe('whatsappAccounts keeps credentials write-only', () => {
  test('secrets are redacted to a tail, never returned', () => {
    expect(accountsSource).toMatch(/function redactSecret/);
    expect(accountsSource).toMatch(/tail: s\.length <= 4 \? '••••' : `…\$\{s\.slice\(-4\)\}`/);
    // toClientView is the only shape returned, and it redacts every secret.
    for (const field of ['access_token', 'verify_token', 'app_secret', 'relay_token']) {
      expect(accountsSource).toMatch(new RegExp(`${field}: redactSecret\\(account\\.${field}\\)`));
    }
  });

  test('an omitted secret keeps the stored value instead of clearing it', () => {
    // A token cannot be read back, so a blank field must not mean "delete".
    expect(accountsSource).toMatch(/if \(typeof value === 'string' && value\.trim\(\)\) patch\[field\] = value\.trim\(\);/);
    expect(accountsSource).toMatch(/else if \(value === ''\) patch\[field\] = '';/);
  });

  test('a tenant cannot promote their row into the platform account', () => {
    expect(accountsSource).toMatch(/patch\.is_master = false;/);
    expect(accountsSource).toMatch(/if \(account\?\.is_master\) return false;/);
  });

  test('one phone number id cannot be connected twice', () => {
    // Two rows for one number would make an inbound delivery unroutable.
    expect(accountsSource).toMatch(/phone_number_id_taken/);
    expect(accountsSource).toMatch(/status: 409/);
  });

  test('credentials are checked against Graph, not just stored', () => {
    expect(accountsSource).toMatch(/function verifyWithGraph/);
    expect(accountsSource).toMatch(/display_phone_number,verified_name,quality_rating/);
  });

  test('disconnecting an account keeps its conversations', () => {
    expect(accountsSource).toMatch(/WhatsAppAccount\.delete\(id\)/);
    expect(accountsSource).not.toMatch(/WhatsAppConversation\.delete/);
    expect(accountsSource).not.toMatch(/WhatsAppMessage\.delete/);
  });
});
