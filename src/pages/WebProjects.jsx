import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { Globe, Plus, Loader2, X, ExternalLink, Monitor, Smartphone } from "lucide-react";

const STATUS_STEPS=["brief","design","development","review","launched"];
const STATUS_COLORS={brief:"bg-muted text-muted-foreground",design:"bg-blue-500/10 text-blue-400",development:"bg-amber-500/10 text-amber-400",review:"bg-purple-500/10 text-purple-400",launched:"bg-emerald-500/10 text-emerald-400"};

export default function WebProjects() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [projectType, setProjectType] = useState("website");
  const [form, setForm] = useState({project_name:"",domain:"",brief:"",style_direction:"",tech_stack:"",pages_list:""});
  const [saving, setSaving] = useState(false);

  const {data:projects=[],isLoading}=useQuery({queryKey:["web_projects", user?.email],queryFn:()=>base44.entities.WebsiteProject.filter(mine(user),"-created_date",50),enabled:!!user?.email});
  const {data:appProjects=[]}=useQuery({queryKey:["app_projects", user?.email],queryFn:()=>base44.entities.AppProject.filter(mine(user),"-created_date",50),enabled:!!user?.email});

  const allProjects=[...projects.map(p=>({...p,ptype:"website"})),...appProjects.map(p=>({...p,ptype:"app"}))].sort((a,b)=>new Date(b.created_date)-new Date(a.created_date));

  const save=async()=>{
    if(!form.project_name)return;
    setSaving(true);
    try{
      if(projectType==="website") await base44.entities.WebsiteProject.create({...form,status:"brief",pages_list:form.pages_list?form.pages_list.split(",").map(p=>p.trim()):[]});
      else await base44.entities.AppProject.create({project_name:form.project_name,brief:form.brief,tech_stack:form.tech_stack,status:"brief",platform:"web"});
      qc.invalidateQueries(["web_projects"]);qc.invalidateQueries(["app_projects"]);
      setForm({project_name:"",domain:"",brief:"",style_direction:"",tech_stack:"",pages_list:""});setShowNew(false);
    }catch(e){alert(e.message);}
    setSaving(false);
  };

  const advanceStatus=async(p)=>{
    const idx=STATUS_STEPS.indexOf(p.status);
    if(idx<STATUS_STEPS.length-1){
      const next=STATUS_STEPS[idx+1];
      if(p.ptype==="website") await base44.entities.WebsiteProject.update(p.id,{status:next,...(next==="launched"?{launched_at:new Date().toISOString()}:{})});
      else await base44.entities.AppProject.update(p.id,{status:next});
      qc.invalidateQueries(p.ptype==="website"?["web_projects"]:["app_projects"]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><Globe className="w-6 h-6 text-fuchsia-400"/>Web & App Projects</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage website and mobile app builds from brief to launch</p>
        </div>
        <button onClick={()=>setShowNew(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
          <Plus className="w-4 h-4"/>New Project
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{l:"Total",v:allProjects.length},{l:"In Progress",v:allProjects.filter(p=>!["launched","brief"].includes(p.status)).length},{l:"Launched",v:allProjects.filter(p=>p.status==="launched").length},{l:"In Review",v:allProjects.filter(p=>p.status==="review").length}].map(s=>(
          <div key={s.l} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl font-black text-foreground">{s.v}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      {isLoading?<div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
      :allProjects.length===0?(
        <div className="bg-card border border-dashed border-border rounded-2xl flex flex-col items-center py-16 text-center">
          <Globe className="w-10 h-10 text-muted-foreground/20 mb-3"/>
          <p className="text-foreground font-medium">No projects yet</p>
          <button onClick={()=>setShowNew(true)} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold">Create First Project</button>
        </div>
      ):(
        <div className="space-y-4">
          {allProjects.map(p=>{
            const si=STATUS_STEPS.indexOf(p.status);
            return(
              <div key={p.id} className="bg-card border border-border rounded-2xl p-5 hover:border-fuchsia-500/20 transition-all">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${p.ptype==="app"?"bg-purple-500/10":"bg-blue-500/10"}`}>
                      {p.ptype==="app"?<Smartphone className="w-4 h-4 text-purple-400"/>:<Monitor className="w-4 h-4 text-blue-400"/>}
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{p.project_name}</p>
                      <p className="text-xs text-muted-foreground">{p.domain||p.platform||p.ptype} · {p.tech_stack||"—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                    {p.status!=="launched"&&<button onClick={()=>advanceStatus(p)} className="px-3 py-1.5 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 text-xs font-medium hover:bg-fuchsia-500/20">→ {STATUS_STEPS[si+1]}</button>}
                    {p.status==="launched"&&p.domain&&<a href={`https://${p.domain}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><ExternalLink className="w-3.5 h-3.5"/></a>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 mb-1">
                  {STATUS_STEPS.map((step,i)=><div key={step} className={`h-1.5 flex-1 ${i===0?"rounded-l-full":""} ${i===STATUS_STEPS.length-1?"rounded-r-full":""} ${i<=si?"bg-gradient-to-r from-fuchsia-500 to-purple-600":"bg-muted"}`}/>)}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/50 mb-2">
                  {STATUS_STEPS.map(s=><span key={s} className="capitalize">{s}</span>)}
                </div>
                {p.brief&&<p className="text-xs text-muted-foreground line-clamp-2">{p.brief}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showNew&&(
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold text-foreground text-lg">New Project</h3><button onClick={()=>setShowNew(false)}><X className="w-5 h-5 text-muted-foreground"/></button></div>
            <div className="flex gap-2 mb-4">
              {[{v:"website",l:"Website",Icon:Monitor},{v:"app",l:"Mobile App",Icon:Smartphone}].map(t=>(
                <button key={t.v} onClick={()=>setProjectType(t.v)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${projectType===t.v?"bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30":"border border-border text-muted-foreground"}`}>
                  <t.Icon className="w-4 h-4"/>{t.l}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {[{k:"project_name",l:"Project Name *",ph:"Client Redesign"},{k:"domain",l:"Domain",ph:"client.com",show:projectType==="website"},{k:"tech_stack",l:"Tech Stack",ph:"React, Tailwind"},{k:"style_direction",l:"Style Direction",ph:"Modern, dark",show:projectType==="website"},{k:"pages_list",l:"Pages (comma separated)",ph:"Home, About, Services, Contact",show:projectType==="website"}].filter(f=>f.show!==false).map(f=>(
                <div key={f.k} className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{f.l}</label>
                <input value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
              ))}
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Brief</label>
              <textarea value={form.brief} onChange={e=>setForm(p=>({...p,brief:e.target.value}))} rows={3} placeholder="Describe what needs to be built…" className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none resize-none"/></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowNew(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={save} disabled={saving||!form.project_name} className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:"Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
