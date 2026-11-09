import { Share2, CheckCircle2 } from "lucide-react";
import { connectionBadge } from "@/utils/socialAccountStatus";

export default function AccountsStep({ campaign, setCampaign, brandAccounts, navigate, verifiedStatus = {} }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <h2 className="text-xl font-bold text-white">Target Social Accounts</h2>
      {brandAccounts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-neutral-800 rounded-3xl">
          <Share2 className="w-12 h-12 mx-auto text-neutral-600 mb-4" />
          <p className="text-white font-bold">No accounts connected for this brand.</p>
          <button onClick={() => navigate("/brands")} className="mt-3 text-fuchsia-400 text-sm hover:underline">Link accounts in Brand Manager →</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {brandAccounts.map(a => {
            const selected = campaign.selected_accounts.includes(a.id);
            const badge = connectionBadge(verifiedStatus[a.id]?.status || a.status);
            return (
              <button key={a.id} onClick={() => setCampaign(p => ({
                ...p, selected_accounts: selected ? p.selected_accounts.filter(id => id !== a.id) : [...p.selected_accounts, a.id],
              }))} className={`p-5 rounded-2xl border text-left flex justify-between ${selected ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-neutral-800 bg-neutral-900"}`}>
                <div>
                  <p className="font-bold text-white">{a.account_name}</p>
                  <p className="text-xs text-neutral-500 capitalize">{a.platform}</p>
                  <p className={`text-[10px] font-bold mt-1.5 flex items-center gap-1 ${badge.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </p>
                </div>
                {selected && <CheckCircle2 className="w-5 h-5 text-fuchsia-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
