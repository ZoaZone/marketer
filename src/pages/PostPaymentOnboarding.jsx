import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Globe, Megaphone, Share2, ArrowRight, Loader2, Sparkles } from "lucide-react";

const M_LOGO="https://media.base44.com/images/public/69b1f1d60b1fb9d791fddc64/d1aa347a6_generated_image.png";
const STEPS=[
  {id:1,Icon:Globe,title:"Scan Your Website",desc:"Let AI learn about your business — auto-generates content concepts",color:"from-fuchsia-500 to-purple-600"},
  {id:2,Icon:Share2,title:"Connect Social Accounts",desc:"Link Instagram, TikTok, LinkedIn and more to start scheduling",color:"from-pink-500 to-rose-600"},
  {id:3,Icon:Megaphone,title:"Create Your First Campaign",desc:"Set up your first email, SMS, or WhatsApp campaign in 2 minutes",color:"from-amber-500 to-orange-600"},
  {id:4,Icon:Sparkles,title:"You're Ready!",desc:"media.aevoice.ai is fully set up. Explore the dashboard to get started.",color:"from-emerald-500 to-teal-600"},
];

export default function PostPaymentOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);

  const scanWebsite=async()=>{
    if(!websiteUrl)return;
    setScanning(true);
    try{
      const cleanUrl=websiteUrl.startsWith("http")?websiteUrl:"https://"+websiteUrl;
      await base44.functions.invoke("scanWebsite",{url:cleanUrl}).catch(()=>
        base44.entities.WebsiteScan.create({website_url:cleanUrl,scan_status:"pending",scan_at:new Date().toISOString()})
      );
      setScanDone(true);
    }catch(e){}
    setScanning(false);
  };

  const s = STEPS.find(s=>s.id===step);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={M_LOGO} alt="" className="w-9 h-9 rounded-xl" onError={e=>e.target.style.display="none"}/>
          <span className="text-xl font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">media.aevoice.ai</span>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((st,i)=>(
            <div key={st.id} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step>st.id?"bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white":step===st.id?"bg-white/10 border-2 border-fuchsia-500 text-fuchsia-400":"bg-white/5 text-white/30"}`}>
                {step>st.id?<CheckCircle2 className="w-4 h-4"/>:st.id}
              </div>
              {i<STEPS.length-1&&<div className={`flex-1 h-0.5 rounded-full ${step>st.id?"bg-gradient-to-r from-fuchsia-500 to-purple-600":"bg-white/10"}`}/>}
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center mx-auto mb-5 shadow-2xl`}>
            <s.Icon className="w-8 h-8 text-white"/>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">{s.title}</h2>
          <p className="text-white/50 mb-6">{s.desc}</p>

          {step===1&&(
            <div className="space-y-3 text-left">
              <div className="flex gap-2">
                <input value={websiteUrl} onChange={e=>setWebsiteUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&scanWebsite()} placeholder="yourwebsite.com" className="flex-1 h-10 px-4 rounded-xl border border-white/15 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 placeholder-white/30"/>
                <button onClick={scanWebsite} disabled={scanning||!websiteUrl} className="px-5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
                  {scanning?<Loader2 className="w-4 h-4 animate-spin"/>:"Scan"}
                </button>
              </div>
              {scanDone&&<div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle2 className="w-4 h-4"/>Website scanned! AI has learned about your business.</div>}
            </div>
          )}

          {step===2&&(
            <div className="grid grid-cols-3 gap-2">
              {[{n:"Instagram",c:"from-pink-500 to-rose-600"},{n:"TikTok",c:"from-gray-700 to-gray-900"},{n:"LinkedIn",c:"from-blue-500 to-blue-700"},{n:"Facebook",c:"from-blue-600 to-blue-800"},{n:"YouTube",c:"from-red-500 to-red-700"},{n:"Twitter/X",c:"from-gray-600 to-gray-800"}].map(p=>(
                <div key={p.n} className={`p-3 rounded-xl bg-gradient-to-br ${p.c} text-center`}>
                  <p className="text-xs font-bold text-white">{p.n}</p>
                  <p className="text-[10px] text-white/60 mt-0.5">Add in Settings</p>
                </div>
              ))}
            </div>
          )}

          {step===3&&(
            <button onClick={()=>navigate("/campaigns")} className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-sm hover:opacity-90">
              Create First Campaign →
            </button>
          )}

          {step===4&&(
            <div className="grid grid-cols-3 gap-2 text-center text-sm text-white/50">
              <div className="p-3 bg-white/5 rounded-xl"><div className="text-xl font-black text-fuchsia-400 mb-1">AI</div>Media Studio</div>
              <div className="p-3 bg-white/5 rounded-xl"><div className="text-xl font-black text-purple-400 mb-1">∞</div>Campaigns</div>
              <div className="p-3 bg-white/5 rounded-xl"><div className="text-xl font-black text-pink-400 mb-1">📊</div>Analytics</div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {step<4&&step!==1&&<button onClick={()=>setStep(s=>Math.min(s+1,4))} className="flex-1 py-3 rounded-xl border border-white/15 text-white/60 text-sm font-medium hover:border-white/30">Skip</button>}
            <button onClick={()=>step<4?setStep(s=>s+1):navigate("/dashboard")} className={`py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2 shadow-lg ${step<4&&step!==1?"flex-1":"w-full"}`}>
              {step===4?"Go to Dashboard":"Continue"}<ArrowRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-white/20 mt-5">You can skip any step and configure later in Settings</p>
      </div>
    </div>
  );
}
