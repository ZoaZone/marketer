import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { PenTool, Wand2, Copy, CheckCircle2, Loader2, Download } from "lucide-react";

const PLATFORMS=[{v:"instagram",l:"Instagram",formats:["Story","Reel","Feed Post","Carousel"]},{v:"facebook",l:"Facebook",formats:["News Feed","Story","Video Ad","Carousel"]},{v:"tiktok",l:"TikTok",formats:["Video Ad","TopView"]},{v:"linkedin",l:"LinkedIn",formats:["Sponsored Post","Message Ad","Banner"]},{v:"youtube",l:"YouTube",formats:["Pre-roll","Bumper","Display"]},{v:"google",l:"Google",formats:["Search Ad","Display","Responsive"]}];
const OBJECTIVES=["Brand Awareness","Lead Generation","Sales/Conversion","App Install","Website Traffic","Engagement"];
const TONES=["Professional","Urgent","Exciting","Trustworthy","Casual","Luxury"];

export default function AdCreator() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState("instagram");
  const [form, setForm] = useState({format:"Story",objective:"Lead Generation",tone:"Professional",product:"",audience:"",cta:"Learn More"});
  const [adResult, setAdResult] = useState(null);
  const [imageResult, setImageResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedPlatform = PLATFORMS.find(p=>p.v===platform);

  const generate = async () => {
    if (!form.product) { alert("Describe your product/service"); return; }
    setLoading(true); setAdResult(null);
    try {
      const prompt = `Create a ${form.tone.toLowerCase()} ${form.format} ad for ${selectedPlatform?.l} for: ${form.product}. Target: ${form.audience||"general"}. Objective: ${form.objective}. CTA: ${form.cta}. Format as:\nHEADLINE: ...\nBODY: ...\nCTA: ...\nHASHTAGS: ...`;
      const res = await base44.functions.invoke("generateMediaContent",{type:"ad_copy",platform:selectedPlatform?.l,tone:form.tone,prompt});
      setAdResult(res?.data?.text||res?.text||"Ad copy appears here.");
    } catch(e) { setAdResult("Error: "+e.message); }
    setLoading(false);
  };

  const generateImage = async () => {
    setImgLoading(true); setImageResult(null);
    try {
      const res = await base44.functions.invoke("generateImage",{prompt:`Professional ${form.format} ad for ${selectedPlatform?.l}: ${form.product}. ${form.tone} style.`,platform,dimensions:"1080x1080"});
      setImageResult(res?.data?.url||res?.url);
    } catch(e) { alert("Image error: "+e.message); }
    setImgLoading(false);
  };

  const copy = async () => { await navigator.clipboard.writeText(adResult||""); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const save = async () => {
    if (!adResult) return;
    await base44.entities.AdCreative.create({platform,format:form.format,body_copy:adResult,media_url:imageResult||null,status:"draft",cta:form.cta});
    qc.invalidateQueries(["ad_creatives"]);
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><PenTool className="w-6 h-6 text-fuchsia-400"/>Ad Creator</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Build platform-ready ad creatives with AI-generated copy and visuals</p>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {PLATFORMS.map(p=>(
          <button key={p.v} onClick={()=>{setPlatform(p.v);setForm(prev=>({...prev,format:p.formats[0]}));}}
            className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${platform===p.v?"border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-400":"border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            {p.l}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-foreground">Ad Brief</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Format</label>
            <select value={form.format} onChange={e=>setForm(p=>({...p,format:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
              {selectedPlatform?.formats.map(f=><option key={f}>{f}</option>)}
            </select></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Objective</label>
            <select value={form.objective} onChange={e=>setForm(p=>({...p,objective:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
              {OBJECTIVES.map(o=><option key={o}>{o}</option>)}
            </select></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Tone</label>
            <select value={form.tone} onChange={e=>setForm(p=>({...p,tone:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
              {TONES.map(t=><option key={t}>{t}</option>)}
            </select></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">CTA Button</label>
            <select value={form.cta} onChange={e=>setForm(p=>({...p,cta:e.target.value}))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none">
              {["Learn More","Shop Now","Sign Up","Get Started","Contact Us","Download","Book Now"].map(c=><option key={c}>{c}</option>)}
            </select></div>
            <div className="space-y-1.5 col-span-2"><label className="text-xs font-medium text-muted-foreground">Product/Service *</label>
            <input value={form.product} onChange={e=>setForm(p=>({...p,product:e.target.value}))} placeholder="e.g. AI voice assistant for restaurants" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
            <div className="space-y-1.5 col-span-2"><label className="text-xs font-medium text-muted-foreground">Target Audience</label>
            <input value={form.audience} onChange={e=>setForm(p=>({...p,audience:e.target.value}))} placeholder="e.g. Restaurant owners 30-55, US" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/></div>
          </div>
          <button onClick={generate} disabled={loading||!form.product} className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold text-sm hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg">
            {loading?<><Loader2 className="w-4 h-4 animate-spin"/>Writing…</>:<><Wand2 className="w-4 h-4"/>Generate Ad Copy</>}
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Ad Creative</h3>
            {(adResult||imageResult)&&(
              <div className="flex gap-2">
                {adResult&&<button onClick={copy} className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${copied?"bg-emerald-500/10 text-emerald-400":"bg-muted text-muted-foreground hover:text-foreground"}`}>{copied?"Copied!":"Copy"}</button>}
                <button onClick={save} className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${saved?"bg-emerald-500/10 text-emerald-400":"bg-fuchsia-500/10 text-fuchsia-400"}`}>{saved?"Saved!":"Save"}</button>
              </div>
            )}
          </div>
          {!adResult&&!loading&&<div className="flex flex-col items-center justify-center h-32 text-center"><PenTool className="w-8 h-8 text-muted-foreground/20 mb-2"/><p className="text-muted-foreground text-sm">Ad copy appears here</p></div>}
          {loading&&<div className="flex flex-col items-center justify-center h-32"><Loader2 className="w-7 h-7 animate-spin text-fuchsia-400 mb-2"/><p className="text-muted-foreground text-sm">Generating…</p></div>}
          {adResult&&<div className="bg-muted/20 rounded-xl p-4"><pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{adResult}</pre></div>}
          <div className="border-t border-border pt-4">
            <button onClick={generateImage} disabled={imgLoading} className="w-full py-2.5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-400 text-sm font-medium hover:bg-fuchsia-500/10 disabled:opacity-60 flex items-center justify-center gap-2">
              {imgLoading?<><Loader2 className="w-4 h-4 animate-spin"/>Generating image…</>:<><Wand2 className="w-4 h-4"/>Generate Ad Visual</>}
            </button>
            {imageResult&&(
              <div className="mt-3 space-y-2">
                <img src={imageResult} alt="Ad visual" className="w-full rounded-xl object-cover"/>
                <a href={imageResult} download className="flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-xs font-medium"><Download className="w-3.5 h-3.5"/>Download</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
