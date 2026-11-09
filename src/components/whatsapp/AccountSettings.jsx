/**
 * AccountSettings — where a tenant attaches their OWN WhatsApp Business
 * account, so their messages go out under their own verified name.
 *
 * Secrets are write-only by design. The backend returns a four-character tail
 * ("…kf9Q") and never the value, so this form shows what is stored without
 * being able to reveal it, and an empty secret field on save means "leave it
 * alone" rather than "clear it" — otherwise editing a label would silently
 * wipe a token nobody can read back to restore.
 *
 * "Test connection" asks Graph to confirm the credentials before anyone
 * depends on them, and shows the verified name and quality rating Meta has on
 * file for the number. A paste that looks right and a paste that works are
 * different things, and finding out at send time means finding out in front of
 * a customer.
 */
import { useEffect, useState } from 'react';
import {
  Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Copy, Check,
  KeyRound, Phone, ShieldCheck,
} from 'lucide-react';
import {
  listAccounts, saveAccount, testAccount, deleteAccount, getWebhookUrl,
} from '@/api/whatsappAPI';

const EMPTY = {
  id: '', label: '', phone_number_id: '', waba_id: '', display_number: '',
  access_token: '', verify_token: '', app_secret: '', relay_token: '',
  ai_function: '', auto_ack_template: '', auto_ack_language: 'en_US',
};

const STATUS_STYLE = {
  verified: { cls: 'bg-emerald-50 text-emerald-700', label: 'Verified' },
  configured: { cls: 'bg-blue-50 text-blue-700', label: 'Saved, not tested' },
  failed: { cls: 'bg-red-50 text-red-700', label: 'Failed' },
  unconfigured: { cls: 'bg-slate-100 text-slate-500', label: 'Incomplete' },
};

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl">
          {value || '—'}
        </code>
        <button
          type="button"
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard access can be refused (insecure origin, permissions).
              // The value is on screen and selectable, so this is not fatal.
            }
          }}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function SecretInput({ label, name, stored, value, onChange, help }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
        {label}
        {stored?.set && (
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono">
            stored {stored.tail}
          </span>
        )}
      </span>
      <input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={stored?.set ? 'Leave blank to keep the stored value' : ''}
        className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl font-mono
                   focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
      />
      {help && <span className="block text-[11px] text-slate-400 mt-1">{help}</span>}
    </label>
  );
}

function AccountForm({ account, onSaved, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    setForm({
      ...EMPTY,
      id: account?.id || '',
      label: account?.label || '',
      phone_number_id: account?.phone_number_id || '',
      waba_id: account?.waba_id || '',
      display_number: account?.display_number || '',
      ai_function: account?.ai_function || '',
      auto_ack_template: account?.auto_ack_template || '',
      auto_ack_language: account?.auto_ack_language || 'en_US',
    });
    setError('');
    setTestResult(null);
  }, [account?.id]);

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await saveAccount(form);
      onSaved(res.account);
    } catch (err) {
      setError(err?.message || 'Could not save this account');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!form.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testAccount(form.id));
    } catch (err) {
      setTestResult({ ok: false, error: err?.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Label</span>
          <input
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Front desk"
            className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Display number</span>
          <input
            value={form.display_number}
            onChange={(e) => set('display_number', e.target.value)}
            placeholder="+1 555 010 1234"
            className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Phone number ID</span>
          <input
            value={form.phone_number_id}
            onChange={(e) => set('phone_number_id', e.target.value)}
            placeholder="902301109637859"
            className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl font-mono
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
          <span className="block text-[11px] text-slate-400 mt-1">
            App Dashboard → WhatsApp → API Setup. This is how inbound messages
            find your account, so it must be exact.
          </span>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">WhatsApp Business Account ID</span>
          <input
            value={form.waba_id}
            onChange={(e) => set('waba_id', e.target.value)}
            placeholder="1742983153672564"
            className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl font-mono
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
          <span className="block text-[11px] text-slate-400 mt-1">Used to list your approved templates.</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SecretInput
          label="System user access token" name="access_token"
          stored={account?.access_token} value={form.access_token} onChange={set}
          help="Generate a permanent token with whatsapp_business_messaging and whatsapp_business_management. A 60-day token stops working silently."
        />
        <SecretInput
          label="Webhook verify token" name="verify_token"
          stored={account?.verify_token} value={form.verify_token} onChange={set}
          help="Any string you choose. Type the same one into Meta's Configuration screen."
        />
        <SecretInput
          label="App secret" name="app_secret"
          stored={account?.app_secret} value={form.app_secret} onChange={set}
          help="Verifies each delivery really came from Meta. Without it, inbound messages are refused."
        />
        <SecretInput
          label="Relay token (optional)" name="relay_token"
          stored={account?.relay_token} value={form.relay_token} onChange={set}
          help="Only if your callback URL goes through a relay rather than straight here."
        />
      </div>

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="text-xs font-medium text-slate-700 cursor-pointer">
          Automatic replies (optional)
        </summary>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Assistant function</span>
            <input
              value={form.ai_function}
              onChange={(e) => set('ai_function', e.target.value)}
              className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl font-mono
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
            <span className="block text-[11px] text-slate-400 mt-1">
              Whatever it returns is sent verbatim. Leave empty for no generated replies.
            </span>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">Acknowledgement template</span>
            <input
              value={form.auto_ack_template}
              onChange={(e) => set('auto_ack_template', e.target.value)}
              className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl font-mono
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
            <span className="block text-[11px] text-slate-400 mt-1">
              An approved template, sent once per thread. Used only when no assistant is set.
            </span>
          </label>
        </div>
      </details>

      {error && (
        <p className="flex gap-2 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {error}
        </p>
      )}

      {testResult && (
        <p className={`flex gap-2 text-xs rounded-xl px-3 py-2 ${
          testResult.ok ? 'text-emerald-800 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
          {testResult.ok
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            : <AlertCircle className="w-4 h-4 shrink-0 mt-px" />}
          <span>
            {testResult.ok
              ? `Connected as ${testResult.verified_name || 'this number'} (${testResult.display_phone_number || '—'})`
              + (testResult.quality_rating ? ` · quality ${testResult.quality_rating}` : '')
              : testResult.error}
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !form.phone_number_id}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium
                     hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {form.id ? 'Save changes' : 'Connect account'}
        </button>
        {form.id && (
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium
                       text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Test connection
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AccountSettings() {
  const [accounts, setAccounts] = useState([]);
  const [webhook, setWebhook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const [list, hook] = await Promise.all([
        listAccounts(),
        getWebhookUrl().catch(() => null),
      ]);
      setAccounts(list.accounts || []);
      setWebhook(hook);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not load connected accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const remove = async (id) => {
    try {
      await deleteAccount(id);
      setConfirmDelete('');
      reload();
    } catch (err) {
      setError(err?.message || 'Could not disconnect this account');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">WhatsApp Business accounts</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Connect your own WhatsApp Business account so messages go out under your
          business name. Credentials are stored server-side and never sent back to
          this page.
        </p>
      </div>

      {webhook && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-400" /> Paste these into Meta → WhatsApp → Configuration
          </p>
          <CopyField label="Callback URL" value={webhook.callback_url} />
          <p className="text-[11px] text-slate-500">
            Set the verify token to whatever you entered below, then subscribe to
            the <code className="font-mono">messages</code> field. Nothing arrives
            until that subscription is saved.
          </p>
        </div>
      )}

      {error && (
        <p className="flex gap-2 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {error}
        </p>
      )}

      {loading && (
        <div className="flex justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loading && !accounts.length && !editing && (
        <p className="text-xs text-slate-500 py-4">
          No WhatsApp account is connected yet. Nothing can be sent or received
          until one is.
        </p>
      )}

      <div className="space-y-2">
        {accounts.map((account) => {
          const status = STATUS_STYLE[account.status] || STATUS_STYLE.unconfigured;
          return (
            <div key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {account.label || account.display_number || account.phone_number_id}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono truncate">
                    {account.phone_number_id}
                    {account.is_master && ' · platform account'}
                  </p>
                  {account.last_error && (
                    <p className="text-[11px] text-red-600 mt-1">{account.last_error}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                  {status.label}
                </span>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setEditing(account)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                             text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <KeyRound className="w-3 h-3" /> Credentials
                </button>
                {!account.is_master && account.id !== '__env__' && (
                  confirmDelete === account.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(account.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-medium"
                      >
                        Disconnect for good
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete('')}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(account.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                                 text-[11px] font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" /> Disconnect
                    </button>
                  )
                )}
              </div>

              {/* Conversations already received stay put — disconnecting a
                  number must not erase the record of what was said through it. */}
              {confirmDelete === account.id && (
                <p className="text-[11px] text-slate-500 mt-2">
                  Existing conversations are kept; only the credentials are removed.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {editing ? (
        <AccountForm
          account={editing.id === '__new__' ? null : editing}
          onSaved={() => { setEditing(null); reload(); }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing({ id: '__new__' })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300
                     text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" /> Connect a WhatsApp account
        </button>
      )}
    </div>
  );
}
