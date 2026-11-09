/**
 * whatsappTemplates — a connected account's approved message templates.
 *
 * POST /functions/whatsappTemplates  { action?: "list" }
 *   → { templates: [{ name, language, status, category, body, variables }] }
 *
 * Reads GET {graph}/{waba_id}/message_templates for the account being composed
 * from — a tenant sees their own templates and only their own, because the
 * WABA id and token both come from their account row.
 *
 * Keeps only APPROVED templates (the
 * composer must not offer a template Meta will reject at send time), and
 * flattens each into the two things the picker actually needs: the body text
 * to preview and how many {{n}} placeholders to collect.
 *
 * The listing is fetched live rather than cached in an entity: template
 * approval state changes on Meta's side without notifying us, and a stale
 * "approved" is exactly the failure this endpoint exists to prevent.
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


const TEMPLATE_FIELDS = 'name,language,status,category,components';
const PAGE_LIMIT = 200;

/** Highest {{n}} in the body — how many values the agent must supply. */
function countVariables(text: string): number {
  const matches = String(text || '').match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  return matches.reduce((max, token) => {
    const n = Number(token.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

function flatten(tpl: any) {
  const components = Array.isArray(tpl?.components) ? tpl.components : [];
  const bodyComponent = components.find((c: any) => c?.type === 'BODY');
  const headerComponent = components.find((c: any) => c?.type === 'HEADER');
  const footerComponent = components.find((c: any) => c?.type === 'FOOTER');
  const bodyText = bodyComponent?.text || '';

  return {
    name: tpl?.name || '',
    language: tpl?.language || 'en_US',
    status: tpl?.status || '',
    category: tpl?.category || '',
    header: headerComponent?.format === 'TEXT' ? (headerComponent?.text || '') : '',
    header_format: headerComponent?.format || '',
    body: bodyText,
    footer: footerComponent?.text || '',
    variables: countVariables(bodyText),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = base44.asServiceRole;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  if (body?.action === 'health_probe') {
    const usable = (await allAccounts(db)).filter(isUsable).length;
    return Response.json({ status: usable > 0 ? 'ok' : 'degraded', connected_accounts: usable });
  }

  // Which account's templates. Named explicitly, taken from the thread being
  // composed in, or — when the caller has exactly one — inferred.
  let account: WhatsAppAccount | null = null;
  if (body?.account_id) {
    account = await db.entities.WhatsAppAccount.get(String(body.account_id)).catch(() => null);
  } else if (body?.phone_number_id) {
    account = await accountByPhoneNumberId(db, String(body.phone_number_id));
  } else if (body?.conversation_id) {
    const conv = await db.entities.WhatsAppConversation.get(String(body.conversation_id)).catch(() => null);
    if (conv?.phone_number_id) account = await accountByPhoneNumberId(db, conv.phone_number_id);
  } else {
    const permitted = (await accountsForUser(db, user)).filter(isUsable);
    if (permitted.length === 1) account = permitted[0];
  }

  // Same ownership check as whatsappSend: template names are business data.
  const permittedIds = new Set((await accountsForUser(db, user)).map((a) => a.phone_number_id));
  if (account && !permittedIds.has(account.phone_number_id)) {
    return Response.json({ error: 'Forbidden', templates: [] }, { status: 403 });
  }

  if (!account?.waba_id || !account?.access_token) {
    return Response.json({
      error: 'No connected WhatsApp account to read templates from',
      detail: 'Connect a WhatsApp Business account in settings, including its WABA id.',
      templates: [],
    }, { status: 503 });
  }

  const endpoint = `${GRAPH_API_URL}/${account.waba_id}/message_templates?fields=${TEMPLATE_FIELDS}&limit=${PAGE_LIMIT}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${account.access_token}` } });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json({
      error: json?.error?.message || `Graph API returned ${res.status}`,
      code: json?.error?.code ?? res.status,
      templates: [],
    }, { status: res.status });
  }

  const templates = (json?.data || [])
    .filter((t: any) => String(t?.status || '').toUpperCase() === 'APPROVED')
    .map(flatten)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return Response.json({
    templates,
    waba_id: account.waba_id,
    account_id: account.id || '',
    fetched_at: new Date().toISOString(),
  });
});
