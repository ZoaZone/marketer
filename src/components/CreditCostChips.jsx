import { CREDIT_COSTS } from "@/config/plans";

// What each AI credit buys, straight from the plan catalog.
export default function CreditCostChips() {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {CREDIT_COSTS.map(c => (
        <div key={c.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60">
          <span className="font-bold text-fuchsia-300">{c.credits} cr</span> {c.label}
        </div>
      ))}
    </div>
  );
}