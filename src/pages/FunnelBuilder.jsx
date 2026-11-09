import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { GitBranch, Plus, ArrowDown, Loader2, X, Trash2 } from "lucide-react";

const ACTION_COLORS = { email:"bg-blue-500/10 text-blue-400", sms:"bg-emerald-500/10 text-emerald-400", whatsapp:"bg-amber-500/10 text-amber-400", wait:"bg-muted text-muted-foreground", tag:"bg-purple-500/10 text-purple-400", move_stage:"bg-fuchsia-500/10 text-fuchsia-400" };

export default function FunnelBuilder() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [showNewFunnel, setShowNewFunnel] = useState(false);
  const [showNewStage, setShowNewStage] = useState(false);
  const [funnelForm, setFunnelForm] = useState({ name:"", description:"" });
  const emptyStage = { name:"", action_type:"email", delay_hours:0, message_subject:"", message_body:"", whatsapp_template:"", whatsapp_language:"en_US", whatsapp_params:"" };
  const [stageForm, setStageForm] = useState(emptyStage);
  const [saving, setSaving] = useState(false);

  const { data: funnels = [], isLoading } = useQuery({ queryKey:["funnels", user?.email], queryFn:()=>base44.entities.Funnel.filter(mine(user),"-created_date",50), enabled:!!user?.email });
  const { data: stages = [] } = useQuery({
    queryKey:["funnel_stages", selected?.id, user?.email],
    queryFn:()=>base44.entities.FunnelStage.filter(mine(user, { funnel_id: selected?.id }),"stage_order",20),
    enabled:!!selected?.id && !!user?.email,
  });
  const { data: leads = [] } = useQuery({ queryKey:["leads_count", user?.email], queryFn:()=>base44.entities.LeadCapture.filter(mine(user),null,200), enabled:!!user?.email });

  const saveFunnel = async () => {
    if (!funnelForm.name) return;
    setSaving(true);
    const f = await base44.entities.Funnel.create({ ...funnelForm, status:"active", total_leads:0, converted_leads:0, conversion_rate:0 });
    qc.invalidateQueries(["funnels"]);
    setSelected(f); setFunnelForm({ name:"", description:"" }); setShowNewFunnel(false);
    setSaving(false);
  };

  const saveStage = async () => {
    if (!stageForm.name || !selected) return;
    setSaving(true);
    await base44.entities.FunnelStage.create({ ...stageForm, funnel_id:selected.id, stage_order:stages.length+1, entry_count:0, exit_count:0 });
    qc.invalidateQueries(["funnel_stages"]);
    setStageForm(emptyStage); setShowNewStage(false);
    setSaving(false);
  };

  const deleteFunnel = async (id) => {
    if (!confirm("Delete this funnel?")) return;
    await base44.entities.Funnel.delete(id);
    qc.invalidateQueries(["funnels"]);
    if (selected?.id === id) setSelected(null);
  };

  const funnelLeads = (id) => leads.filter(l=>l.funnel_id===id).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><GitBranch className="w-6 h-6 text-fuchsia-400"/>Funnel Builder</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Build visual funnels with automated actions per stage</p>
        </div>
        <button onClick={()=>setShowNewFunnel(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
          <Plus className="w-4 h-4"/>New Funnel
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Your Funnels ({funnels.length})</h3>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
          : funnels.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
              <GitBranch className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2"/>
              <p className="text-muted-foreground text-sm">No funnels yet</p>
              <button onClick={()=>setShowNewFunnel(true)} className="mt-3 text-xs text-fuchsia-400 hover:underline">Create your first →</button>
            </div>
          ) : funnels.map(f=>(
            <div key={f.id} onClick={()=>setSelected(f)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${selected?.id===f.id?"border-fuchsia-500/50 bg-fuchsia-500/8":"border-border bg-card hover:bg-muted/20"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{f.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{funnelLeads(f.id)} leads</p>
                </div>
                <button onClick={e=>{e.stopPropagation();deleteFunnel(f.id);}} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
              {f.conversion_rate > 0 && <div className="mt-2 text-xs text-emerald-400">{f.conversion_rate}% conversion</div>}
            </div>
          ))}
        </div>

        <div className="md:col-span-2">
          {!selected ? (
            <div className="bg-card border border-dashed border-border rounded-2xl flex flex-col items-center justify-center py-24 text-center">
              <GitBranch className="w-12 h-12 text-muted-foreground/20 mb-3"/>
              <p className="text-foreground font-medium">Select a funnel to view stages</p>
              <p className="text-muted-foreground text-sm mt-1">Or create a new funnel to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">{selected.name}</h3>
                  <p className="text-xs text-muted-foreground">{stages.length} stages · {funnelLeads(selected.id)} leads</p>
                </div>
                <button onClick={()=>setShowNewStage(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 text-xs font-semibold hover:bg-fuchsia-500/20">
                  <Plus className="w-3.5 h-3.5"/>Add Stage
                </button>
              </div>
              {stages.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                  <p className="text-muted-foreground text-sm">No stages yet — add your first stage</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stages.map((s,i)=>(
                    <div key={s.id}>
                      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-fuchsia-500/10 border-2 border-fuchsia-500/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-black text-fuchsia-400">{i+1}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">{s.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[s.action_type]||"bg-muted text-muted-foreground"}`}>Action: {s.action_type}</span>
                            <span className="text-xs text-muted-foreground">{s.entry_count||0} entries</span>
                            {s.delay_hours>0 && <span className="text-xs text-muted-foreground">· after {s.delay_hours}h</span>}
                          </div>
                        </div>
                      </div>
                      {i < stages.length-1 && <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-muted-foreground/40"/></div>}
                    </div>
                  ))}
                  <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-muted-foreground/40"/></div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 border-dashed rounded-2xl p-4 text-center">
                    <p className="text-sm text-emerald-400 font-medium">🏆 Converted</p>
                    <p className="text-xs text-muted-foreground">{selected.converted_leads||0} leads converted</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showNewFunnel && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold text-foreground">New Funnel</h3><button onClick={()=>setShowNewFunnel(false)}><X className="w-5 h-5 text-muted-foreground"/></button></div>
            <div className="space-y-3">
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Funnel Name *</label>
              <input value={funnelForm.name} onChange={e=>setFunnelForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Lead Nurture Q2" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea value={funnelForm.description} onChange={e=>setFunnelForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="What's this funnel for?" className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none resize-none"/></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowNewFunnel(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={saveFunnel} disabled={saving||!funnelForm.name} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:"Create Funnel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewStage && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold text-foreground">Add Stage</h3><button onClick={()=>setShowNewStage(false)}><X className="w-5 h-5 text-muted-foreground"/></button></div>
            <div className="space-y-3">
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Stage Name *</label>
              <input value={stageForm.name} onChange={e=>setStageForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Initial Contact" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Automated Action</label>
              <select value={stageForm.action_type} onChange={e=>setStageForm(p=>({...p,action_type:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
                <option value="email">Send Email</option><option value="sms">Send SMS</option>
                <option value="whatsapp">Send WhatsApp</option><option value="wait">Wait</option>
                <option value="tag">Add Tag</option><option value="move_stage">Move Stage</option>
              </select></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Send after (hours)</label>
              <input type="number" min={0} value={stageForm.delay_hours} onChange={e=>setStageForm(p=>({...p,delay_hours:Math.max(0,+e.target.value||0)}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
              <p className="text-[11px] text-muted-foreground">Delay after the lead reaches this stage. 0 = at the next check (every 15 minutes).</p></div>
              {stageForm.action_type==="email" && <>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Email subject</label>
                <input value={stageForm.message_subject} onChange={e=>setStageForm(p=>({...p,message_subject:e.target.value}))} placeholder="Welcome, {{name}}!" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Email message</label>
                <textarea value={stageForm.message_body} onChange={e=>setStageForm(p=>({...p,message_body:e.target.value}))} rows={4} placeholder="Hi {{name}}, thanks for your interest…" className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none resize-none"/>
                <p className="text-[11px] text-muted-foreground">You can use {"{{name}}"}, {"{{email}}"} and {"{{phone}}"}.</p></div>
              </>}
              {stageForm.action_type==="whatsapp" && <>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Approved WhatsApp template name</label>
                <input value={stageForm.whatsapp_template} onChange={e=>setStageForm(p=>({...p,whatsapp_template:e.target.value}))} placeholder="welcome_message" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
                <p className="text-[11px] text-muted-foreground">WhatsApp only lets businesses start a chat with an approved template.</p></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Language</label>
                  <input value={stageForm.whatsapp_language} onChange={e=>setStageForm(p=>({...p,whatsapp_language:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none"/></div>
                  <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Variables (use |)</label>
                  <input value={stageForm.whatsapp_params} onChange={e=>setStageForm(p=>({...p,whatsapp_params:e.target.value}))} placeholder="{{name}}" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none"/></div>
                </div>
              </>}
              {stageForm.action_type==="sms" && <p className="text-[11px] text-amber-400">SMS sending is not connected yet, so this stage is skipped.</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowNewStage(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={saveStage} disabled={saving||!stageForm.name} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:"Add Stage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}