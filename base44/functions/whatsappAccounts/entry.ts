/**
 * whatsappAccounts — where a tenant attaches their OWN WhatsApp Business
 * account, and the only place credentials are written.
 *
 * POST /functions/whatsappAccounts
 *   { action: "list" }                                → redacted accounts
 *   { action: "save", id?, label, phone_number_id, waba_id, display_number,
 *                     access_token?, verify_token?, app_secret?, relay_token?,
 *                     ai_function?, auto_ack_template?, auto_ack_language?,
 *                     tenant_id? }
 *   { action: "test", id }                            → live Graph check
 *   { action: "delete", id }
 *   { action: "webhook_url" }                         → what to paste into Meta
 *
 * This app is a TENANT of the platform, not the platform. It ships with no
 * WhatsApp credentials and no parent WABA to borrow: every number it sends
 * from is one a tenant connected here, and a tenant that has not connected one
 * simply cannot send. That is the design, not a gap — a shared platform number
 * would put one customer's outbound messages under another's business name and
 * quality rating, and would let anyone with an account here message from it.
 *
 * Secrets in, never out. access_token, app_secret, verify_token and
 * relay_token are written under the service role and are NEVER returned, not
 * even to the admin who typed them. Reads get a four-character tail
 * ("…kf9Q") and a boolean, which is enough to tell one stored token from
 * another without being enough to use it. A save that omits a secret field
 * leaves the stored value alone rather than blanking it, so an operator
 * editing a label cannot silently delete a token they cannot see.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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

/** Fields the caller may set; anything else is ignored. */
const TEXT_FIELDS = [
  'label', 'phone_number_id', 'waba_id', 'display_number', 'tenant_id',
  'ai_function', 'auto_ack_template', 'auto_ack_language',
];
/** Write-only fields: settable, never readable. */
const SECRET_FIELDS = ['access_token', 'verify_token', 'app_secret', 'relay_token'];

/** Enough to identify a stored secret, not enough to use one. */
function redactSecret(value: unknown) {
  const s = String(value || '');
  if (!s) return { set: false, tail: '' };
  return { set: true, tail: s.length <= 4 ? '••••' : `…${s.slice(-4)}` };
}

function toClientView(account: any) {
  return {
    id: account.id,
    tenant_id: account.tenant_id || '',
    label: account.label || '',
    phone_number_id: account.phone_number_id || '',
    waba_id: account.waba_id || '',
    display_number: account.display_number || '',
    is_master: !!account.is_master,
    ai_function: account.ai_function || '',
    auto_ack_template: account.auto_ack_template || '',
    auto_ack_language: account.auto_ack_language || 'en_US',
    status: account.status || 'unconfigured',
    last_verified_at: account.last_verified_at || '',
    last_error: account.last_error || '',
    access_token: redactSecret(account.access_token),
    verify_token: redactSecret(account.verify_token),
    app_secret: redactSecret(account.app_secret),
    relay_token: redactSecret(account.relay_token),
    usable: !!(account.phone_number_id && account.access_token),
  };
}

/** The tenant a caller may write for. Admins may name any; nobody else can. */
function tenantScopeFor(user: any, requested: unknown): string {
  const own = String(user?.tenant_id || user?.client_id || user?.organization_id || '');
  if (user?.role === 'admin') return String(requested ?? own ?? '');
  return own;
}

function mayTouch(user: any, account: any): boolean {
  if (user?.role === 'admin') return true;
  // The platform's own account is never editable from a tenant deployment.
  if (account?.is_master) return false;
  const own = String(user?.tenant_id || user?.client_id || user?.organization_id || '');
  return !account?.tenant_id || account.tenant_id === own;
}

/** Confirms Graph accepts the credentials, rather than trusting a paste. */
async function verifyWithGraph(account: any) {
  if (!account?.phone_number_id || !account?.access_token) {
    return { ok: false, error: 'A phone number id and an access token are both required.' };
  }
  try {
    const res = await fetch(
      `${GRAPH_API_URL}/${account.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `Graph API returned ${res.status}` };
    }
    return {
      ok: true,
      display_phone_number: json?.display_phone_number || '',
      verified_name: json?.verified_name || '',
      quality_rating: json?.quality_rating || '',
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || 'list');
  const db = base44.asServiceRole;

  if (action === 'health_probe') {
    return Response.json({ status: 'ok', is_master: IS_MASTER });
  }

  // ── what to paste into the Meta App Dashboard ───────────────────────────
  if (action === 'webhook_url') {
    // Built from this request so it is right on every deployment — production,
    // a preview URL, or a self-hosted backend — without another env var.
    const url = new URL(req.url);
    return Response.json({
      callback_url: `${url.origin}${url.pathname.replace(/whatsappAccounts$/, 'whatsappWebhook')}`,
      graph_api_version: GRAPH_API_URL.split('/').pop() || 'v20.0',
      subscribe_to: ['messages'],
    });
  }

  // ── list ────────────────────────────────────────────────────────────────
  if (action === 'list') {
    const rows = await db.entities.WhatsAppAccount.list().catch(() => []);
    const visible = (rows || []).filter((a: any) => mayTouch(user, a));
    const master = masterAccount();
    const accounts = visible.map(toClientView);
    if (master && user?.role === 'admin') {
      accounts.push({ ...toClientView(master), id: '__env__', label: 'Platform account (environment)' });
    }
    return Response.json({ accounts, is_master: IS_MASTER });
  }

  // ── save ────────────────────────────────────────────────────────────────
  if (action === 'save') {
    const phoneNumberId = String(body.phone_number_id || '').replace(/\D/g, '');
    if (!phoneNumberId) {
      return Response.json({ error: 'phone_number_id is required' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const field of TEXT_FIELDS) {
      if (typeof body[field] === 'string') patch[field] = body[field].trim().slice(0, 200);
    }
    patch.phone_number_id = phoneNumberId;
    patch.tenant_id = tenantScopeFor(user, body.tenant_id);
    // is_master is never settable over the API: a tenant cannot promote their
    // own row into the platform's.
    patch.is_master = false;

    for (const field of SECRET_FIELDS) {
      const value = body[field];
      // Absent means "leave it alone"; an explicit empty string clears it.
      if (typeof value === 'string' && value.trim()) patch[field] = value.trim();
      else if (value === '') patch[field] = '';
    }

    const existingId = String(body.id || '');
    if (existingId) {
      const existing = await db.entities.WhatsAppAccount.get(existingId).catch(() => null);
      if (!existing) return Response.json({ error: 'Account not found' }, { status: 404 });
      if (!mayTouch(user, existing)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const merged = { ...existing, ...patch };
      patch.status = (merged as any).access_token ? 'configured' : 'unconfigured';
      await db.entities.WhatsAppAccount.update(existingId, patch);
      const after = await db.entities.WhatsAppAccount.get(existingId).catch(() => merged);
      return Response.json({ ok: true, account: toClientView(after) });
    }

    // One row per phone number id, or a delivery could not be routed.
    const clash = await db.entities.WhatsAppAccount
      .filter({ phone_number_id: phoneNumberId }).catch(() => []);
    if (clash?.length) {
      return Response.json({
        error: 'That phone number id is already connected on this deployment',
        code: 'phone_number_id_taken',
      }, { status: 409 });
    }

    patch.status = patch.access_token ? 'configured' : 'unconfigured';
    const created = await db.entities.WhatsAppAccount.create(patch);
    return Response.json({ ok: true, account: toClientView(created) });
  }

  // ── test ────────────────────────────────────────────────────────────────
  if (action === 'test') {
    const id = String(body.id || '');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const account = id === '__env__'
      ? masterAccount()
      : await db.entities.WhatsAppAccount.get(id).catch(() => null);
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });
    if (!mayTouch(user, account)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const result = await verifyWithGraph(account);
    if (id !== '__env__') {
      await db.entities.WhatsAppAccount.update(id, {
        status: result.ok ? 'verified' : 'failed',
        last_verified_at: new Date().toISOString(),
        last_error: result.ok ? '' : String(result.error || '').slice(0, 500),
      }).catch(() => {});
    }
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  // ── delete ──────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const id = String(body.id || '');
    if (!id || id === '__env__') {
      return Response.json({ error: 'A stored account id is required' }, { status: 400 });
    }
    const account = await db.entities.WhatsAppAccount.get(id).catch(() => null);
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });
    if (!mayTouch(user, account)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Conversations are left in place: disconnecting a number must not delete
    // the history of what was said through it.
    await db.entities.WhatsAppAccount.delete(id);
    return Response.json({ ok: true, id });
  }

  return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
});
