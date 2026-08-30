import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Key, Bell, Save, CheckCircle2, Loader2, Eye, EyeOff,
  Zap, User, Share2, Plus, Trash2, AlertCircle, ExternalLink, RefreshCw,
  Sparkles, Lock, Plug
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { LLM_MODELS } from "@/utils/llmModels";

const ACCOUNT_STATUS = {
  active:       { dot: "bg-emerald-400", text: "text-emerald-400", label: "Active" },
  connected:    { dot: "bg-emerald-400", text: "text-emerald-400", label: "Active" },
  expired:      { dot: "bg-amber-400",   text: "text-amber-400",   label: "Token expired" },
  disconnected: { dot: "bg-red-400",     text: "text-red-400",     label: "Disconnected" },
};

const KEY_FIELDS = [
  { k: "sendgrid_key",      l: "SendGrid API Key",    ph: "SG.xxxxxxxx",  help: "For email campaigns — get from sendgrid.com/account/apikeys" },
  { k: "twilio_sid",        l: "Twilio Account SID",  ph: "ACxxxxxxxx",   help: "From twilio.com/console — for SMS campaigns" },
  { k: "twilio_token",      l: "Twilio Auth Token",   ph: "xxxxxxxx",     help: "Twilio auth token from console" },
  { k: "twilio_phone",      l: "Twilio Phone Number", ph: "+1 555 0000",  help: "Your SMS sending number (E.164 format)" },
  { k: "whatsapp_token",    l: "WhatsApp BSP Token",  ph: "EAxxxxxxxx",   help: "WhatsApp Business API token from Meta Business Suite" },
  { k: "whatsapp_phone_id", l: "WhatsApp Phone ID",   ph: "1234567890",   help: "Phone number ID from Meta Business Suite → WhatsApp" },
  { k: "stripe_key",        l: "Stripe Secret Key",   ph: "sk_live_...", help: "From dashboard.stripe.com/apikeys" },
];

const TIMEZONES = ["UTC", "Asia/Calcutta", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore", "Asia/Dubai"];

const SOCIAL_PLATFORMS = [
  { id: "instagram",  label: "Instagram",  color: "from-pink-500 to-rose-600",   tokenHelp: "Get from developers.facebook.com → Instagram Basic Display or Graph API → Access Token", tokenPH: "IGQVJXxxxxxxxx" },
  { id: "facebook",   label: "Facebook",   color: "from-blue-500 to-blue-700",   tokenHelp: "Get a Page Access Token from developers.facebook.com → Graph API Explorer", tokenPH: "EAAxxxxxxxx" },
  { id: "linkedin",   label: "LinkedIn",   color: "from-blue-600 to-blue-800",   tokenHelp: "Get from LinkedIn Developer Portal → OAuth 2.0 → Access Token", tokenPH: "AQXxxxxxxxx" },
  { id: "twitter_x",  label: "Twitter/X",  color: "from-gray-700 to-gray-900",   tokenHelp: "Bearer token from developer.twitter.com → Your App → Keys & Tokens", tokenPH: "AAAAAxxxxxxxx" },
  { id: "tiktok",     label: "TikTok",     color: "from-gray-800 to-gray-900",   tokenHelp: "Access token from developers.tiktok.com → Content Posting API", tokenPH: "act.xxxxxxxx" },
  { id: "youtube",    label: "YouTube",    color: "from-red-500 to-red-700",     tokenHelp: "OAuth access token from console.cloud.google.com → YouTube Data API v3", tokenPH: "ya29.xxxxxxxx" },
];

// ── Social Accounts tab ──────────────────────────────────────────────────────
function SocialAccountsTab() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [showToken, setShowToken] = useState({});
  const [form, setForm] = useState({
    platform: "instagram",
    account_name: "",
    username: "",
    access_token: "",
    refresh_token: "",
    page_id: "",
    connection_method: "api",
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["social_accounts", user?.email],
    queryFn: () => base44.entities.SocialAccount.filter(mine(user), "-created_date", 50),
    enabled: !!user?.email,
  });

  const selectedPlatform = SOCIAL_PLATFORMS.find(p => p.id === form.platform);

  const handleAdd = async () => {
    if (!form.access_token.trim()) { alert("Access token is required for API connection"); return; }
    if (!form.account_name.trim()) { alert("Account / display name is required"); return; }
    setSaving(true);
    try {
      // Routed through saveSocialAccount rather than writing the entity
      // directly: that function encrypts the token (AES-256-GCM) before it is
      // stored, so a live posting credential never sits in plaintext on a
      // client-readable record. The token is sent once, on this request, and
      // is never read back to the browser afterwards.
      const res = await base44.functions.invoke("saveSocialAccount", {
        platform: form.platform,
        account_name: form.account_name,
        username: form.username || "",
        access_token: form.access_token || "",
        refresh_token: form.refresh_token || "",
        page_id: form.page_id || "",
        connection_method: "api",
      });
      const created = res?.data?.account ?? res?.account;
      if (!created?.id) throw new Error(res?.data?.error || res?.error || "Could not save the account.");
      try {
        await base44.functions.invoke("testSocialConnection", { account_id: created.id });
      } catch (_e) { /* verification is best-effort */ }
      qc.invalidateQueries(["social_accounts"]);
      setAdding(false);
      setForm({ platform: "instagram", account_name: "", username: "", access_token: "", refresh_token: "", page_id: "", connection_method: "api" });
    } catch (e) {
      alert("Failed to save account: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this social account? Posts linked to it will lose their account connection.")) return;
    setDeletingId(id);
    try {
      await base44.entities.SocialAccount.delete(id);
      qc.invalidateQueries(["social_accounts"]);
    } catch (e) { alert(e.message); }
    setDeletingId(null);
  };

  const testConnection = async (id) => {
    setTestingId(id);
    try {
      await base44.functions.invoke("testSocialConnection", { account_id: id });
      qc.invalidateQueries(["social_accounts"]);
    } catch (e) { alert("Connection test failed: " + e.message); }
    setTestingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Each user manages their own social accounts.</strong> Your tokens are private — only you can see and use them.
          Connect as many accounts as you like per platform (e.g. multiple Instagram pages).
        </div>
      </div>

      {/* Existing accounts */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Share2 className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-foreground font-medium">No social accounts yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Add your accounts to start scheduling and publishing posts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => {
            const platform = SOCIAL_PLATFORMS.find(p => p.id === acc.platform);
            const isDeleting = deletingId === acc.id;
            const isTesting = testingId === acc.id;
            const st = ACCOUNT_STATUS[acc.status] || ACCOUNT_STATUS.disconnected;
            return (
              <div key={acc.id} title={acc.description || st.label} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${platform?.color || "from-gray-500 to-gray-700"} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-sm font-black text-white">{(acc.platform || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{acc.account_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="capitalize">{platform?.label || acc.platform}</span>
                    {acc.username && <span>· @{acc.username}</span>}
                    {acc.page_id && <span>· Page ID: {acc.page_id}</span>}
                    <span className={`flex items-center gap-1 ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => testConnection(acc.id)}
                  disabled={isTesting}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  title="Test connection"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleDelete(acc.id)}
                  disabled={isDeleting}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove account"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-fuchsia-500/30 text-fuchsia-400 text-sm font-medium hover:bg-fuchsia-500/5 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Social Account
        </button>
      ) : (
        <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
          <h4 className="font-semibold text-foreground">Add New Account</h4>

          {/* Platform selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {SOCIAL_PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setForm(f => ({ ...f, platform: p.id }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    form.platform === p.id
                      ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300"
                      : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-[9px] font-black text-white">{p.label[0]}</span>
                  </div>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Account name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account Name *</label>
              <input
                type="text"
                value={form.account_name}
                onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                placeholder={`My ${selectedPlatform?.label} Page`}
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Username / Handle</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="@username"
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Page ID (for Facebook/Instagram) */}
          {(form.platform === "facebook" || form.platform === "instagram") && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Page / Business ID</label>
              <input
                type="text"
                value={form.page_id}
                onChange={e => setForm(f => ({ ...f, page_id: e.target.value }))}
                placeholder="1234567890"
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">Your Facebook Page ID or Instagram Business Account ID</p>
            </div>
          )}

          {/* Access token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Access Token *</label>
            <p className="text-[10px] text-muted-foreground mb-1.5">{selectedPlatform?.tokenHelp}</p>
            <div className="relative">
              <input
                type={showToken.access ? "text" : "password"}
                value={form.access_token}
                onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
                placeholder={selectedPlatform?.tokenPH || "Your access token"}
                className="w-full px-3 py-2.5 pr-10 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50"
              />
              <button
                onClick={() => setShowToken(p => ({ ...p, access: !p.access }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken.access ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Refresh token (optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Refresh Token <span className="text-muted-foreground/50">(optional)</span></label>
            <div className="relative">
              <input
                type={showToken.refresh ? "text" : "password"}
                value={form.refresh_token}
                onChange={e => setForm(f => ({ ...f, refresh_token: e.target.value }))}
                placeholder="Refresh token for auto-renewal"
                className="w-full px-3 py-2.5 pr-10 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50"
              />
              <button
                onClick={() => setShowToken(p => ({ ...p, refresh: !p.refresh }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken.refresh ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* API docs links */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Meta Developer Docs", url: "https://developers.facebook.com/docs/instagram-api" },
              { label: "LinkedIn OAuth",       url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow" },
              { label: "Twitter Developer",    url: "https://developer.twitter.com/en/docs/authentication/oauth-2-0" },
              { label: "TikTok API Docs",      url: "https://developers.tiktok.com/doc/content-posting-api-get-started" },
            ].map(link => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="w-3 h-3" /> {link.label}
              </a>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setAdding(false); setForm({ platform: "instagram", account_name: "", username: "", access_token: "", refresh_token: "", page_id: "", connection_method: "api" }); }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.access_token.trim() || !form.account_name.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Settings component ───────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, userTier = 0, isAdmin } = useOutletContext() || {};
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState({});
  const [tab, setTab] = useState("apikeys");
  const [keys, setKeys] = useState({
    sendgrid_key: "", twilio_sid: "", twilio_token: "", twilio_phone: "",
    whatsapp_token: "", whatsapp_phone_id: "", stripe_key: "",
    llm_provider: "", llm_api_key: "", llm_model: "", llm_base_url: "",
    platform_model: "",
  });
  const [profile, setProfile] = useState({ full_name: "", business_name: "", website: "", logo_url: "", timezone: "Asia/Calcutta" });
  const [notifs, setNotifs] = useState({ email_campaigns: true, email_leads: true, email_social: false, weekly_report: true });

  useEffect(() => {
    if (user?.settings) {
      if (user.settings.api_keys)    setKeys(k  => ({ ...k,  ...user.settings.api_keys }));
      if (user.settings.profile)     setProfile(p => ({ ...p, ...user.settings.profile }));
      if (user.settings.notifications) setNotifs(n => ({ ...n, ...user.settings.notifications }));
    }
    if (user?.full_name) setProfile(p => ({ ...p, full_name: user.full_name }));
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      // Drop the legacy plaintext "bring your own LLM" fields on every save —
      // that flow moved to Account > Integrations (encrypted, validated
      // before storage). This purges old plaintext keys over time instead of
      // leaving them sitting in settings indefinitely.
      const { llm_provider: _lp, llm_api_key: _lk, llm_model: _lm, llm_base_url: _lb, ...restKeys } = keys;
      await base44.auth.updateMe({ settings: { api_keys: restKeys, profile, notifications: notifs } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert("Save failed: " + e.message); }
    setSaving(false);
  };

  const TABS = [
    { v: "apikeys",  l: "API Keys",        Icon: Key },
    { v: "ai",       l: "AI Provider",     Icon: Sparkles },
    { v: "social",   l: "Social Accounts", Icon: Share2 },
    { v: "profile",  l: "Profile",         Icon: User },
    { v: "notifs",   l: "Notifications",   Icon: Bell },
  ];

  const showSaveBtn = tab !== "social"; // Social Accounts saves inline

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-fuchsia-400" /> Settings
          </h1>
          <p className="text-muted-foreground text-sm">Configure API keys, social accounts, and preferences</p>
        </div>
        {showSaveBtn && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-fuchsia-500/20"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.Icon className="w-4 h-4" /> {t.l}
          </button>
        ))}
      </div>

      {/* ── API Keys ── */}
      {tab === "apikeys" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
            <Zap className="w-3.5 h-3.5 inline mr-1.5" />
            Keys are encrypted and stored in your account settings. Used only for your campaigns.
          </div>
          {(userTier < 3 && !isAdmin) ? (
            <div className="p-4 rounded-xl bg-card border border-border flex gap-3 items-start">
              <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">BYO credentials — Agency &amp; Enterprise only</p>
                <p className="text-xs text-muted-foreground mt-1">Bring your own SendGrid, Twilio, WhatsApp BSP or Stripe keys for zero platform messaging fee. Upgrade to Agency or Enterprise to unlock this feature.</p>
                <Link to="/billing" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-fuchsia-400 hover:underline">Upgrade plan →</Link>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground">
              Add your SendGrid / Twilio / WhatsApp BSP credentials below to send campaigns from your own sender accounts at
              <strong className="text-foreground"> zero platform fee</strong>. Leave blank and digitalstudios.app will send on your behalf
              (included in your plan's monthly quota, then per-message rates apply). See <Link to="/billing" className="text-fuchsia-400 hover:underline">Billing</Link> for rates.
            </div>
          )}

          {/* Sender account provisioning */}
          {(userTier >= 3 || isAdmin) && (
            <div className="p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20">
              <p className="text-xs font-semibold text-fuchsia-400 mb-2">Don't have a sender account yet? Sign up directly:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Get SendGrid (Email)", url: "https://signup.sendgrid.com/" },
                  { label: "Get Twilio (SMS)", url: "https://www.twilio.com/try-twilio" },
                  { label: "Get WhatsApp BSP (Meta)", url: "https://business.facebook.com/messaging/whatsapp" },
                ].map(l => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-xs text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors">
                    <ExternalLink className="w-3 h-3" /> {l.label}
                  </a>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                WhatsApp: marketing messages require pre-approved templates via Meta Business Manager.
                Transactional messages (OTPs, order updates) can be sent from your registered number without pre-approval.
              </p>
            </div>
          )}
          {(userTier >= 3 || isAdmin) && KEY_FIELDS.map(({ k, l, ph, help }) => (
            <div key={k}>
              <label className="text-sm font-medium text-foreground block mb-1">{l}</label>
              <p className="text-xs text-muted-foreground mb-1.5">{help}</p>
              <div className="relative">
                <input
                  type={show[k] ? "text" : "password"}
                  value={keys[k] || ""}
                  onChange={e => setKeys(p => ({ ...p, [k]: e.target.value }))}
                  placeholder={ph}
                  className="w-full px-3 py-2.5 pr-10 rounded-xl bg-card border border-border text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
                />
                <button
                  onClick={() => setShow(p => ({ ...p, [k]: !p[k] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show[k] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Provider ── */}
      {tab === "ai" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 text-fuchsia-400 font-semibold mb-1"><Sparkles className="w-3.5 h-3.5" /> How AI generation is routed</p>
            <p><strong className="text-foreground">1. Base44 built-in AI</strong> — the default for every plan, no setup needed.</p>
            <p><strong className="text-foreground">2. Platform backup model</strong> — used automatically if the built-in AI is briefly unavailable.</p>
            <p><strong className="text-foreground">3. Your own LLM key</strong> (Account → Integrations) — when set, your requests use it first, before falling back to 1 and 2.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Preferred platform model</label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Applies to Base44's built-in AI (step 1 above) — has no effect if you've set your own LLM key below. If your
              preferred model is briefly unavailable, generation automatically falls back to the platform default and
              shows a notice.
            </p>
            <select
              value={keys.platform_model || ""}
              onChange={e => setKeys(p => ({ ...p, platform_model: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-fuchsia-500/50 transition-colors"
            >
              <option value="">Platform default (auto)</option>
              {LLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {userTier < 2 && !isAdmin ? (
            <div className="p-5 rounded-xl bg-card border border-border text-center space-y-2">
              <Lock className="w-5 h-5 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">Bring your own LLM</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">Connect your own OpenAI, Anthropic, or custom-endpoint API key so your AI generations run on your account. Available on Growth and Agency plans.</p>
              <Link to="/billing" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-fuchsia-400 hover:underline">Upgrade plan →</Link>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-card border border-border text-center space-y-2">
              <Plug className="w-5 h-5 text-cyan-400 mx-auto" />
              <p className="text-sm font-semibold text-foreground">Bring your own LLM</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Connecting your own OpenAI, Anthropic, or custom-endpoint key now lives in Account → Integrations, where it's
                encrypted at rest and validated before it's saved.
              </p>
              <Link to="/integrations" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-cyan-400 hover:underline">Go to Integrations →</Link>
            </div>
          )}
        </div>
      )}

      {/* ── Social Accounts ── */}
      {tab === "social" && <SocialAccountsTab />}

      {/* ── Profile ── */}
      {tab === "profile" && (
        <div className="space-y-4">
          {/* Read-only email */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Email Address</label>
            <div className="w-full px-3 py-2.5 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground select-all">
              {user?.email || "—"}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Your login email — managed by your account settings</p>
          </div>
          {[
            { k: "full_name",      l: "Your Name",     ph: "Jane Smith",               type: "text" },
            { k: "business_name",  l: "Business Name", ph: "Acme Marketing Agency",     type: "text" },
            { k: "website",        l: "Website",        ph: "https://youragency.com",    type: "url" },
            { k: "logo_url",       l: "Logo URL",       ph: "https://...",               type: "url" },
          ].map(({ k, l, ph, type }) => (
            <div key={k}>
              <label className="text-sm font-medium text-foreground block mb-1">{l}</label>
              <input
                type={type}
                value={profile[k] || ""}
                onChange={e => setProfile(p => ({ ...p, [k]: e.target.value }))}
                placeholder={ph}
                className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
              />
            </div>
          ))}
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Timezone</label>
            <select
              value={profile.timezone}
              onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-fuchsia-500/50 transition-colors"
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── Notifications ── */}
      {tab === "notifs" && (
        <div className="space-y-3">
          {[
            { k: "email_campaigns", l: "Campaign completion emails", desc: "Get notified when a campaign finishes sending" },
            { k: "email_leads",     l: "New lead notifications",     desc: "Email alert when a new lead is captured" },
            { k: "email_social",    l: "Social post alerts",         desc: "Get notified when scheduled posts go live" },
            { k: "weekly_report",   l: "Weekly performance report",  desc: "Summary of your marketing metrics every Monday" },
          ].map(({ k, l, desc }) => (
            <div key={k} className="flex items-start justify-between p-4 rounded-xl bg-card border border-border gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{l}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => setNotifs(p => ({ ...p, [k]: !p[k] }))}
                className={`flex-shrink-0 transition-all relative mt-0.5 rounded-full ${notifs[k] ? "bg-fuchsia-500" : "bg-muted"}`}
                style={{ height: "22px", width: "40px" }}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${notifs[k] ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}