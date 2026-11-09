import { Building2, Calendar } from "lucide-react";

const lbl = "block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-2";
const inp = "w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-fuchsia-500/70 transition-all";

export default function BrandStep({ campaign, setCampaign, brands, navigate }) {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className={lbl}>Campaign Details</label>
          <input value={campaign.campaign_name} onChange={e => setCampaign(p => ({ ...p, campaign_name: e.target.value }))} placeholder="Campaign Name (e.g. Q3 Product Launch)" className={inp} />
        </div>
        <div>
          <label className={lbl}><Calendar className="w-3.5 h-3.5" /> Launch Date (optional)</label>
          <input type="date" value={campaign.launch_date || ""} onChange={e => setCampaign(p => ({ ...p, launch_date: e.target.value }))} className={inp} />
        </div>
      </div>
      <div>
        <label className={lbl}>Select Brand Identity</label>
        {brands.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
            <Building2 className="w-10 h-10 mx-auto text-neutral-600 mb-3" />
            <p className="text-neutral-300 font-bold">No brands yet</p>
            <button onClick={() => navigate("/brands")} className="mt-3 text-fuchsia-400 text-sm hover:underline">Create a brand →</button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {brands.map(b => (
              <button key={b.id} onClick={() => setCampaign(p => ({ ...p, brand_id: b.id }))}
                className={`p-6 rounded-2xl border text-left transition-all ${campaign.brand_id === b.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-neutral-800 bg-neutral-900"}`}>
                <p className="font-bold text-lg text-white">{b.name}</p>
                {b.industry && <p className="text-xs text-neutral-500 mt-0.5">{b.industry}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
