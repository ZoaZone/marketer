import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { Building2, Plus, Search, Globe, Mail, Phone } from "lucide-react";

const STATUS_COLORS = {
  active:   "bg-emerald-500/10 text-emerald-400",
  inactive: "bg-muted text-muted-foreground",
  trial:    "bg-amber-500/10 text-amber-400",
};

const PLAN_COLORS = {
  starter: "bg-blue-500/10 text-blue-400",
  growth:  "bg-fuchsia-500/10 text-fuchsia-400",
  agency:  "bg-purple-500/10 text-purple-400",
};

export default function AgencyPortal() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ business_name: "", contact_email: "", contact_phone: "", website_url: "", industry: "", plan_tier: "starter" });
  const [saving, setSaving] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["agency_clients", user?.email],
    queryFn: () => base44.entities.Client.filter(mine(user), "-created_date", 100),
    enabled: !!user?.email,
  });

  const filtered = clients.filter(c =>
    !search || (c.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_email || "").toLowerCase().includes(search.toLowerCase())
  );

  const addClient = async () => {
    if (!form.business_name || !form.contact_email) { alert("Business name and email required"); return; }
    setSaving(true);
    try {
      await base44.entities.Client.create({ ...form, status: "active" });
      qc.invalidateQueries(["agency_clients"]);
      setForm({ business_name: "", contact_email: "", contact_phone: "", website_url: "", industry: "", plan_tier: "starter" });
      setShowAdd(false);
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const STATS = [
    { label: "Total Clients", value: clients.length, color: "text-fuchsia-400 bg-fuchsia-500/10" },
    { label: "Active", value: clients.filter(c => c.status === "active").length, color: "text-emerald-400 bg-emerald-500/10" },
    { label: "On Trial", value: clients.filter(c => c.status === "trial").length, color: "text-amber-400 bg-amber-500/10" },
    { label: "Growth Plan", value: clients.filter(c => c.plan_tier === "growth").length, color: "text-purple-400 bg-purple-500/10" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-fuchsia-400" /> Agency Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage all your client accounts from one place</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATS.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl font-black text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-fuchsia-500/50 transition-colors" />
      </div>

      {/* Client list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading clients...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-muted-foreground font-medium">{search ? "No clients match your search" : "No clients yet"}</p>
          {!search && <button onClick={() => setShowAdd(true)} className="mt-3 text-fuchsia-400 text-sm hover:underline">Add your first client →</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(client => (
            <div key={client.id} className="bg-card border border-border rounded-2xl p-5 hover:border-fuchsia-500/20 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-foreground">{client.business_name}</h3>
                  <p className="text-xs text-muted-foreground">{client.industry || "—"}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[client.status] || STATUS_COLORS.active}`}>{client.status}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[client.plan_tier] || PLAN_COLORS.starter}`}>{client.plan_tier || "starter"}</span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {client.contact_email && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{client.contact_email}</div>}
                {client.contact_phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{client.contact_phone}</div>}
                {client.website_url && (
                  <a href={client.website_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-fuchsia-400 hover:underline">
                    <Globe className="w-3 h-3" />{client.website_url}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add client modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground">Add New Client</h2>
            <div className="space-y-3">
              {[
                { label: "Business Name *", field: "business_name", type: "text" },
                { label: "Contact Email *", field: "contact_email", type: "email" },
                { label: "Phone", field: "contact_phone", type: "tel" },
                { label: "Website URL", field: "website_url", type: "url" },
                { label: "Industry", field: "industry", type: "text" },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                  <input type={type} value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:border-fuchsia-500/50" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Plan</label>
                <select value={form.plan_tier} onChange={e => setForm(p => ({ ...p, plan_tier: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none">
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="agency">Agency</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={addClient} disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {saving ? "Adding..." : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
