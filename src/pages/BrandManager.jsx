import React, { useState, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// Standard relative path module fallback mapping
import { base44 } from "../api/base44Client";
import { mine } from "../utils/scope";
import {
  Building2, Plus, Pencil, Trash2,
  CheckCircle2, X, Loader2, Zap, Upload, ImagePlus, Share2, ChevronRight, ChevronDown,
  RefreshCw
} from "lucide-react";

const ACCOUNT_STATUS = {
  active:       { dot: "bg-emerald-400", text: "text-emerald-400", label: "Active" },
  connected:    { dot: "bg-emerald-400", text: "text-emerald-400", label: "Active" },
  expired:      { dot: "bg-amber-400",   text: "text-amber-400",   label: "Expired" },
  disconnected: { dot: "bg-red-400",     text: "text-red-400",     label: "Disconnected" },
};

const INDUSTRIES = [
  "E-commerce","Fashion & Apparel","Food & Beverage","Health & Wellness",
  "Technology","Real Estate","Education","Finance","Travel & Hospitality",
  "Beauty & Cosmetics","Fitness","Entertainment","Professional Services","Other"
];

const BRAND_VOICES = [
  "Professional & Authoritative","Friendly & Conversational","Bold & Energetic",
  "Luxury & Sophisticated","Playful & Humorous","Inspirational & Motivating",
  "Empathetic & Supportive","Educational & Informative"
];

// blob:/data: URLs only resolve inside the browser tab/session that created
// them (or bloat the record, for data:) — they must never be persisted as a
// brand's logo_url, or every later render (a different session, a page
// reload, a video compile) gets a dead reference and the logo silently fails
// to load.
const isTemporaryBrowserUrl = (url) => /^(blob|data):/i.test((url || "").trim());

const PLATFORMS = [
  { id:"instagram", label:"Instagram", color:"from-pink-500 to-rose-600" },
  { id:"facebook",  label:"Facebook",  color:"from-blue-500 to-blue-700" },
  { id:"tiktok",    label:"TikTok",    color:"from-gray-700 to-gray-900" },
  { id:"linkedin",  label:"LinkedIn",  color:"from-sky-600 to-blue-800" },
  { id:"youtube",   label:"YouTube",   color:"from-red-500 to-red-700" },
  { id:"twitter_x", label:"Twitter/X", color:"from-zinc-600 to-zinc-900" },
  { id:"whatsapp",  label:"WhatsApp",  color:"from-green-500 to-emerald-600" },
  { id:"pinterest", label:"Pinterest", color:"from-rose-600 to-red-700" },
];

const FONTS = ["Arial", "Inter", "Poppins", "Montserrat", "Playfair Display", "Roboto"];

// Keyed by the numeric userTier from AppLayout: 0 = free trial (no active
// subscription), 1 = Starter, 2 = Growth, 3 = Agency.
const TIER_LIMITS = { 0: 1, 1: 1, 2: 3, 3: 10, 4: 25 };
const TIER_NAMES = { 0: "Free Trial", 1: "Starter", 2: "Growth", 3: "Agency", 4: "Enterprise" };
const STEPS = ["Details", "Colors & Voice", "Social Accounts", "Review"];

const inp = "w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-fuchsia-500/70 transition";
const lbl = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";

export default function BrandManager() {
  const { user, userTier = 0, isAdmin } = useOutletContext() || {};
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logoRef = useRef();

  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const emptyForm = {
    name:"", tagline:"", industry:"", logo_url:"", logo_file_url:"",
    primary_color:"#7c3aed", secondary_color:"#a855f7", accent_color:"#ec4899", font_family:"Arial",
    brand_voice:"", target_audience:"", website:"", email:"", phone:""
  };
  const [form, setForm] = useState(emptyForm);
  const [logoUrlError, setLogoUrlError] = useState("");

  const [newAccount, setNewAccount] = useState({ platform:"instagram", account_name:"", username:"", access_token:"", connection_method:"api" });
  const [addingAccount, setAddingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["brands", user?.email],
    queryFn: () => base44.entities.Brand.filter(mine(user), "-created_date", 20),
    enabled: !!user?.email,
  });

  const { data: allAccounts = [] } = useQuery({
    queryKey: ["social_accounts", user?.email],
    queryFn: () => base44.entities.SocialAccount.filter(mine(user), "-created_date", 100),
    enabled: !!user?.email,
  });

  const maxBrands = isAdmin ? Infinity : (TIER_LIMITS[userTier] ?? 1);
  const canAddMore = brands.length < maxBrands;
  const tierName = TIER_NAMES[userTier] || "Free Trial";

  const openNew = () => {
    setEditing(null); setForm(emptyForm); setFormStep(0); setShowForm(true); setLogoUrlError("");
  };

  const openEdit = (b) => {
    setEditing(b.id);
    setForm({ name:b.name||"", tagline:b.tagline||"", industry:b.industry||"", logo_url:b.logo_url||"", logo_file_url:b.logo_file_url||"", primary_color:b.primary_color||"#7c3aed", secondary_color:b.secondary_color||"#a855f7", accent_color:b.accent_color||"#ec4899", font_family:b.font_family||"Arial", brand_voice:b.brand_voice||"", target_audience:b.target_audience||"", website:b.website||"", email:b.email||"", phone:b.phone||"" });
    setFormStep(0); setShowForm(true); setLogoUrlError("");
  };

  // FIXED: Converted to use standard native Base44 core upload payload schemas
  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const targetUrl = res?.file_url || res?.url || (typeof res === "string" ? res : "");
      
      if (!targetUrl) throw new Error("Could not parse file URL from upload response.");
      
      setForm(f => ({ ...f, logo_file_url: targetUrl, logo_url: targetUrl }));
    } catch (e) { 
      alert("Logo upload failed: " + e.message); 
    }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) { alert("Brand name is required"); return; }
    // Defense in depth: never persist a blob:/data: logo URL, even if one
    // slipped into form state some other way — it would be dead in every
    // future session (including video compiles) the moment it's saved.
    if (isTemporaryBrowserUrl(form.logo_url) || isTemporaryBrowserUrl(form.logo_file_url)) {
      alert("The logo URL isn't a real link (it looks like a temporary browser address). Please use Upload Logo, or paste a real https:// link.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Brand.update(editing, form);
      } else {
        await base44.entities.Brand.create({ ...form, owner_id: user?.id, is_active: true });
      }
      qc.invalidateQueries(["brands"]);
      setShowForm(false);
    } catch (e) { alert("Save failed: " + e.message); }
    setSaving(false);
  };

  const deleteBrand = async (id) => {
    if (!confirm("Delete this brand?")) return;
    await base44.entities.Brand.delete(id);
    qc.invalidateQueries(["brands"]);
  };

  const saveAccount = async (brandId) => {
    if (!newAccount.account_name.trim()) { alert("Account name is required"); return; }
    setSavingAccount(true);
    try {
      // Via saveSocialAccount so the platform token is encrypted at rest — see
      // the matching call in Settings.jsx. Writing the entity directly from the
      // browser would store the credential in plaintext.
      const res = await base44.functions.invoke("saveSocialAccount", { ...newAccount, brand_id: brandId });
      const created = res?.data?.account ?? res?.account;
      if (!created?.id) throw new Error(res?.data?.error || res?.error || "Could not save the account.");
      try {
        await base44.functions.invoke("testSocialConnection", { account_id: created.id });
      } catch (_e) { /* verification is best-effort */ }
      qc.invalidateQueries(["social_accounts"]);
      setNewAccount({ platform:"instagram", account_name:"", username:"", access_token:"", connection_method:"api" });
      setAddingAccount(false);
    } catch (e) { alert(e.message); }
    setSavingAccount(false);
  };

  const removeAccount = async (id) => {
    await base44.entities.SocialAccount.delete(id);
    qc.invalidateQueries(["social_accounts"]);
  };

  const testConnection = async (id) => {
    setTestingId(id);
    try {
      await base44.functions.invoke("testSocialConnection", { account_id: id });
      qc.invalidateQueries(["social_accounts"]);
    } catch (e) { alert("Connection test failed: " + e.message); }
    setTestingId(null);
  };

  const brandAccounts = (brandId) => allAccounts.filter(a => a.brand_id === brandId);
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-fuchsia-400" /> Brand Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {brands.length}{isAdmin ? "" : `/${maxBrands}`} brands · <span className="text-fuchsia-400">{isAdmin ? "Admin" : tierName}</span> plan
          </p>
        </div>
        <button onClick={openNew} disabled={!canAddMore}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> New Brand
        </button>
      </div>

      {!canAddMore && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-3 flex-1">
            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300 text-sm">
              {userTier === 0
                ? `Your free trial includes ${maxBrands} brand. Subscribe to a plan to add more brands and unlock full access.`
                : `Brand limit reached for the ${tierName} plan (${maxBrands}). Upgrade to Growth (3) or Agency (10) for more.`}
            </p>
          </div>
          <button onClick={() => navigate("/pricing")}
            className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 transition-all">
            Subscribe
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" /></div>
      ) : brands.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-white/10 rounded-2xl">
          <Building2 className="w-14 h-14 mx-auto text-muted-foreground/20 mb-4" />
          <p className="text-foreground font-bold text-lg">No brands yet</p>
          <p className="text-muted-foreground text-sm mt-1 mb-5">Create your first brand to start creating campaigns</p>
          <button onClick={openNew} className="px-5 py-2.5 rounded-xl bg-fuchsia-600 text-white font-bold text-sm hover:opacity-90">
            Create Brand
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {brands.map(b => {
            const accs = brandAccounts(b.id);
            const isExpanded = expandedId === b.id;
            const currentBrandId = b.id;
            
            return (
              <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center gap-4 p-5">
                  <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10"
                    style={{ background: b.primary_color || "#7c3aed" }}>
                    {b.logo_url
                      ? <img src={b.logo_url} alt={b.name} className="w-full h-full object-contain" />
                      : <span className="text-2xl font-black text-white">{b.name?.[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-foreground text-lg leading-none">{b.name}</p>
                      {b.industry && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-400">{b.industry}</span>}
                    </div>
                    {b.tagline && <p className="text-muted-foreground text-sm mt-0.5 truncate">{b.tagline}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex gap-1">
                        {[b.primary_color, b.secondary_color, b.accent_color].map((c, i) =>
                          c ? <div key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ background: c }} /> : null
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{accs.length} account{accs.length !== 1 ? "s" : ""} connected</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(b)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteBrand(b.id)} className="p-2 rounded-lg bg-red-500/5 hover:bg-red-500/15 text-red-400 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-5 space-y-4 bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-fuchsia-400" /> Social Accounts for {b.name}
                      </p>
                      <button onClick={() => setAddingAccount(!addingAccount)}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600/30 transition">
                        <Plus className="w-3 h-3" /> Add Account
                      </button>
                    </div>

                    {accs.length === 0 && !addingAccount && (
                      <p className="text-xs text-muted-foreground text-center py-4">No social accounts linked yet. Add one to start posting.</p>
                    )}
                    {accs.length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {accs.map(a => {
                          const plat = PLATFORMS.find(p => p.id === a.platform);
                          const st = ACCOUNT_STATUS[a.status] || ACCOUNT_STATUS.disconnected;
                          const isTesting = testingId === a.id;
                          return (
                            <div key={a.id} title={a.description || st.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${plat?.color || "from-gray-500 to-gray-700"} flex items-center justify-center flex-shrink-0`}>
                                <span className="text-xs font-black text-white">{a.platform?.[0]?.toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-foreground">{a.account_name}</p>
                                <p className="text-xs text-muted-foreground">{plat?.label} {a.username ? `· @${a.username}` : ""}</p>
                              </div>
                              <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-white/5 ${st.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                              </span>
                              <button onClick={() => testConnection(a.id)} disabled={isTesting} title="Test connection" className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition disabled:opacity-50">
                                {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              </button>
                              <button onClick={() => removeAccount(a.id)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {addingAccount && (
                      <div className="bg-background border border-border rounded-xl p-4 space-y-3">
                        <p className="text-xs font-bold text-foreground">Link a Social Account</p>
                        <div className="flex flex-wrap gap-2">
                          {PLATFORMS.map(p => (
                            <button key={p.id} onClick={() => setNewAccount(a => ({ ...a, platform: p.id }))}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition ${newAccount.platform === p.id ? "bg-fuchsia-600 text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[{id:"api",icon:"🔌",l:"API Token"},{id:"webhook",icon:"🔗",l:"Webhook"}].map(m => (
                            <button key={m.id} onClick={() => setNewAccount(a => ({ ...a, connection_method: m.id }))}
                              className={`py-2 rounded-xl border text-center text-xs font-bold transition ${newAccount.connection_method === m.id ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300" : "border-white/10 text-muted-foreground hover:border-white/20"}`}>
                              {m.icon} {m.l}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={lbl}>Display Name *</label>
                            <input value={newAccount.account_name} onChange={e => setNewAccount(a => ({ ...a, account_name: e.target.value }))} placeholder="My Instagram Page" className={inp} />
                          </div>
                          <div>
                            <label className={lbl}>Username / Handle</label>
                            <input value={newAccount.username} onChange={e => setNewAccount(a => ({ ...a, username: e.target.value }))} placeholder="@yourhandle" className={inp} />
                          </div>
                        </div>
                        {newAccount.connection_method === "api" && (
                          <div>
                            <label className={lbl}>Access Token</label>
                            <input type="password" value={newAccount.access_token} onChange={e => setNewAccount(a => ({ ...a, access_token: e.target.value }))} placeholder="Paste API token" className={inp} />
                            <p className="text-[10px] text-muted-foreground mt-1">Required — none of these platforms accept a username/password for posting.</p>
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setAddingAccount(false)} className="px-3 py-2 rounded-xl bg-white/5 text-muted-foreground text-xs hover:bg-white/10">Cancel</button>
                          <button onClick={() => saveAccount(currentBrandId)} disabled={savingAccount}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-600 text-white text-xs font-bold hover:opacity-90 disabled:opacity-50">
                            {savingAccount ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Save Account
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl my-4">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-lg font-black text-white">{editing ? "Edit Brand" : "Create New Brand"}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{STEPS[formStep]} — Step {formStep+1} of {STEPS.length}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex px-6 pt-4 gap-2">
              {STEPS.map((s, i) => (
                <button key={s} onClick={() => i < formStep + 1 && setFormStep(i)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${formStep === i ? "bg-fuchsia-600 text-white" : i < formStep ? "bg-fuchsia-600/30 text-fuchsia-400" : "bg-white/5 text-slate-500"}`}>
                  {i < formStep ? "✓" : i + 1}. {s}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {formStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className={lbl + " text-slate-400"}>Brand Name *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your Brand Name" className={inp} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lbl + " text-slate-400"}>Tagline</label>
                      <input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} placeholder="Your brand tagline" className={inp} />
                    </div>
                    <div>
                      <label className={lbl + " text-slate-400"}>Industry</label>
                      <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} className={inp}>
                        <option value="">Select industry</option>
                        {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={lbl + " text-slate-400"}>Website</label>
                      <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://" className={inp} />
                    </div>
                    <div>
                      <label className={lbl + " text-slate-400"}>Email</label>
                      <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="brand@email.com" className={inp} />
                    </div>
                    <div>
                      <label className={lbl + " text-slate-400"}>Phone</label>
                      <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl + " text-slate-400"}>Brand Logo</label>
                    <div className="flex items-center gap-4">
                      {(form.logo_url || form.logo_file_url) ? (
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/20 bg-white/5 flex-shrink-0">
                          <img src={form.logo_url || form.logo_file_url} alt="logo" className="w-full h-full object-contain" />
                          <button onClick={() => setForm(f => ({ ...f, logo_url: "", logo_file_url: "" }))}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center bg-white/5 flex-shrink-0">
                          <ImagePlus className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <button onClick={() => logoRef.current?.click()} disabled={uploading}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium hover:bg-white/15 transition disabled:opacity-50">
                          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {uploading ? "Uploading..." : "Upload Logo"}
                        </button>
                        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => uploadLogo(e.target.files?.[0])} />
                        <p className="text-xs text-slate-500">Or paste URL below</p>
                        <input value={form.logo_url} onChange={e => {
                          const value = e.target.value;
                          if (isTemporaryBrowserUrl(value)) {
                            setLogoUrlError("That's a temporary browser address, not a real link — it won't work once this page reloads or in a compiled video. Use Upload Logo instead, or paste a real https:// link.");
                            return;
                          }
                          setLogoUrlError("");
                          setForm(f => ({ ...f, logo_url: value }));
                        }} placeholder="https://..." className={inp} />
                        {logoUrlError && <p className="text-xs text-red-400 mt-1">{logoUrlError}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {formStep === 1 && (
                <div className="space-y-5">
                  <div>
                    <label className={lbl + " text-slate-400"}>Brand Colors</label>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { key:"primary_color", label:"Primary" },
                        { key:"secondary_color", label:"Secondary" },
                        { key:"accent_color", label:"Accent" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex flex-col items-center gap-2">
                          <div className="w-full h-12 rounded-xl border border-white/20 overflow-hidden cursor-pointer hover:scale-105 transition" style={{ background: form[key] }}>
                            <input type="color" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                              className="w-full h-full opacity-0 cursor-pointer" />
                          </div>
                          <span className="text-xs text-slate-400">{label}</span>
                          <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full text-center text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white focus:outline-none" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={lbl + " text-slate-400"}>Caption Font</label>
                    <select value={form.font_family} onChange={e => setForm(f => ({ ...f, font_family: e.target.value }))} className={inp}>
                      {FONTS.map(f => <option key={f}>{f}</option>)}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Used for on-screen captions in AI-generated videos for this brand.</p>
                  </div>
                  <div>
                    <label className={lbl + " text-slate-400"}>Brand Voice</label>
                    <div className="grid grid-cols-2 gap-2">
                      {BRAND_VOICES.map(v => (
                        <button key={v} onClick={() => setForm(f => ({ ...f, brand_voice: v }))}
                          className={`p-2.5 rounded-xl border text-xs text-left transition ${form.brand_voice === v ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300" : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={lbl + " text-slate-400"}>Target Audience</label>
                    <input value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} placeholder="e.g. Women 25-45 interested in wellness" className={inp} />
                  </div>
                </div>
              )}

              {formStep === 2 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20 text-sm text-fuchsia-300 text-center">
                    Social accounts are added after saving the brand. Save first, then expand the brand card to link accounts.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {PLATFORMS.map(p => (
                      <div key={p.id} className={`p-3 rounded-xl bg-gradient-to-br ${p.color} bg-opacity-10 border border-white/10 flex items-center gap-2`}>
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center`}>
                          <span className="text-xs font-black text-white">{p.label[0]}</span>
                        </div>
                        <span className="text-sm text-white font-medium">{p.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: form.primary_color }}>
                      {form.logo_url
                        ? <img src={form.logo_url} alt="logo" className="w-full h-full object-contain rounded-xl" />
                        : <span className="text-2xl font-black text-white">{form.name?.[0]?.toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <p className="text-xl font-black text-white">{form.name}</p>
                      {form.tagline && <p className="text-slate-400 text-sm">{form.tagline}</p>}
                      <div className="flex gap-1 mt-1.5">
                        {[form.primary_color, form.secondary_color, form.accent_color].map((c, i) => (
                          <div key={i} className="w-5 h-5 rounded-full border border-white/20" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {form.industry && <div className="p-3 rounded-xl bg-white/5"><span className="text-slate-400 text-xs block">Industry</span><span className="text-white font-medium">{form.industry}</span></div>}
                    {form.brand_voice && <div className="p-3 rounded-xl bg-white/5"><span className="text-slate-400 text-xs block">Brand Voice</span><span className="text-white font-medium">{form.brand_voice}</span></div>}
                    {form.target_audience && <div className="col-span-2 p-3 rounded-xl bg-white/5"><span className="text-slate-400 text-xs block">Target Audience</span><span className="text-white font-medium">{form.target_audience}</span></div>}
                    {form.website && <div className="p-3 rounded-xl bg-white/5"><span className="text-slate-400 text-xs block">Website</span><span className="text-fuchsia-400 font-medium">{form.website}</span></div>}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-white/10 justify-between">
              <button onClick={() => formStep > 0 ? setFormStep(s => s - 1) : setShowForm(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition">
                {formStep > 0 ? "← Back" : "Cancel"}
              </button>
              {formStep < STEPS.length - 1 ? (
                <button onClick={() => { if(formStep===0&&!form.name.trim()){alert("Brand name is required");return;} setFormStep(s=>s+1); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-bold text-sm hover:opacity-90 transition">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {editing ? "Save Changes" : "Create Brand"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}