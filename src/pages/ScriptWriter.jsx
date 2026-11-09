import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, Wand2, Copy, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";

const TYPES=[{v:"video_script",l:"Video Script"},{v:"ad_script",l:"Ad Script"},{v:"email_sequence",l:"Email Sequence"},{v:"cold_outreach",l:"Cold Outreach"},{v:"follow_up",l:"Follow-Up"},{v:"pitch",l:"Sales Pitch"}];
const PLATFORMS=["General","Instagram","TikTok","YouTube","LinkedIn","Facebook","Email","SMS"];
const TONES=["Professional","Casual","Exciting","Urgent","Friendly","Luxury","Humorous"];
const DURATIONS=[{v:30,l:"30s"},{v:60,l:"1 min"},{v:120,l:"2 min"},{v:300,l:"5 min"},{v:600,l:"10 min"}];

export default function ScriptWriter() {
  const qc = useQueryClient();
  const [form, setForm] = useState({type:"video_script",platform:"General",tone:"Professional",duration_seconds:60,prompt:""});
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const {data:templates=[]}=useQuery({queryKey:["script_templates"],queryFn:()=>base44.entities.ScriptTemplate.list("-created_date",20)});

  const generate = async () => {
    if (!form.prompt) { alert("Enter a topic or brief"); return; }
    setLoading(true); setOutput("");
    try {
      const res = await base44.functions.invoke("generateMediaContent",{
        type:form.type, platform:form.platform, tone:form.tone,
        prompt:`Write a ${form.tone.toLowerCase()} ${form.type.replace("_"," ")} for ${form.platform} about: ${form.prompt}. Duration: ${form.duration_seconds}s. Include hook, body, CTA.`,
      });
      setOutput(res?.data?.text||res?.text||"Generated script appears here.");
    } catch(e) { setOutput("Error: "+e.message); }
    setLoading(false);
  };

  const copy = async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const save = async () => {
    if (!output) return;
    await base44.entities.ScriptTemplate.create({type:form.type,platform:form.platform,tone:form.tone,title:form.prompt.slice(0,60),content:output,duration_seconds:form.duration_seconds,ai_generated:true});
    qc.invalidateQueries(["script_templates"]);
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-fuchsia-400"/>Script Writer</h1>
        <p className="text-muted-foreground text-sm mt-0.5">AI-generated video scripts, ad scripts, email sequences and pitch scripts</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Configure Script</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><label className="text-xs font-medium text-muted-foreground">Script Type</label>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Platform</label>
            <select value={form.platform} onChange={e=>setForm(p=>({...p,platform:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
              {PLATFORMS.map(p=><option key={p}>{p}</option>)}
            </select></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Tone</label>
            <select value={form.tone} onChange={e=>setForm(p=>({...p,tone:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
              {TONES.map(t=><option key={t}>{t}</option>)}
            </select></div>
            <div className="space-y-1.5 col-span-2"><label className="text-xs font-medium text-muted-foreground">Duration</label>
            <div className="flex gap-2">{DURATIONS.map(d=><button key={d.v} onClick={()=>setForm(p=>({...p,duration_seconds:d.v}))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${form.duration_seconds===d.v?"bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30":"bg-muted text-muted-foreground hover:text-foreground"}`}>{d.l}</button>)}</div></div>
            <div className="space-y-1.5 col-span-2"><label className="text-xs font-medium text-muted-foreground">Topic / Brief *</label>
            <textarea value={form.prompt} onChange={e=>setForm(p=>({...p,prompt:e.target.value}))} rows={3} placeholder="e.g. AI voice assistant for real estate agents — highlight time savings" className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"/></div>
          </div>
          <button onClick={generate} disabled={loading||!form.prompt} className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg">
            {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Writing…</>:<><Wand2 className="w-4 h-4"/>Generate Script</>}
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Output</h3>
            {output&&(
              <div className="flex gap-2">
                <button onClick={generate} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5"/></button>
                <button onClick={copy} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${copied?"bg-emerald-500/10 text-emerald-400":"bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {copied?<><CheckCircle2 className="w-3.5 h-3.5"/>Copied!</>:"Copy"}
                </button>
                <button onClick={save} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${saved?"bg-emerald-500/10 text-emerald-400":"bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20"}`}>
                  {saved?<><CheckCircle2 className="w-3.5 h-3.5"/>Saved!</>:"Save"}
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-64">
            {!output&&!loading&&<div className="flex flex-col items-center justify-center h-48 text-center"><FileText className="w-10 h-10 text-muted-foreground/20 mb-3"/><p className="text-muted-foreground text-sm">Your script will appear here</p></div>}
            {loading&&<div className="flex flex-col items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-fuchsia-400 mb-3"/><p className="text-muted-foreground text-sm">Writing your script…</p></div>}
            {output&&<div className="bg-muted/20 rounded-xl p-4 max-h-80 overflow-y-auto"><pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{output}</pre></div>}
          </div>
        </div>
      </div>

      {templates.length>0&&(
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-foreground">Saved Scripts ({templates.length})</h3></div>
          <div className="divide-y divide-border">
            {templates.slice(0,10).map(t=>(
              <div key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 cursor-pointer" onClick={()=>setOutput(t.content)}>
                <div><p className="text-sm font-medium text-foreground">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.type?.replace("_"," ")} · {t.platform} · {t.tone}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
