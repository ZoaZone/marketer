import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Megaphone, Plus, Play, Pause, CheckCircle2, Clock, BarChart2, Loader2, X, Mail, Phone, MessageSquare, Share2, Filter, Search } from "lucide-react";

const CHANNEL_ICONS = { email: Mail, sms: Phone, whatsapp: MessageSquare, social: Share2, multi_channel: Megaphone };
const STATUS_COLORS = {
  draft: "bg-muted text-muted-foreground", scheduled: "bg-amber-500/10 text-amber-400",
  running: "bg-emerald-500/10 text-emerald-400", completed: "bg-blue-500/10 text-blue-400", paused: "bg-orange-500/10 text-orange-400"
};

export default function Campaigns() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState({ name: "", type: "email", subject: "", body: "", scheduled_at: "" });
  const [saving, setSaving] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", user?.email],
    queryFn: () => base44.entities.MarketingCampaign.list("-created_date", 100),
    enabled: !!user?.email,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts_count"],
    queryFn: () => base44.entities.MarketingContact.list(null, 500),
  });

  const create = async () => {
    if (!form.name || !form.body) { alert("Name and body required"); return; }
    setSaving(true);
    try {
      await base44.entities.MarketingCampaign.create({ ...form, status: form.scheduled_at ? "scheduled" : "draft", sent_count: 0, open_count: 0, click_count: 0 });
      qc.invalidateQueries(["campaigns"]);
      setForm({ name: "", type: "email", subject: "", body: "", scheduled_at: "" });
      setShowCreate(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    await base44.entities.MarketingCampaign.update(id, { status });
    qc.invalidateQueries(["campaigns"]);
  };

  const filtered = campaigns.filter(c => {
    const q = search.toLowerCase();
    return (!q || (c.name || "").toLowerCase().includes(q)) && (typeFilter === "all" || c.type === typeFilter);
  });

  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.open_count || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><Megaphone className="w-6 h-6 text-fuchsia-400" /> Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Email, SMS, WhatsApp & multi-channel campaigns</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Campaigns", value: campaigns.length, color: "text-fuchsia-400 bg-fuchsia-500/10" },
          { label: "Running", value: campaigns.filter(c => c.status === "running").length, color: "text-emerald-400 bg-emerald-500/10" },
          { label: "Total Sent", value: totalSent.toLocaleString(), color: "text-blue-400 bg-blue-500/10" },
          { label: "Total Opens", value: totalOpens.toLocaleString(), color: "text-amber-400 bg-amber-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl font-black text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns…" className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
          <option value="all">All Types</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="social">Social</option>
          <option value="multi_channel">Multi-Channel</option>
        </select>
      </div>

      {/* Campaign list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Megaphone className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-foreground font-medium">No campaigns yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first email, SMS, or WhatsApp campaign</p>
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold">
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(c => {
              const Icon = CHANNEL_ICONS[c.type] || Megaphone;
              const openRate = c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : 0;
              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-fuchsia-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.type} · {c.sent_count || 0} sent · {openRate}% open rate</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[c.status] || "bg-muted text-muted-foreground"}`}>{c.status}</span>
                    {c.status === "draft" && (
                      <button onClick={() => updateStatus(c.id, "running")} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title="Launch">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.status === "running" && (
                      <button onClick={() => updateStatus(c.id, "paused")} className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors" title="Pause">
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button onClick={() => updateStatus(c.id, "running")} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title="Resume">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-foreground text-lg">New Campaign</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Campaign Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Summer Promo 2026" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Channel *</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="social">Social</option>
                    <option value="multi_channel">Multi-Channel</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Schedule (optional)</label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                {form.type === "email" && (
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Subject Line</label>
                    <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Email subject…" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                )}
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Message Body *</label>
                  <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={4} placeholder="Write your message…" className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Target audience: all {contacts.length} contacts with opt-in for {form.type}</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={create} disabled={saving || !form.name || !form.body} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Create Campaign</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
