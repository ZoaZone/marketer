import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CreditCard, Check, Zap, Loader2, ExternalLink, TrendingUp, Calendar, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import PayPalButton from "@/components/PayPalButton";

const PLANS = [
  {
    name: "Starter", key: "starter", price_monthly: 49, price_yearly: 470, tier: 1,
    color: "border-white/10",
    features: ["1 client account", "500 AI generations/mo", "1,000 bulk messages/mo", "3 social accounts", "Basic funnel builder", "Email support"],
  },
  {
    name: "Growth", key: "growth", price_monthly: 149, price_yearly: 1430, tier: 2,
    popular: true, color: "border-fuchsia-500/40",
    features: ["5 client accounts", "2,500 AI generations/mo", "10,000 bulk messages/mo", "15 social accounts", "Advanced funnels", "Website scanner", "Ad creator + script writer", "Priority support"],
  },
  {
    name: "Agency", key: "agency", price_monthly: 399, price_yearly: 3830, tier: 3,
    color: "border-white/10",
    features: ["Unlimited clients", "10,000 AI generations/mo", "50,000 bulk messages/mo", "Unlimited social accounts", "White-label", "Affiliate portal", "Agency portal", "Dedicated manager"],
  },
];

export default function Billing() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  const { data: sub } = useQuery({
    queryKey: ["subscription", user?.email],
    queryFn: () => base44.entities.Subscription.filter({ owner_email: user?.email }, null, 1).then(r => r[0] || null),
    enabled: !!user?.email,
  });

  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns_b"], queryFn: () => base44.entities.MarketingCampaign.list(null, 200) });
  const { data: assets = [] } = useQuery({ queryKey: ["assets_b"], queryFn: () => base44.entities.ContentAsset.list(null, 200) });
  const { data: messages = [] } = useQuery({ queryKey: ["messages_b"], queryFn: () => base44.entities.BulkMessage.list(null, 500) });

  const totalSent = messages.filter(m => m.status === "delivered").length;
  const aiGenCount = assets.filter(a => a.ai_generated).length;

  const subscribe = async (planKey, planName, amount) => {
    setLoading(planKey);
    setError("");
    try {
      const res = await base44.functions.invoke("stripeCheckoutCREAM", { plan: planKey, billing });
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      } else if (res?.success) {
        qc.invalidateQueries(["subscription"]);
        setLoading(null);
      } else {
        setError(res?.error || "Something went wrong");
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(null);
  };

  const openPortal = async () => {
    setLoadingPortal(true);
    setError("");
    try {
      const res = await base44.functions.invoke("stripePortalMarketer", { return_url: window.location.href });
      if (res?.url) window.location.href = res.url;
      else setError(res?.error || "Could not open billing portal. Contact care@aevoice.ai");
    } catch (e) { setError(e.message); }
    setLoadingPortal(false);
  };

  const currentPlan = PLANS.find(p => p.name === sub?.plan_name) || null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-fuchsia-400" /> Billing
        </h1>
        <p className="text-muted-foreground text-sm">Manage your plan, usage, and payments</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Current plan */}
      {sub && (
        <div className={`bg-card border rounded-2xl p-6 ${currentPlan?.popular ? "border-fuchsia-500/40 shadow-lg shadow-fuchsia-500/10" : "border-border"}`}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-fuchsia-400" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Plan</span>
              </div>
              <h2 className="text-2xl font-black text-foreground">{sub.plan_name || "Free"}</h2>
              <p className={`text-xs mt-1 font-medium px-2 py-0.5 rounded-full inline-block ${sub.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                {sub.status}
              </p>
            </div>
            <button onClick={openPortal} disabled={loadingPortal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-fuchsia-500/30 transition-all disabled:opacity-50">
              {loadingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage Subscription
            </button>
          </div>

          {/* Usage */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
            {[
              { label: "Messages Sent", value: totalSent, limit: currentPlan?.name === "Starter" ? "1,000" : currentPlan?.name === "Growth" ? "10,000" : "50,000" },
              { label: "AI Generations", value: aiGenCount, limit: currentPlan?.name === "Starter" ? "500" : currentPlan?.name === "Growth" ? "2,500" : "10,000" },
              { label: "Campaigns", value: campaigns.length, limit: "∞" },
            ].map(u => (
              <div key={u.label}>
                <div className="text-xl font-black text-foreground">{u.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{u.label}</div>
                <div className="text-xs text-muted-foreground/50">of {u.limit}/mo</div>
              </div>
            ))}
          </div>

          {sub.current_period_end && (
            <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              Renews {new Date(sub.current_period_end).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center gap-3 justify-center">
        <button onClick={() => setBilling("monthly")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${billing === "monthly" ? "bg-fuchsia-500/10 text-fuchsia-400" : "text-muted-foreground"}`}>Monthly</button>
        <button onClick={() => setBilling("yearly")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${billing === "yearly" ? "bg-fuchsia-500/10 text-fuchsia-400" : "text-muted-foreground"}`}>
          Yearly <span className="ml-1 text-xs bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full">Save 20%</span>
        </button>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const price = billing === "yearly" ? plan.price_yearly : plan.price_monthly;
          const isCurrent = sub?.plan_name === plan.name;
          return (
            <div key={plan.key} className={`bg-card border rounded-2xl p-6 flex flex-col ${plan.popular ? "border-fuchsia-500/40 shadow-lg shadow-fuchsia-500/10" : "border-border"}`}>
              {plan.popular && <div className="text-xs font-bold text-fuchsia-400 uppercase tracking-widest mb-2">Most Popular</div>}
              <h3 className="text-lg font-black text-foreground">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-black text-foreground">${price}</span>
                <span className="text-muted-foreground text-sm">/{billing === "yearly" ? "yr" : "mo"}</span>
              </div>
              <ul className="space-y-2 flex-1 mb-5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="w-full text-center py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-semibold">
                  ✓ Current Plan
                </div>
              ) : (
                <div className="space-y-2">
                  <button onClick={() => subscribe(plan.key, plan.name, price)} disabled={loading === plan.key}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-fuchsia-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading === plan.key ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading === plan.key ? "Processing..." : `Upgrade to ${plan.name}`}
                  </button>
                  <PayPalButton
                    amount={Math.round(price * 83.5)}
                    currency="INR"
                    planName={plan.name}
                    sourceApp="marketer"
                    userEmail={user?.email || ""}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Questions? <a href="mailto:care@aevoice.ai" className="text-fuchsia-400 hover:underline">care@aevoice.ai</a> · 14-day free trial on Growth plan
      </p>
    </div>
  );
}
