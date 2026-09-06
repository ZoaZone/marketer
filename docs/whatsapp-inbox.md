# WhatsApp CRM inbox — Hello Biz (+1 256-699-8899)

A shared team inbox for the "Hello Biz" WhatsApp Business Account. Meta's Cloud
API webhook feeds conversations into this app, staff reply from a
mobile-responsive UI at `/whatsapp-inbox`, and the thread updates without a reload.

This is the same module deployed across the ZoaZone apps; the canonical copy
and the shared cPanel webhook relay live in
[`ZoaZone/os-aevoice`](https://github.com/ZoaZone/os-aevoice)
(`deploy/zoazoneservices/`).

## Assets

| Thing | Value |
| --- | --- |
| Business Portfolio | EllowPage.com — `2033653677389005` |
| App | Zoa Zone Direct — `2266003414253985` |
| WABA | Hello Biz — `1742983153672564` |
| Display number | +1 (256) 699-8899 — phone number id `902301109637859` |
| System user | Karnati — `61593895894003` |
| Public webhook | `https://zoazoneservices.com/webhook.php` |
| Graph API | `v20.0` |

## How the pieces fit

```
WhatsApp user
     │  message to +1 256 699-8899
     ▼
Meta Cloud API ──POST──►  zoazoneservices.com/webhook.php   (shared PHP relay)
     ▲                            │  verifies X-Hub-Signature-256
     │                            │  forwards raw body + X-Relay-Token
     │                            ▼
     │                    whatsappWebhook  (Base44 Deno function)
     │                            │  upsert contact → conversation → message
     │                            │  dedupe on wamid
     │                            ▼
     │                      Base44 entity store
     │                            │
     │                            ├──► whatsappStream  (SSE) ──► browser inbox
     │                            └──► whatsappInbox   (list / thread / claim)
     │                                                              │
     └────── whatsappSend ◄── an agent types a reply ───────────────┘
```

Meta allows one callback URL per app, and more than one workspace wants this
feed, so the relay owns the public address and fans each delivery out. Add this
app as a target in the relay's `webhook.config.php`:

```php
[
    'name'        => 'marketer',
    'url'         => 'https://base44.app/api/apps/prod/<THIS_APP_ID>/functions/whatsappWebhook',
    'relay_token' => '<matches WHATSAPP_RELAY_TOKEN in this app\'s secrets>',
],
```

`whatsappWebhook` also accepts Meta's own signed POST directly, so Meta can be
pointed straight at this function instead.

## Configure secrets

Backend only. Nothing here gets a `VITE_` prefix — Vite inlines every `VITE_`
variable into the public bundle, which would hand the system-user token to
every browser that loads the app. In the Base44 builder → **Secrets**:

```
WHATSAPP_PHONE_NUMBER_ID="902301109637859"
WHATSAPP_WABA_ID="1742983153672564"
WHATSAPP_SYSTEM_USER_TOKEN="<permanent system-user token for Karnati>"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="my_custom_secret_token_123"
WHATSAPP_GRAPH_API_URL="https://graph.facebook.com/v20.0"
WHATSAPP_APP_SECRET="<App Dashboard → Settings → Basic>"
WHATSAPP_RELAY_TOKEN="<openssl rand -hex 32, matching the relay>"
```

Generate the token as a **permanent** system-user token with the Zoa Zone
Direct app selected and both `whatsapp_business_messaging` and
`whatsapp_business_management` granted — a 60-day user token silently stops the
inbox two months later.

### Automatic replies are opt-in

A thread in auto-pilot is answered by whichever of these is configured, in
order; with neither set it stays unread for a human, which is the safe default.
A missing reply sits visibly in the inbox, whereas a wrong automated one has
already reached the customer by the time anyone notices.

```
WHATSAPP_AI_FUNCTION=""          # a deployed function returning { reply: "..." }
WHATSAPP_AUTO_ACK_TEMPLATE=""    # an approved template, sent once per thread
WHATSAPP_AUTO_ACK_LANGUAGE="en_US"
```

`WHATSAPP_AI_FUNCTION` is invoked as
`{ channel, conversation_id, agent_id, contact: { wa_id, name }, message: { type, text } }`
and may return `{ reply }`, `{ text }`, or nothing. Anything it returns is sent
verbatim, so point it at an assistant whose output you are willing to publish
to a customer unreviewed.

## Verification protocol

### 1. GET handshake

```bash
curl -i "https://zoazoneservices.com/webhook.php?hub.mode=subscribe\
&hub.verify_token=my_custom_secret_token_123&hub.challenge=1158201444"
```

Expect `200`, `Content-Type: text/plain`, body exactly `1158201444` — no JSON
wrapper, no trailing newline. A wrong token must return `403`.

### 2. Inbound message → UI updates with no reload

1. Open `/whatsapp-inbox` and sign in.
2. From an external phone, WhatsApp **+1 (256) 699-8899**.
3. Within a second or two the thread appears at the top of the list with an
   unread badge and the bubble renders — no refresh.
4. The header badge reads **Live**. **Polling** means the SSE connection was
   refused or the browser cannot stream; the inbox still works, updates just
   arrive on the poll interval.

### 3. Outbound reply → received on the phone

Type a reply and send. The bubble appears as `queued`, then flips to a single
check (`sent`), a double check (`delivered`) and blue (`read`) as Meta's status
webhooks come back.

### 4. Automated checks

```bash
npm run test:whatsapp
npm run lint
npm run build
```

## Mobile

One responsive rule applied twice: below 768px the list and the thread are
separate screens with a back button; at 768px they sit side by side; at 1280px
the contact/controls column joins them. The composer sits inside a dynamic
-viewport shell so iOS Safari's collapsing URL bar cannot hide it, and inputs
are 16px on mobile so focusing one does not zoom the page.

## Master account vs tenant accounts

Two kinds of account share this module.

**The master account** is the platform's own number, configured in the
environment and enabled by `WHATSAPP_MASTER_ACCOUNT=true`. It is what this app
messages from on its own behalf.

**Tenant accounts** are rows in `WhatsAppAccount`, each holding credentials a
tenant connected through the WhatsApp settings page so they can message under
their **own** business name. A tenant never borrows the platform's WABA — a
shared number would put one business's outbound messages under another's
verified name and quality rating, and would tie their quality scores together.

Everything routes on `phone_number_id`, the id Meta puts in every delivery's
`value.metadata`. There is deliberately no "if we cannot tell whose number this
is, use the platform account" branch: an unrecognised number is refused with a
404, because guessing is exactly how cross-tenant leakage happens.

### What a tenant does

1. Open the WhatsApp settings page and press **Connect a WhatsApp account**.
2. Paste their **phone number ID** and **WABA ID** (Meta App Dashboard →
   WhatsApp → API Setup), a **system user access token**, a **verify token**
   they choose, and their **app secret**.
3. Copy the **callback URL** shown on that page into Meta → WhatsApp →
   Configuration, set the same verify token there, and subscribe to the
   `messages` field.
4. Press **Test connection** — this asks Graph to confirm the credentials and
   shows the verified name and quality rating Meta has on file. A paste that
   looks right and a paste that works are different things, and finding out at
   send time means finding out in front of a customer.

Credentials are write-only. They are stored under the service role and never
returned to a browser, not even to the admin who typed them: reads get a
four-character tail (`…kf9Q`), which is enough to tell one stored token from
another and not enough to use it. Saving with a secret field left blank keeps
the stored value rather than clearing it, so editing a label cannot silently
wipe a token nobody can read back.

### How isolation is enforced

Every function reads through `asServiceRole`, because the inbox is shared team
state and the webhook writes rows with no `created_by_id` — a row-level rule
would hide threads from the very agents meant to work them. That makes the
tenancy check explicit code rather than a database rule, so it is asserted in
`tests/whatsapp/webhookContract.test.mjs` rather than assumed:

- threads are keyed on `(wa_id, phone_number_id)`, so one person messaging two
  tenants is two separate conversations;
- the inbox filters every read to the numbers the caller's tenant connected;
- a thread on someone else's number reads as **404, not 403** — whether it
  exists is itself information the caller is not entitled to;
- the live SSE stream applies the same filter before emitting anything, so it
  cannot be used as a side channel around the check;
- sending is restricted to numbers the caller's tenant connected, and the
  sending number comes from the thread rather than from the caller;
- attachments are fetched with the receiving account's own token.

## Operational notes

- **The 24-hour window.** WhatsApp only allows free-form replies within 24
  hours of the contact's last inbound message. The composer disables itself and
  points at the template picker when the window closes; `whatsappSend` enforces
  the same rule server-side and returns `outside_service_window`.
- **Templates.** Only `APPROVED` templates are offered. Approval state changes
  on Meta's side without notifying us, so the list is fetched live, never cached.
- **Opt-out.** Setting *Opted out* on a contact blocks every outbound message,
  the auto-pilot's included.
- **Idempotency.** Meta retries a delivery until it gets a 200 and reuses the
  `wamid`, so every inbound message is looked up by `wamid` before it is written.
- **Media.** Meta's media URLs expire within minutes and need the bearer token,
  so attachments are resolved on demand rather than stored.
- **Realtime.** Base44 has no message broker, so `whatsappStream` tails the
  entity store behind an SSE facade. If a broker is introduced later, only the
  body of `tail()` changes — the client contract stays as it is.

## Files

| Path | Role |
| --- | --- |
| `base44/functions/whatsappWebhook/entry.ts` | GET handshake + POST ingestion, dedupe, auto-pilot routing |
| `base44/functions/whatsappSend/entry.ts` | Outbound text / media / template + media upload |
| `base44/functions/whatsappInbox/entry.ts` | Thread list, thread, claim/release, contact edits, media URLs |
| `base44/functions/whatsappStream/entry.ts` | SSE feed |
| `base44/functions/whatsappTemplates/entry.ts` | Approved template listing |
| `base44/entities/WhatsApp{Contact,Conversation,Message}.jsonc` | Data model |
| `src/pages/WhatsAppInbox.jsx` | The page and its responsive layout |
| `src/components/whatsapp/` | List, panel, bubbles, composer, template picker, mode toggle |
| `src/hooks/useWhatsAppInbox.js` | Queries, SSE with polling fallback, mutations |
| `src/api/whatsappAPI.js` | Function calls + the hand-rolled SSE reader |
| `src/lib/whatsapp/payload.js` | Pure helpers shared by UI and tests |
| `tests/whatsapp/` | Unit tests + function contract tests |
