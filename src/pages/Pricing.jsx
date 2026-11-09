import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PayPalButton from "@/components/PayPalButton";
import { Check, Zap, ArrowRight, ArrowLeft, Loader2, Star } from "lucide-react";

const M_LOGO = "https://media.base44.com/images/public/69b1f1d60b1fb9d791fddc64/d1aa347a6_generated_image.png";

const PLANS = [
  {
    name: "Starter", price_monthly: 49, price_yearly: 470, tier: 1,
    desc: "Perfect for small businesses and solopreneurs",
    color: "border-white/10",
    features: [
      "1 client account", "500 AI generations/month", "1,000 bulk messages/month",
      "3 social accounts", "Basic funnel builder", "Lead capture forms",
      "Email support",
    ],
  },
  {
    name: "Growth", price_monthly: 149, price_yearly: 1430, tier: 2,
    desc: "For growing teams and freelancers managing clients",
    color: "border-fuchsia-500/50",
    popular: true,
    features: [
      "5 client accounts", "2,500 AI generations/month", "10,000 bulk messages/month",
      "15 social accounts", "Advanced funnels & sequences", "Website scanner",
      "Ad creator + script writer", "Analytics dashboard", "Priority support",
    ],
  },
  {
    name: "Agency", price_monthly: 399, price_yearly: 3830, tier: 3,
    desc: "Full power for agencies managing unlimited clients",
    color: "border-white/10",
    features: [
      "Unlimited clients", "10,000 AI generations/month", "50,000 bulk messages/month",
      "Unlimited social accounts", "White-label options", "Affiliate portal",
      "Agency portal", "API access", "Custom integrations",
      "Dedicated account manager",
    ],
  },
];

const FEATURE_MATRIX = [
  { feature: "Client Accounts",      starter: "1",      growth: "5",        agency: "Unlimited" },
  { feature: "AI Generations/mo",    starter: "500",    growth: "2,500",    agency: "10,000" },
  { feature: "Bulk Messages/mo",     starter: "1,000",  growth: "10,000",   agency: "50,000" },
  { feature: "Social Accounts",      starter: "3",      growth: "15",       agency: "Unlimited" },
  { feature: "Funnel Builder",        starter: "Basic",  growth: "Advanced", agency: "Advanced" },
  { feature: "Website Scanner",       starter: "✗",      growth: "✓",        agency: "✓" },
  { feature: "Ad Creator",            starter: "✗",      growth: "✓",        agency: "✓" },
  { feature: "Script Writer",         starter: "✗",      growth: "✓",        agency: "✓" },
  { feature: "Affiliate Portal",      starter: "✗",      growth: "✗",        agency: "✓" },
  { feature: "Agency Portal",         starter: "✗",      growth: "✗",        agency: "✓" },
  { feature: "White-label",           starter: "✗",      growth: "✗",        agency: "✓" },
  { feature: "API Access",            starter: "✗",      growth: "✗",        agency: "✓" },
  { feature: "Support",               starter: "Email",  growth: "Priority", agency: "Dedicated" },
];

export default function Pricing() {
  const [billing, setBilling] = useState("monthly");
  const isIndia = typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith("Asia/");
  const [loadingPlan, setLoadingPlan] = useState(null);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => base44.auth.me().catch(() => null) });

  const handleCheckout = async (plan) => {
    if (!user) { window.location.href = "/"; return; }
    setLoadingPlan(plan.name);
    try {
      const res = await base44.functions.invoke("stripeCheckoutMarketer", {
        plan_name: plan.name,
        price: billing === "yearly" ? plan.price_yearly : plan.price_monthly,
        billing,
        user_email: user.email,
        success_url: window.location.origin + "/onboarding",
        cancel_url: window.location.origin + "/pricing",
      });
      if (res?.data?.url) window.location.href = res.data.url;
    } catch (e) { alert("Checkout error: " + e.message); }
    setLoadingPlan(null);
  };

  const savings = (p) => Math.round(((p.price_monthly * 12 - p.price_yearly) / (p.price_monthly * 12)) * 100);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16">
      <div className="max-w-6xl mx-auto">
        {/* Back */}
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-10 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={M_LOGO} alt="" className="w-8 h-8 rounded-lg" onError={(e) => e.target.style.display="none"} />
            <span className="text-lg font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">media.aevoice.ai</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Choose your plan</h1>
          <p className="text-white/50 text-lg mb-8">Choose the plan that fits your growth.</p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            <button onClick={() => setBilling("monthly")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing === "monthly" ? "bg-white/10 text-white" : "text-white/50"}`}>
              Monthly
            </button>
            <button onClick={() => setBilling("yearly")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-white/10 text-white" : "text-white/50"}`}>
              Yearly <span className="text-xs px-1.5 py-0.5 bg-fuchsia-500/20 text-fuchsia-300 rounded-full font-medium">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {PLANS.map((plan) => {
            const price = billing === "yearly" ? plan.price_yearly : plan.price_monthly;
            const perMonth = billing === "yearly" ? Math.round(plan.price_yearly / 12) : plan.price_monthly;
            return (
              <div key={plan.name} className={`relative rounded-3xl p-7 border ${plan.color} ${plan.popular ? "bg-fuchsia-500/8 shadow-2xl shadow-fuchsia-500/20" : "bg-white/3"}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-full text-xs font-bold shadow-lg">
                    <Star className="w-3 h-3 fill-white" /> Most Popular
                  </div>
                )}
                <p className="text-white/40 text-sm mb-1">{plan.desc}</p>
                <h3 className="text-xl font-black text-white mb-3">{plan.name}</h3>
                <div className="mb-1">
                  <span className="text-4xl font-black text-white">${perMonth}</span>
                  <span className="text-white/40 text-sm">/mo</span>
                </div>
                {billing === "yearly" && <p className="text-xs text-fuchsia-400 mb-5">Billed ${price}/year · save {savings(plan)}%</p>}
                {billing === "monthly" && <div className="mb-5" />}

                <div className="space-y-2.5 mb-8">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="w-4 h-4 text-fuchsia-400 flex-shrink-0 mt-0.5" /> {f}
                    </div>
                  ))}
                </div>

                <button onClick={() => handleCheckout(plan)} disabled={!!loadingPlan}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    plan.popular
                      ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:opacity-90 shadow-lg shadow-fuchsia-500/30"
                      : "border border-white/15 text-white/80 hover:border-white/30 hover:text-white"
                  } disabled:opacity-60`}>
                  {loadingPlan === plan.name ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   <>Get Started <ArrowRight className="w-4 h-4" /></>}
                </button>
                {isIndia && (
                  <div className="mt-3">
                    <p className="text-xs text-center text-white/40 mb-2">🇮🇳 India? Pay in INR</p>
                    <PayPalButton amount={Math.round(perMonth * 85)} currency="INR" planName={plan.name} sourceApp="marketer" userEmail={user?.email || ""} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature matrix */}
        <div className="bg-white/3 border border-white/8 rounded-3xl overflow-hidden mb-12">
          <div className="px-6 py-4 border-b border-white/8">
            <h3 className="font-bold text-white">Full Feature Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-6 py-3 text-white/50 font-medium">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.name} className={`text-center px-4 py-3 font-bold ${p.popular ? "text-fuchsia-400" : "text-white/80"}`}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {FEATURE_MATRIX.map(row => (
                  <tr key={row.feature} className="hover:bg-white/3">
                    <td className="px-6 py-3 text-white/60">{row.feature}</td>
                    {[row.starter, row.growth, row.agency].map((val, i) => (
                      <td key={i} className={`text-center px-4 py-3 font-medium ${
                        val === "✓" ? "text-fuchsia-400" : val === "✗" ? "text-white/20" : "text-white/80"
                      }`}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legal note */}
        <p className="text-center text-xs text-white/25">
          All sales are final. Subscriptions auto-renew. Cancel anytime before renewal to avoid charges. For billing questions: care@aevoice.ai
        </p>
      </div>
    </div>
  );
}
