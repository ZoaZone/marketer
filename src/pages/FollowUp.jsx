import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { MailCheck, Plus, Play, Pause, ChevronDown, ChevronUp, Clock, Loader2, X, Zap } from "lucide-react";

const CHANNEL_COLORS={email:"bg-blue-500/10 text-blue-400",sms:"bg-emerald-500/10 text-emerald-400",whatsapp:"bg-amber-500/10 text-amber-400"};
const TRIGGER_LABELS={new_lead:"New Lead",form_submit:"Form Submit",link_click:"Link Click",no_reply:"No Reply",stage_change:"Stage Change",manual:"Manual"};

export default function FollowUp() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [expandedSeq, setExpandedSeq] = useState(null);
  const [showNewSeq, setShowNewSeq] = useState(false);
  const [showNewStep, setShowNewStep] = useState(null);
  const [seqForm, setSeqForm] = useState({name:"",trigger:"new_lead"});
  const [stepForm, setStepForm] = useState({delay_hours:24,channel:"email",message_template:""});
  const [saving, setSaving] = useState(false);

  const {data:sequences=[],isLoading}=useQuery({queryKey:["sequences", user?.email],queryFn:()=>base44.entities.FollowUpSequence.filter(mine(user),"-created_date",50),enabled:!!user?.email});
  const {data:steps=[]}=useQuery({
    queryKey:["steps",expandedSeq, user?.email],
    queryFn:()=>base44.entities.FollowUpStep.filter(mine(user, {sequence_id:expandedSeq}),"step_order",20),
    enabled:!!expandedSeq && !!user?.email,
  });

  const saveSeq=async()=>{
    if(!seqForm.name)return;
    setSaving(true);
    await base44.entities.FollowUpSequence.create({...seqForm,status:"active",contact_count:0});
    qc.invalidateQueries(["sequences"]);
    setSeqForm({name:"",trigger:"new_lead"});setShowNewSeq(false);setSaving(false);
  };

  const saveStep=async(seqId)=>{
    if(!stepForm.message_template)return;
    setSaving(true);
    await base44.entities.FollowUpStep.create({...stepForm,sequence_id:seqId,step_order:steps.length+1,status:"pending"});
    qc.invalidateQueries(["steps"]);
    setStepForm({delay_hours:24,channel:"email",message_template:""});setShowNewStep(null);setSaving(false);
  };

  const toggleStatus=async(id,status)=>{
    await base44.entities.FollowUpSequence.update(id,{status:status==="active"?"paused":"active"});
    qc.invalidateQueries(["sequences"]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><MailCheck className="w-6 h-6 text-fuchsia-400"/>Follow-Up Sequences</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Automated multi-step follow-up flows triggered by lead behavior</p>
        </div>
        <button onClick={()=>setShowNewSeq(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
          <Plus className="w-4 h-4"/>New Sequence
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
      : sequences.length===0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl flex flex-col items-center py-16 text-center">
          <MailCheck className="w-10 h-10 text-muted-foreground/20 mb-3"/>
          <p className="text-foreground font-medium">No sequences yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Create automated follow-ups triggered by lead actions</p>
          <button onClick={()=>setShowNewSeq(true)} className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold">Create Sequence</button>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map(seq=>{
            const isExpanded = expandedSeq===seq.id;
            return(
              <div key={seq.id} className={`bg-card border rounded-2xl overflow-hidden ${isExpanded?"border-fuchsia-500/30":"border-border"}`}>
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/20" onClick={()=>setExpandedSeq(isExpanded?null:seq.id)}>
                  <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 flex items-center justify-center flex-shrink-0"><Zap className="w-4 h-4 text-fuchsia-400"/></div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{seq.name}</p>
                    <p className="text-xs text-muted-foreground">Trigger: {TRIGGER_LABELS[seq.trigger]||seq.trigger} · {seq.contact_count||0} contacts</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${seq.status==="active"?"bg-emerald-500/10 text-emerald-400":"bg-muted text-muted-foreground"}`}>{seq.status}</span>
                    <button onClick={e=>{e.stopPropagation();toggleStatus(seq.id,seq.status);}} className={`p-1.5 rounded-lg transition-colors ${seq.status==="active"?"bg-amber-500/10 text-amber-400 hover:bg-amber-500/20":"bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}>
                      {seq.status==="active"?<Pause className="w-3.5 h-3.5"/>:<Play className="w-3.5 h-3.5"/>}
                    </button>
                    {isExpanded?<ChevronUp className="w-4 h-4 text-muted-foreground"/>:<ChevronDown className="w-4 h-4 text-muted-foreground"/>}
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4 bg-muted/5 space-y-2">
                    {steps.length===0&&<p className="text-xs text-muted-foreground py-2">No steps yet</p>}
                    {steps.map((step,i)=>(
                      <div key={step.id} className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-6 h-6 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-black text-fuchsia-400">{i+1}</span>
                          </div>
                          {i<steps.length-1&&<div className="w-px h-4 bg-border"/>}
                        </div>
                        <div className="flex-1 bg-card border border-border rounded-xl p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[step.channel]||"bg-muted text-muted-foreground"}`}>{step.channel}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>Wait {step.delay_hours}h</span>
                          </div>
                          <p className="text-xs text-foreground">{step.message_template}</p>
                        </div>
                      </div>
                    ))}
                    {showNewStep===seq.id ? (
                      <div className="bg-card border border-fuchsia-500/20 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Wait (hours)</label>
                          <input type="number" value={stepForm.delay_hours} onChange={e=>setStepForm(p=>({...p,delay_hours:+e.target.value}))} className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm focus:outline-none"/></div>
                          <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Channel</label>
                          <select value={stepForm.channel} onChange={e=>setStepForm(p=>({...p,channel:e.target.value}))} className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
                            <option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option>
                          </select></div>
                        </div>
                        <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Message *</label>
                        <textarea value={stepForm.message_template} onChange={e=>setStepForm(p=>({...p,message_template:e.target.value}))} rows={2} placeholder="Hi {{name}}, just following up…" className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs focus:outline-none resize-none"/></div>
                        <div className="flex gap-2">
                          <button onClick={()=>setShowNewStep(null)} className="px-3 py-1.5 border border-border rounded-lg text-xs">Cancel</button>
                          <button onClick={()=>saveStep(seq.id)} disabled={saving||!stepForm.message_template} className="px-3 py-1.5 bg-fuchsia-500/15 text-fuchsia-400 rounded-lg text-xs font-medium hover:bg-fuchsia-500/25 disabled:opacity-60 flex items-center gap-1">
                            {saving?<Loader2 className="w-3 h-3 animate-spin"/>:"Add Step"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={()=>setShowNewStep(seq.id)} className="flex items-center gap-2 text-xs text-fuchsia-400 hover:text-fuchsia-300 mt-1">
                        <Plus className="w-3.5 h-3.5"/>Add Step
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNewSeq && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold text-foreground">New Sequence</h3><button onClick={()=>setShowNewSeq(false)}><X className="w-5 h-5 text-muted-foreground"/></button></div>
            <div className="space-y-3">
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Name *</label>
              <input value={seqForm.name} onChange={e=>setSeqForm(p=>({...p,name:e.target.value}))} placeholder="e.g. New Lead Welcome" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Trigger</label>
              <select value={seqForm.trigger} onChange={e=>setSeqForm(p=>({...p,trigger:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
                {Object.entries(TRIGGER_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowNewSeq(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={saveSeq} disabled={saving||!seqForm.name} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:"Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
