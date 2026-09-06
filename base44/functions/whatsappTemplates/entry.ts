/**
 * whatsappTemplates — approved message templates for the "Hello Biz" WABA.
 *
 * POST /functions/whatsappTemplates  { action?: "list" }
 *   → { templates: [{ name, language, status, category, body, variables }] }
 *
 * Reads GET {graph}/{WABA_ID}/message_templates, keeps only APPROVED ones (the
 * composer must not offer a template Meta will reject at send time), and
 * flattens each into the two things the picker actually needs: the body text
 * to preview and how many {{n}} placeholders to collect.
 *
 * The listing is fetched live rather than cached in an entity: template
 * approval state changes on Meta's side without notifying us, and a stale
 * "approved" is exactly the failure this endpoint exists to prevent.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const WABA_ID = Deno.env.get('WHATSAPP_WABA_ID') || '';
const SYSTEM_USER_TOKEN = Deno.env.get('WHATSAPP_SYSTEM_USER_TOKEN') || '';
const GRAPH_API_URL = Deno.env.get('WHATSAPP_GRAPH_API_URL') || 'https://graph.facebook.com/v20.0';

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

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'health_probe') {
      return Response.json({ status: SYSTEM_USER_TOKEN && WABA_ID ? 'ok' : 'degraded' });
    }
  }

  if (!SYSTEM_USER_TOKEN || !WABA_ID) {
    return Response.json({
      error: 'WhatsApp is not configured',
      detail: 'Set WHATSAPP_SYSTEM_USER_TOKEN and WHATSAPP_WABA_ID in the Base44 secrets tab.',
      templates: [],
    }, { status: 503 });
  }

  const endpoint = `${GRAPH_API_URL}/${WABA_ID}/message_templates?fields=${TEMPLATE_FIELDS}&limit=${PAGE_LIMIT}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${SYSTEM_USER_TOKEN}` } });
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

  return Response.json({ templates, waba_id: WABA_ID, fetched_at: new Date().toISOString() });
});
