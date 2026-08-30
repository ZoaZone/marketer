import { useState } from "react";
import { X, Loader2, Eye, EyeOff, Plus, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TOKEN_HELP = {
  instagram: { help: "Get from developers.facebook.com → Instagram Basic Display or Graph API → Access Token", ph: "IGQVJXxxxxxxxx" },
  facebook:  { help: "Get a Page Access Token from developers.facebook.com → Graph API Explorer", ph: "EAAxxxxxxxx" },
  linkedin:  { help: "Get from LinkedIn Developer Portal → OAuth 2.0 → Access Token", ph: "AQXxxxxxxxx" },
  twitter_x: { help: "Bearer token from developer.twitter.com → Your App → Keys & Tokens", ph: "AAAAAxxxxxxxx" },
  tiktok:    { help: "Access token from developers.tiktok.com → Content Posting API", ph: "act.xxxxxxxx" },
  youtube:   { help: "OAuth access token from console.cloud.google.com → YouTube Data API v3", ph: "ya29.xxxxxxxx" },
  pinterest: { help: "Access token from developers.pinterest.com → My Apps", ph: "pina_xxxxxxxx" },
};

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
 */
export default function AddAccountModal({ open, onClose, platforms, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const isDecorative = form.platform === "email" || form.platform === "whatsapp";
  const tokenMeta = TOKEN_HELP[form.platform];

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
        platform: form.platform,
        account_name: form.account_name.trim(),
        username: form.username || "",
        access_token: form.access_token || "",
        connection_method: isDecorative ? "webhook" : "api",
      });
      const created = res?.data?.account ?? res?.account;
      if (!created?.id) throw new Error(res?.data?.error || res?.error || "Could not save the account.");
      try {
        await base44.functions.invoke("testSocialConnection", { account_id: created.id });
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
          <h3 className="font-bold text-foreground flex items-center gap-2"><Plus className="w-4 h-4 text-fuchsia-400" /> Add Social Account</h3>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Platform picker */}
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
              {tokenMeta?.help && <p className="text-[10px] text-muted-foreground mb-1">{tokenMeta.help}</p>}
              <div className="relative">
                <input type={showSecret ? "text" : "password"} value={form.access_token}
                  onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
                  placeholder={tokenMeta?.ph || "Your access token"}
                  className="w-full px-3 py-2.5 pr-10 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50" />
                <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">An API access token is required — none of these platforms accept a username/password for posting.</p>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          <button onClick={close} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Connecting..." : "Save & Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
