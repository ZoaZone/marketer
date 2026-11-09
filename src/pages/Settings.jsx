import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Key, Bell, Save, CheckCircle2, Loader2, Eye, EyeOff,
  Zap, User, Share2, Plus, Trash2, AlertCircle, ExternalLink
} from "lucide-react";
import { base44 } from "@/api/base44Client";

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
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showToken, setShowToken] = useState({});
  const [form, setForm] = useState({
    platform: "instagram",
    account_name: "",
    username: "",
    access_token: "",
    refresh_token: "",
    page_id: "",
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["social_accounts"],
    queryFn: () => base44.entities.SocialAccount.list("-created_date", 50),
  });

  const selectedPlatform = SOCIAL_PLATFORMS.find(p => p.id === form.platform);

  const handleAdd = async () => {
    if (!form.access_token.trim()) { alert("Access token is required"); return; }
    if (!form.account_name.trim()) { alert("Account name is required"); return; }
    setSaving(true);
    try {
      await base44.entities.SocialAccount.create({
        platform: form.platform,
        account_name: form.account_name,
        username: form.username || "",
        access_token: form.access_token,
        refresh_token: form.refresh_token || "",
        page_id: form.page_id || "",
        status: "active",
      });
      qc.invalidateQueries(["social_accounts"]);
      setAdding(false);
      setForm({ platform: "instagram", account_name: "", username: "", access_token: "", refresh_token: "", page_id: "" });
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
            return (
              <div key={acc.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${platform?.color || "from-gray-500 to-gray-700"} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-sm font-black text-white">{(acc.platform || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{acc.account_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="capitalize">{platform?.label || acc.platform}</span>
                    {acc.username && <span>· @{acc.username}</span>}
                    {acc.page_id && <span>· Page ID: {acc.page_id}</span>}
                    <span className="text-emerald-400">· Active</span>
                  </p>
                </div>
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
              onClick={() => { setAdding(false); setForm({ platform: "instagram", account_name: "", username: "", access_token: "", refresh_token: "", page_id: "" }); }}
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
  const { user } = useOutletContext() || {};
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState({});
  const [tab, setTab] = useState("apikeys");
  const [keys, setKeys] = useState({
    sendgrid_key: "", twilio_sid: "", twilio_token: "", twilio_phone: "",
    whatsapp_token: "", whatsapp_phone_id: "", stripe_key: "",
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
      await base44.auth.updateMe({ settings: { api_keys: keys, profile, notifications: notifs } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert("Save failed: " + e.message); }
    setSaving(false);
  };

  const TABS = [
    { v: "apikeys",  l: "API Keys",        Icon: Key },
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
          {KEY_FIELDS.map(({ k, l, ph, help }) => (
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