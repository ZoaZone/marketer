import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';

const GRAPH = 'https://graph.facebook.com/v20.0';

function personalize(text: string, lead: any): string {
  return String(text || '')
    .replaceAll('{{name}}', lead.full_name || 'there')
    .replaceAll('{{email}}', lead.email || '')
    .replaceAll('{{phone}}', lead.phone || '');
}

async function sendEmail(db: any, to: string, subject: string, text: string): Promise<void> {
  try {
    await db.integrations.Core.SendEmail({ to, subject, body: text });
    return;
  } catch (_e) { /* fall through to provider keys */ }
  const from = secrets.get('RESEND_FROM_EMAIL') || 'noreply@digitalstudios.app';
  const resend = secrets.get('RESEND_API_KEY');
  if (resend) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `digitalstudios.app <${from}>`, to: [to], subject, text }),
    });
    if (r.ok) return;
  }
  const sg = secrets.get('SENDGRID_API_KEY');
  if (sg) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${sg}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: secrets.get('SENDGRID_FROM_EMAIL') || 'noreply@digitalstudios.app', name: 'digitalstudios.app' },
        subject, content: [{ type: 'text/plain', value: text }],
      }),
    });
    if (r.ok) return;
    throw new Error(`SendGrid: ${await r.text()}`);
  }
  throw new Error('No email provider could deliver this message.');
}

async function sendWhatsApp(db: any, lead: any, stage: any): Promise<void> {
  const waId = String(lead.whatsapp || lead.phone || '').replace(/\D/g, '');
  if (!waId) throw new Error('Lead has no WhatsApp number.');
  if (!stage.whatsapp_template) throw new Error('This stage has no approved WhatsApp template name.');
  const accounts = (await db.entities.WhatsAppAccount.list().catch(() => [])) || [];
  const usable = accounts.filter((a: any) => a.phone_number_id && a.access_token);
  const account = usable.find((a: any) => a.created_by === lead.created_by) || usable.find((a: any) => !a.tenant_id);
  if (!account) throw new Error('No connected WhatsApp account. Connect one in WhatsApp Settings.');
  const contacts = await db.entities.WhatsAppContact.filter({ wa_id: waId, phone_number_id: account.phone_number_id }).catch(() => []);
  if (contacts?.[0]?.opted_out) throw new Error('Contact opted out of WhatsApp messages.');
  const params = String(stage.whatsapp_params || '').split('|').map((p) => p.trim()).filter(Boolean)
    .map((p) => ({ type: 'text', text: personalize(p, lead) }));
  const res = await fetch(`${GRAPH}/${account.phone_number_id}/messages`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, type: 'template',
      template: {
        name: stage.whatsapp_template,
        language: { code: stage.whatsapp_language || 'en_US' },
        ...(params.length ? { components: [{ type: 'body', parameters: params }] } : {}),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp: ${json?.error?.message || res.status}`);
}

async function runStage(db: any, lead: any, stage: any): Promise<string> {
  if (stage.action_type === 'email') {
    if (!lead.email) throw new Error('Lead has no email address.');
    if (!stage.message_body) throw new Error('This stage has no email message.');
    await sendEmail(db, lead.email, personalize(stage.message_subject || stage.name, lead), personalize(stage.message_body, lead));
    return 'Email sent';
  }
  if (stage.action_type === 'whatsapp') {
    await sendWhatsApp(db, lead, stage);
    return 'WhatsApp template sent';
  }
  if (stage.action_type === 'sms') return 'Skipped: SMS is not connected';
  return `${stage.action_type} step passed`;
}

async function processLead(db: any, lead: any): Promise<string> {
  const funnel = await db.entities.Funnel.get(lead.funnel_id).catch(() => null);
  if (!funnel || funnel.status === 'inactive') return 'skipped';
  const { items: [stage] } = await db.entities.FunnelStage.filter({ funnel_id: lead.funnel_id, stage_order: lead.current_stage_order }, { limit: 1 });
  const now = new Date();
  if (!stage) {
    await db.entities.LeadCapture.update(lead.id, { funnel_status: 'completed', next_action_at: '' });
    return 'completed';
  }
  let note: string, ok = true;
  try { note = await runStage(db, lead, stage); } catch (e) { note = `Failed: ${(e as Error).message}`; ok = false; }
  const { items: [next] } = await db.entities.FunnelStage.filter({ funnel_id: lead.funnel_id, stage_order: lead.current_stage_order + 1 }, { limit: 1 });
  await db.entities.FunnelStage.update(stage.id, { exit_count: (stage.exit_count || 0) + 1 });
  const patch: any = { last_action_at: now.toISOString(), last_action_note: `${stage.name}: ${note}` };
  if (next) {
    await db.entities.FunnelStage.update(next.id, { entry_count: (next.entry_count || 0) + 1 });
    patch.current_stage_order = next.stage_order;
    patch.next_action_at = new Date(now.getTime() + (next.delay_hours || 0) * 3600000).toISOString();
  } else {
    patch.funnel_status = 'completed';
    patch.next_action_at = '';
  }
  await db.entities.LeadCapture.update(lead.id, patch);
  return ok ? 'sent' : 'failed';
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole;
    const { items: due } = await db.entities.LeadCapture.filter(
      { funnel_status: 'active', next_action_at: { $lte: new Date().toISOString() } },
      { sort: 'next_action_at', limit: 60 },
    );
    const tally: Record<string, number> = {};
    for (let i = 0; i < due.length; i += 5) {
      const results = await Promise.allSettled(due.slice(i, i + 5).map((lead: any) => processLead(db, lead)));
      for (const r of results) {
        const key = r.status === 'fulfilled' ? r.value : 'error';
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    return Response.json({ due: due.length, ...tally });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}