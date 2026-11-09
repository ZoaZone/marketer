import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { UserPlus, Plus, Search, Globe, Share2, Loader2, X, Download } from "lucide-react";

const SOURCE_COLORS = { website:"bg-blue-500/10 text-blue-400", social:"bg-pink-500/10 text-pink-400", ad:"bg-amber-500/10 text-amber-400", referral:"bg-emerald-500/10 text-emerald-400", manual:"bg-muted text-muted-foreground", qr_code:"bg-purple-500/10 text-purple-400" };

export default function LeadCapturePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name:"", email:"", phone:"", whatsapp:"", source:"website", utm_source:"", utm_campaign:"" });
  const [saving, setSaving] = useState(false);

  const { data: leads = [], isLoading } = useQuery({ queryKey:["leads"], queryFn:()=>base44.entities.LeadCapture.list("-captured_at",200) });
  const { data: funnels = [] } = useQuery({ queryKey:["funnels_list"], queryFn:()=>base44.entities.Funnel.list(null,50) });

  const filtered = leads.filter(l=>{
    const q = search.toLowerCase();
    const mQ = !q||(l.full_name||"").toLowerCase().includes(q)||(l.email||"").toLowerCase().includes(q)||(l.phone||"").includes(q);
    const mS = sourceFilter==="all"||l.source===sourceFilter;
    return mQ&&mS;
  });

  const save = async () => {
    if (!form.full_name && !form.email) { alert("Name or email required"); return; }
    setSaving(true);
    try {
      await base44.entities.LeadCapture.create({ ...form, captured_at:new Date().toISOString() });
      await base44.entities.MarketingContact.create({ full_name:form.full_name, email:form.email, phone:form.phone, whatsapp:form.whatsapp, source:form.source });
      qc.invalidateQueries(["leads"]); qc.invalidateQueries(["contacts"]);
      setForm({ full_name:"", email:"", phone:"", whatsapp:"", source:"website", utm_source:"", utm_campaign:"" });
      setShowAdd(false);
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const bySource = leads.reduce((acc,l)=>{ acc[l.source]=(acc[l.source]||0)+1; return acc; },{});
  const todayCount = leads.filter(l=>l.captured_at&&new Date(l.captured_at).toDateString()===new Date().toDateString()).length;
  const topSource = Object.entries(bySource).sort((a,b)=>b[1]-a[1])[0];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><UserPlus className="w-6 h-6 text-fuchsia-400"/>Lead Capture</h1>
          <p className="text-muted-foreground text-sm mt-0.5">All incoming leads from every channel</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
          <Plus className="w-4 h-4"/>Add Lead
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{label:"Total Leads",value:leads.length,color:"text-fuchsia-400 bg-fuchsia-500/10"},
          {label:"Today",value:todayCount,color:"text-emerald-400 bg-emerald-500/10"},
          {label:"Top Source",value:topSource?topSource[0]:"—",color:"text-amber-400 bg-amber-500/10"},
          {label:"In Funnels",value:leads.filter(l=>l.funnel_id).length,color:"text-blue-400 bg-blue-500/10"}
        ].map(s=>(
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-xl font-black text-foreground capitalize">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-foreground mb-3">Lead Sources</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(bySource).sort((a,b)=>b[1]-a[1]).map(([src,cnt])=>(
            <div key={src} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${SOURCE_COLORS[src]||"bg-muted text-muted-foreground"}`}>
              {src}: {cnt}
            </div>
          ))}
          {Object.keys(bySource).length===0&&<p className="text-muted-foreground text-sm">No leads yet</p>}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search leads…" className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
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
            <UserPlus className="w-10 h-10 text-muted-foreground/20 mb-3"/>
            <p className="text-foreground font-medium">No leads yet</p>
            <button onClick={()=>setShowAdd(true)} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold">Add First Lead</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/20 border-b border-border">
                {["Name","Email","Phone","Source","Campaign","Captured"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.slice(0,100).map(l=>(
                  <tr key={l.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{l.full_name||"—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.email||"—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.phone||"—"}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[l.source]||"bg-muted text-muted-foreground"}`}>{l.source}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.utm_campaign||"—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.captured_at?new Date(l.captured_at).toLocaleDateString():""}</td>
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
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold text-foreground text-lg">Add Lead</h3><button onClick={()=>setShowAdd(false)}><X className="w-5 h-5 text-muted-foreground"/></button></div>
            <div className="space-y-3">
              {[{k:"full_name",l:"Full Name",ph:"Jane Smith"},{k:"email",l:"Email",ph:"jane@co.com",t:"email"},{k:"phone",l:"Phone",ph:"+1 555 000 0000"},{k:"whatsapp",l:"WhatsApp",ph:"+1 555 000 0000"},{k:"utm_source",l:"UTM Source",ph:"google"},{k:"utm_campaign",l:"UTM Campaign",ph:"summer-promo"}].map(f=>(
                <div key={f.k} className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{f.l}</label>
                <input type={f.t||"text"} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
              ))}
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Source</label>
              <select value={form.source} onChange={e=>setForm(p=>({...p,source:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
                {["website","social","ad","referral","qr_code","manual"].map(s=><option key={s}>{s}</option>)}
              </select></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowAdd(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:"Save Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
