import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, Zap, Sparkles, Loader2, ArrowRight, Tag, TrendingUp, Building2 } from "lucide-react";

export default function WebsiteScanner() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [generated, setGenerated] = useState({});

  const {data:scans=[],isLoading}=useQuery({queryKey:["scans"],queryFn:()=>base44.entities.WebsiteScan.list("-created_date",20)});

  const scan = async () => {
    if (!url) return;
    const cleanUrl = url.startsWith("http") ? url : "https://"+url;
    setScanning(true);
    try {
      let result;
      try { const res = await base44.functions.invoke("scanWebsite",{url:cleanUrl}); result = res?.data||res; }
      catch(e) { result = await base44.entities.WebsiteScan.create({website_url:cleanUrl,scan_status:"pending",pages_scanned:0,scan_at:new Date().toISOString()}); }
      qc.invalidateQueries(["scans"]);
      setActiveId(result?.id);
      setUrl("");
    } catch(e) { alert("Scan error: "+e.message); }
    setScanning(false);
  };

  const generateFromScan = async (scan, type) => {
    setGenerating(type);
    try {
      const prompt = `Business: ${scan.business_summary||""}. Services: ${(scan.services_found||[]).join(", ")}. Keywords: ${(scan.keywords_found||[]).join(", ")}.`;
      const res = await base44.functions.invoke("generateMediaContent",{type,prompt,platform:"General",tone:scan.tone||"Professional"});
      const content = res?.data?.text||res?.text||"Generated content.";
      await base44.entities.ContentAsset.create({type,title:`${type} from ${scan.website_url}`,content,ai_generated:true,prompt_used:prompt});
      setGenerated(p=>({...p,[type]:content}));
      qc.invalidateQueries(["media_library"]);
    } catch(e) { setGenerated(p=>({...p,[type]:"Error: "+e.message})); }
    setGenerating(null);
  };

  const activeScan = scans.find(s=>s.id===activeId)||scans[0];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2"><Globe className="w-6 h-6 text-fuchsia-400"/>Website Scanner</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Scan any website to auto-generate captions, ad copy, scripts and more</p>
      </div>

      <div className="bg-card border border-fuchsia-500/20 rounded-2xl p-6">
        <h3 className="font-semibold text-foreground mb-3">Scan a Website</h3>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
            <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&scan()} placeholder="aevoice.ai or https://client-site.com" className="w-full h-10 pl-9 pr-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"/>
          </div>
          <button onClick={scan} disabled={scanning||!url} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 shadow-lg">
            {scanning?<><Loader2 className="w-4 h-4 animate-spin"/>Scanning…</>:<><Zap className="w-4 h-4"/>Scan</>}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">AI extracts: business summary · services · keywords · tone · competitors</p>
      </div>

      {scans.length > 0 && (
        <div className="grid md:grid-cols-3 gap-5">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Recent Scans</h3>
            {scans.map(s=>(
              <div key={s.id} onClick={()=>setActiveId(s.id)}
                className={`p-3 rounded-xl border cursor-pointer transition-all text-sm ${activeScan?.id===s.id?"border-fuchsia-500/50 bg-fuchsia-500/8":"border-border bg-card hover:bg-muted/20"}`}>
                <p className="font-medium text-foreground truncate">{s.website_url?.replace(/https?:\/\//,"")}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.scan_status==="completed"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-400"}`}>{s.scan_status}</span>
              </div>
            ))}
          </div>

          <div className="md:col-span-2 space-y-4">
            {activeScan && (
              <>
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">{activeScan.website_url?.replace(/https?:\/\//,"")}</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${activeScan.scan_status==="completed"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-400"}`}>{activeScan.scan_status}</span>
                  </div>
                  {activeScan.business_summary&&<p className="text-sm text-foreground leading-relaxed">{activeScan.business_summary}</p>}
                  <div className="grid grid-cols-2 gap-4">
                    {activeScan.services_found?.length>0&&<div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Services</p><div className="flex flex-wrap gap-1">{activeScan.services_found.map(s=><span key={s} className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">{s}</span>)}</div></div>}
                    {activeScan.keywords_found?.length>0&&<div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Keywords</p><div className="flex flex-wrap gap-1">{activeScan.keywords_found.slice(0,6).map(k=><span key={k} className="text-xs px-2 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 rounded-full">{k}</span>)}</div></div>}
                  </div>
                </div>

                {activeScan.scan_status==="completed"&&(
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-fuchsia-400"/>Generate Content from Scan</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[{type:"caption",label:"Social Caption"},{type:"ad_copy",label:"Ad Copy"},{type:"hashtag_set",label:"Hashtag Set"},{type:"email_template",label:"Email Template"}].map(g=>(
                        <button key={g.type} onClick={()=>generateFromScan(activeScan,g.type)} disabled={!!generating}
                          className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 transition-all text-sm font-medium text-foreground disabled:opacity-60">
                          {g.label}
                          {generating===g.type?<Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400"/>:<ArrowRight className="w-3.5 h-3.5 text-muted-foreground"/>}
                        </button>
                      ))}
                    </div>
                    {Object.entries(generated).map(([type,content])=>(
                      <div key={type} className="mt-3 p-3 bg-muted/20 rounded-xl border border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{type.replace("_"," ")}</p>
                        <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{content}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
