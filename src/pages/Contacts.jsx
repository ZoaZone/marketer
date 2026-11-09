import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, Plus, Search, Mail, Phone, MessageSquare, Loader2, X, Download } from "lucide-react";

const SOURCE_COLORS = { website:"bg-blue-500/10 text-blue-400", social:"bg-pink-500/10 text-pink-400", ad:"bg-amber-500/10 text-amber-400", referral:"bg-emerald-500/10 text-emerald-400", manual:"bg-muted text-muted-foreground", qr_code:"bg-purple-500/10 text-purple-400" };

export default function Contacts() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name:"", email:"", phone:"", whatsapp:"", source:"manual", tags:"", opted_in_email:true, opted_in_sms:false, opted_in_whatsapp:false });
  const [saving, setSaving] = useState(false);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.MarketingContact.list("-created_date", 500),
  });

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const mQ = !q || (c.full_name||"").toLowerCase().includes(q) || (c.email||"").toLowerCase().includes(q) || (c.phone||"").includes(q);
    const mS = sourceFilter === "all" || c.source === sourceFilter;
    return mQ && mS;
  });

  const save = async () => {
    if (!form.full_name && !form.email) { alert("Name or email required"); return; }
    setSaving(true);
    try {
      await base44.entities.MarketingContact.create({ ...form, tags: form.tags ? form.tags.split(",").map(t=>t.trim()) : [] });
      qc.invalidateQueries(["contacts"]);
      setForm({ full_name:"", email:"", phone:"", whatsapp:"", source:"manual", tags:"", opted_in_email:true, opted_in_sms:false, opted_in_whatsapp:false });
      setShowAdd(false);
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const exportCSV = () => {
    const rows = [["Name","Email","Phone","Source","Tags","Opt-in Email","Opt-in SMS"],
      ...filtered.map(c=>[c.full_name,c.email,c.phone,c.source,(c.tags||[]).join(";"),c.opted_in_email,c.opted_in_sms])];
    const csv = rows.map(r=>r.map(v=>`"${v||""}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv,"+encodeURIComponent(csv); a.download="contacts.csv"; a.click();
  };

  const optedEmail = contacts.filter(c=>c.opted_in_email).length;
  const optedSMS = contacts.filter(c=>c.opted_in_sms).length;
  const optedWA = contacts.filter(c=>c.opted_in_whatsapp).length;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><Users className="w-6 h-6 text-fuchsia-400"/>Contacts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{contacts.length} total contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/20"><Download className="w-4 h-4"/>Export</button>
          <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20"><Plus className="w-4 h-4"/>Add Contact</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{label:"Email opt-ins",value:optedEmail,Icon:Mail,color:"text-blue-400 bg-blue-500/10"},
          {label:"SMS opt-ins",value:optedSMS,Icon:Phone,color:"text-emerald-400 bg-emerald-500/10"},
          {label:"WhatsApp opt-ins",value:optedWA,Icon:MessageSquare,color:"text-amber-400 bg-amber-500/10"}].map(s=>(
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${s.color} flex items-center justify-center flex-shrink-0`}><s.Icon className={`w-4 h-4 ${s.color.split(" ")[0]}`}/></div>
            <div><div className="text-xl font-black text-foreground">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email, phone…" className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
        </div>
        <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
          <option value="all">All Sources</option>
          {["website","social","ad","referral","qr_code","manual"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/20 mb-3"/>
            <p className="text-foreground font-medium">{contacts.length===0?"No contacts yet":"No contacts match filters"}</p>
            <button onClick={()=>setShowAdd(true)} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold">Add First Contact</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/20 border-b border-border">
                {["Name","Email","Phone","Source","Tags","Opt-ins","Added"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.slice(0,100).map(c=>(
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{c.full_name||"—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.email||"—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.phone||"—"}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[c.source]||"bg-muted text-muted-foreground"}`}>{c.source||"manual"}</span></td>
                    <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{(c.tags||[]).slice(0,2).map(t=><span key={t} className="text-[10px] px-1.5 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 rounded-full">{t}</span>)}</div></td>
                    <td className="px-4 py-3"><div className="flex gap-1">{c.opted_in_email&&<Mail className="w-3 h-3 text-blue-400"/>}{c.opted_in_sms&&<Phone className="w-3 h-3 text-emerald-400"/>}{c.opted_in_whatsapp&&<MessageSquare className="w-3 h-3 text-amber-400"/>}</div></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.created_date?new Date(c.created_date).toLocaleDateString():""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold text-foreground text-lg">Add Contact</h3><button onClick={()=>setShowAdd(false)}><X className="w-5 h-5 text-muted-foreground"/></button></div>
            <div className="space-y-3">
              {[{k:"full_name",l:"Full Name",ph:"Jane Smith"},{k:"email",l:"Email",ph:"jane@company.com",t:"email"},{k:"phone",l:"Phone",ph:"+1 555 000 0000"},{k:"whatsapp",l:"WhatsApp",ph:"+1 555 000 0000"}].map(f=>(
                <div key={f.k} className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{f.l}</label>
                <input type={f.t||"text"} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Source</label>
                <select value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
                  {["manual","website","social","ad","referral","qr_code"].map(s=><option key={s}>{s}</option>)}
                </select></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
                <input value={form.tags} onChange={e=>setForm(p=>({...p,tags:e.target.value}))} placeholder="vip, lead, hot" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none"/></div>
              </div>
              <div className="flex gap-4 pt-1">
                {[{k:"opted_in_email",l:"Email"},{k:"opted_in_sms",l:"SMS"},{k:"opted_in_whatsapp",l:"WhatsApp"}].map(o=>(
                  <label key={o.k} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={form[o.k]} onChange={e=>setForm(p=>({...p,[o.k]:e.target.checked}))} className="rounded"/> {o.l}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowAdd(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:"Save Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
