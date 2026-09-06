import { useState, useEffect } from "react";
import { X, Loader2, Eye, EyeOff, Plus, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { connectGuide } from "@/config/socialConnect";

const emptyForm = {
  platform: "instagram",
  account_name: "",
  username: "",
  access_token: "",
  connection_method: "api",
};

/**
 * Inline "Add Account" used by Social Hub. Unlike the older add-account
 * forms (Settings, Brand Manager), every account created here is
 * immediately verified via testSocialConnection so the status badge
 * reflects reality from the moment it appears, instead of defaulting to
 * "active".
 *
 * Doubles as the RECONNECT form: pass `account` and it opens on that
 * account's platform, pre-filled with its name and handle, and updates the
 * existing record (saveSocialAccount takes an `id`) rather than creating a
 * duplicate. An expired token previously had no path back other than
 * deleting the account and adding it again.
 *
 * The per-platform guidance now comes from @/config/socialConnect, which
 * carries the direct URL of the page that issues the credential plus the
 * steps to follow on it — replacing a single line of prose naming a site
 * you then had to find yourself.
 */
export default function AddAccountModal({ open, onClose, platforms, onSaved, account = null }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState("");

  const reconnecting = !!account?.id;

  // Load the account being reconnected. Keyed on the id so reopening the
  // modal for a different account refills it; the token is never prefilled
  // because it is never sent to the client.
  useEffect(() => {
    if (!open) return;
    setError(""); setShowSecret(false);
    setForm(account?.id
      ? {
          platform: account.platform || "instagram",
          account_name: account.account_name || "",
          username: account.username || "",
          access_token: "",
          connection_method: "api",
        }
      : emptyForm);
  }, [open, account?.id]);

  if (!open) return null;

  const isDecorative = form.platform === "email" || form.platform === "whatsapp";
  const guide = connectGuide(form.platform);

  const reset = () => { setForm(emptyForm); setError(""); setShowSecret(false); };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    setError("");
    if (!form.account_name.trim()) { setError("Account / display name is required."); return; }
    if (!isDecorative && !form.access_token.trim()) { setError("An access token is required for an API connection."); return; }
    setSaving(true);
    try {
      // Via saveSocialAccount so the token is encrypted before storage — the
      // same path Settings.jsx and BrandManager.jsx use. Creating the entity
      // directly here would put a live posting credential in plaintext on a
      // client-readable record.
      const res = await base44.functions.invoke("saveSocialAccount", {
        ...(reconnecting ? { id: account.id } : {}),
        platform: form.platform,
        account_name: form.account_name.trim(),
        username: form.username || "",
        access_token: form.access_token || "",
        connection_method: isDecorative ? "webhook" : "api",
      });
      const saved = res?.data?.account ?? res?.account;
      const savedId = saved?.id || (reconnecting ? account.id : null);
      if (!savedId) throw new Error(res?.data?.error || res?.error || "Could not save the account.");
      try {
        await base44.functions.invoke("testSocialConnection", { account_id: savedId });
      } catch (_e) {
        // verification is best-effort — the account is still saved either way
      }
      onSaved?.();
      close();
    } catch (e) {
      setError(e?.message || "Failed to save account.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            {reconnecting
              ? <><RefreshCw className="w-4 h-4 text-amber-400" /> Reconnect {account.account_name || guide?.label || account.platform}</>
              : <><Plus className="w-4 h-4 text-fuchsia-400" /> Add Social Account</>}
          </h3>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Platform picker — fixed when reconnecting an existing account. */}
          {!reconnecting && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Platform</label>
            <div className="grid grid-cols-4 gap-2">
              {platforms.map(p => (
                <button key={p.id} onClick={() => setForm(f => ({ ...f, platform: p.id }))}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    form.platform === p.id ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300" : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                  }`}>
                  {p.short}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* The direct route to the credential: one click to the exact page
              that issues it, then the steps to follow once there. */}
          {guide && (
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-2">
              <a href={guide.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300">
                <ExternalLink className="w-3.5 h-3.5" /> {guide.urlLabel}
              </a>
              {guide.steps && (
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-muted-foreground">
                  {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
              {guide.note && <p className="text-[11px] text-amber-300/90">{guide.note}</p>}
            </div>
          )}

          {/* Account name + username */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account / Display Name *</label>
              <input type="text" value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                placeholder={`My ${platforms.find(p => p.id === form.platform)?.label || ""} Account`}
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Username / Handle</label>
              <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="@username" className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {isDecorative ? (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                This is a sender label only — it shows up so you can pick a "from" identity when sending.
                Actual {form.platform === "email" ? "email" : "WhatsApp"} delivery uses the{" "}
                {form.platform === "email" ? "SendGrid API key" : "WhatsApp Business (Twilio/BSP) credentials"}{" "}
                configured in <strong>Settings → API Keys</strong>.
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Access Token *</label>
              {reconnecting && <p className="text-[10px] text-muted-foreground mb-1">Paste a fresh token — the stored one is no longer accepted by {guide?.label || form.platform}.</p>}
              <div className="relative">
                <input type={showSecret ? "text" : "password"} value={form.access_token}
                  onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
                  placeholder={guide?.tokenPlaceholder || "Your access token"}
                  className="w-full px-3 py-2.5 pr-10 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50" />
                <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                An API access token is required. None of these platforms&apos; posting APIs accept a username and password — the token issued by the link above, while signed in to that account, is the equivalent.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button onClick={close} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : reconnecting ? <RefreshCw className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {saving ? "Connecting..." : reconnecting ? "Reconnect & Verify" : "Save & Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
