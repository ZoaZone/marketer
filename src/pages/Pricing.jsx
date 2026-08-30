import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PayPalButton from "@/components/PayPalButton";
import { Check, ArrowRight, ArrowLeft, Loader2, Star, Sparkles, Gift, Mail, Phone, MessageSquare, Film, Clapperboard, KeyRound, Briefcase } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useSeo, SEO } from "@/lib/seo";

const PRICE_PER_CREDIT = 0.06;
const FREE_TRIAL_LIMIT = 25;
const CREDIT_PACKS = [10, 25, 50, 100];

const MESSAGING_RATES = [
  { Icon: Mail,          label: "Email",     provider: "SendGrid / Resend",     rate: "$1.30 / 1,000 emails",         byo: "Agency & Enterprise: bring your own SendGrid key — $0 platform fee" },
  { Icon: Phone,         label: "SMS",       provider: "Twilio",                rate: "≈ $0.013 / SMS (US)",           byo: "Agency & Enterprise: bring your own Twilio account — $0 platform fee" },
  { Icon: MessageSquare, label: "WhatsApp",  provider: "Meta Cloud API",        rate: "≈ $0.013 / conversation (US)", byo: "Agency & Enterprise: bring your own Meta BSP token — $0 platform fee" },
];

// Lane 1 — Business. Pooled Base44 credits cover images, short video, and
// voiceover; when a request needs a premium fallback LLM, that usage is
// resold at +30–50% over provider cost. Each tier's credit pool is a soft
// monthly cap — going over doesn't hard-stop you, it bills overage.
// `key` is the canonical id sent to stripeCheckoutCREAM / stored as
// Subscription.plan_tier — must match its PLANS map and recordCommission's
// PRICES map exactly (see those files' comments).
const LANE1_PLANS = [
  {
    key: "creator", name: "Creator", price_monthly: 19, price_yearly: 182,
    desc: "For solo creators just getting started", color: "border-white/10",
    credits: "300 pooled credits/mo",
    features: [
      "300 pooled Base44 credits/month", "Images, short video, voiceover", "1 brand / client account",
      "Fallback premium LLMs (+30–50% over cost)", "Soft monthly cap — overage billed, never hard-stopped",
      "Email support",
    ],
  },
  {
    key: "starter", name: "Starter", price_monthly: 49, price_yearly: 470,
    desc: "Perfect for small businesses and solopreneurs", color: "border-white/10",
    credits: "800 pooled credits/mo",
    features: [
      "800 pooled Base44 credits/month", "1 brand / client account", "1,000 bulk messages/month",
      "3 social accounts", "Basic funnel builder", "Lead capture forms",
      "Fallback premium LLMs (+30–50% over cost)", "Email support",
    ],
  },
  {
    key: "growth", name: "Growth", price_monthly: 149, price_yearly: 1430,
    desc: "For growing teams and freelancers managing clients", color: "border-fuchsia-500/50", popular: true,
    credits: "3,000 pooled credits/mo",
    features: [
      "3,000 pooled Base44 credits/month", "5 brand / client accounts", "10,000 bulk messages/month",
      "15 social accounts", "Advanced funnels & sequences", "Website scanner",
      "Ad creator + script writer", "Analytics dashboard", "Priority support",
    ],
  },
  {
    key: "agency", name: "Agency", price_monthly: 399, price_yearly: 3830,
    desc: "Full power for agencies managing unlimited clients", color: "border-amber-500/30",
    credits: "9,000 pooled credits/mo + seats",
    features: [
      "9,000 pooled Base44 credits/month + additional team seats", "10 brands / unlimited clients",
      "50,000 bulk messages/month", "Unlimited social accounts",
      "Affiliate & agency portals", "BYO email/SMS/WhatsApp (zero platform fee)",
      "API access", "Dedicated account manager",
    ],
  },
];

// Lane 2 — Movie Maker Pro. A separate paid product from Lane 1: it's the
// only lane that spends real per-minute money on external providers
// (Replicate, ElevenLabs), so it's metered in weighted render-credits
// rather than the flat pooled-credit model above. Every tier is a finite,
// transparent pool with overage — never "unlimited".
const RENDER_WEIGHTS = [
  { label: "Video scene", weight: "7×" },
  { label: "Dubbed minute", weight: "8×" },
  { label: "Lip-sync", weight: "15×" },
  { label: "Long-form music track", weight: "6×" },
];

const LANE2_PLANS = [
  {
    key: "indie", name: "Indie", price_monthly: 99, price_yearly: 950,
    desc: "Get started with AI film production", color: "border-white/10",
    credits: "40 scene-equivalent render-credits/mo",
    features: [
      "40 scene-equivalent render-credits/month", "Per-scene AI video (Kling / MiniMax)",
      "AI music, dubbing & lip-sync — pay from the same pool", "Movie Maker Pro access",
      "Finite pool with transparent overage pricing",
    ],
  },
  {
    key: "studio", name: "Studio", price_monthly: 399, price_yearly: 3830,
    desc: "For serious multi-scene productions", color: "border-cyan-500/40", popular: true,
    credits: "200 scenes + 60 dub-min render-credits/mo",
    features: [
      "200 scene-equivalent render-credits/month", "+60 dubbing-minute credits included",
      "Reference-locked characters across scenes", "Priority render queue",
      "Finite pool with transparent overage pricing",
    ],
  },
  {
    key: "dubbing_house", name: "Dubbing House", price_monthly: 499, price_yearly: 4790,
    desc: "For dubbing- and localization-heavy workflows", color: "border-white/10",
    credits: "400 dub-min render-credits/mo + lip-sync pack",
    features: [
      "400 dubbing-minute render-credits/month", "Lip-sync pack included",
      "Multi-language dubbing pipeline", "Caption burn-in",
      "Finite pool with transparent overage pricing",
    ],
  },
  {
    key: "enterprise", name: "Enterprise", price_monthly: 1499, price_yearly: null,
    desc: "Large-volume production with an SLA", color: "border-cyan-500/40",
    enterprise: true, contactSales: true,
    credits: "Large finite render-credit pool, sized to your volume",
    features: [
      "Large finite render-credit pool — sized to your volume", "Transparent overage pricing, no hidden caps",
      "SLA-backed render priority", "Dedicated success manager", "Custom integrations",
    ],
  },
];

const BYOK_PLAN = {
  key: "byok", name: "BYOK", price_monthly: 49, price_yearly: 470,
  desc: "Bring your own AI provider keys",
  features: [
    "Bring your own Replicate, ElevenLabs, and/or LLM key (via Integrations)",
    "Lane-2 jobs prefer your key over the platform's",
    "No per-generation markup on BYOK-covered jobs",
    "Platform-access fee only — provider usage is billed directly by your own account",
  ],
};

export default function Pricing() {
  useSeo(SEO.pricing);

  const [billing, setBilling] = useState("monthly");
  const isIndia = typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith("Asia/");
  const [loadingPlan, setLoadingPlan] = useState(null);

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: () => base44.auth.me().catch(() => null) });

  const handleCheckout = async (plan) => {
    if (!user) { window.location.href = "/auth"; return; }
    setLoadingPlan(plan.key);
    try {
      const res = await base44.functions.invoke("stripeCheckoutCREAM", { plan: plan.key, billing });
      const url = res?.data?.checkout_url;
      if (url) {
        window.location.href = url;
      } else if (res?.data?.demo) {
        window.location.href = "/onboarding";
      } else {
        alert("Checkout error: " + (res?.data?.error || "Unknown error"));
      }
    } catch (e) { alert("Checkout error: " + (e?.response?.data?.error || e.message)); }
    setLoadingPlan(null);
  };

  const savings = (p) => p.price_yearly ? Math.round(((p.price_monthly * 12 - p.price_yearly) / (p.price_monthly * 12)) * 100) : 0;

  const PlanCard = ({ plan }) => {
    const price = billing === "yearly" && plan.price_yearly ? plan.price_yearly : plan.price_monthly;
    const perMonth = billing === "yearly" && plan.price_yearly ? Math.round(plan.price_yearly / 12) : plan.price_monthly;
    return (
      <div className={`relative rounded-3xl p-6 border flex flex-col ${plan.color} ${
        plan.popular ? `bg-fuchsia-500/8 shadow-2xl shadow-fuchsia-500/20` :
        plan.enterprise ? "bg-gradient-to-b from-cyan-500/8 to-blue-500/5" : "bg-white/3"
      }`}>
        {plan.popular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 rounded-full text-xs font-bold shadow-lg whitespace-nowrap">
            <Star className="w-3 h-3 fill-white" /> Most Popular
          </div>
        )}
        {plan.enterprise && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full text-xs font-bold shadow-lg whitespace-nowrap">
            <Film className="w-3 h-3" /> SLA
          </div>
        )}
        <p className="text-white/40 text-xs mb-1 mt-1">{plan.desc}</p>
        <h3 className="text-lg font-black text-white mb-2">{plan.name}</h3>
        <div className="mb-1">
          <span className="text-3xl font-black text-white">${perMonth}{plan.contactSales ? "+" : ""}</span>
          <span className="text-white/40 text-xs">/mo</span>
        </div>
        <p className="text-[11px] text-white/30 mb-1">+ applicable taxes</p>
        {billing === "yearly" && plan.price_yearly && <p className="text-xs text-fuchsia-400 mb-3">Billed ${price}/year · save {savings(plan)}%</p>}
        {(billing === "monthly" || !plan.price_yearly) && <div className="mb-3" />}
        {plan.credits && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 font-medium">{plan.credits}</div>
        )}

        <div className="space-y-2 mb-6 flex-1">
          {plan.features.map(f => (
            <div key={f} className="flex items-start gap-2 text-xs text-white/70">
              <Check className="w-3.5 h-3.5 text-fuchsia-400 flex-shrink-0 mt-0.5" /> {f}
            </div>
          ))}
        </div>

        {plan.contactSales ? (
          <a href="mailto:sales@digitalstudios.app?subject=Movie%20Maker%20Pro%20Enterprise"
            className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 shadow-lg">
            <Mail className="w-4 h-4" /> Contact Sales
          </a>
        ) : (
          <button onClick={() => handleCheckout(plan)} disabled={!!loadingPlan}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              plan.popular
                ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:opacity-90 shadow-lg shadow-fuchsia-500/30"
                : "border border-white/15 text-white/80 hover:border-white/30 hover:text-white"
            } disabled:opacity-60`}>
            {loadingPlan === plan.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Started <ArrowRight className="w-4 h-4" /></>}
          </button>
        )}
        {isIndia && !plan.contactSales && (
          <div className="mt-3">
            <p className="text-xs text-center text-white/40 mb-2">🇮🇳 India? Pay in INR</p>
            <PayPalButton amount={Math.round(perMonth * 85)} currency="INR" planName={plan.name} planTier={plan.key} sourceApp="marketer" userEmail={user?.email || ""} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-10 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex items-center justify-center mb-4">
            <img src="/brand/logo-wordmark.jpg" alt={BRAND.name} className="h-12 object-contain" onError={(e) => e.target.style.display="none"} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Choose your plan</h1>
          <p className="text-white/50 text-lg mb-6">Two lanes, priced for what they actually cost: Business runs on pooled platform credits, Movie Maker Pro meters real external render costs.</p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 text-sm font-medium mb-8">
            <Gift className="w-4 h-4" /> Start free — {FREE_TRIAL_LIMIT} AI generations (~5 images or 3 short videos), no credit card required
          </div>

          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            <button onClick={() => setBilling("monthly")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing === "monthly" ? "bg-white/10 text-white" : "text-white/50"}`}>
              Monthly
            </button>
            <button onClick={() => setBilling("yearly")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-white/10 text-white" : "text-white/50"}`}>
              Yearly <span className="text-xs px-1.5 py-0.5 bg-fuchsia-500/20 text-fuchsia-300 rounded-full font-medium">Save 20%</span>
            </button>
          </div>
          <p className="text-[11px] text-white/25 mt-3">All prices shown + applicable taxes, calculated at checkout based on your billing address.</p>
        </div>

        {/* Pay-as-you-go Credits callout */}
        <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/25 rounded-3xl p-6 mb-14 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-start gap-3 flex-1">
            <Sparkles className="w-6 h-6 text-fuchsia-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-black text-white mb-0.5">Pay-as-you-go Lane 1 Credits</h3>
              <p className="text-sm text-white/50">No subscription, or need to top up your pooled Lane 1 credits? Buy anytime. 1 credit = 1 AI image or video scene = ${PRICE_PER_CREDIT.toFixed(2)} + applicable taxes. Credits never expire.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            {CREDIT_PACKS.map(amt => (
              <div key={amt} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-center min-w-[64px]">
                <div className="text-lg font-black text-white">${amt}</div>
                <div className="text-[10px] text-white/40">{Math.floor(amt / PRICE_PER_CREDIT).toLocaleString()} cr</div>
              </div>
            ))}
          </div>
          <Link to="/billing" className="shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 transition-all whitespace-nowrap">
            Buy Credits →
          </Link>
        </div>

        {/* Lane 1 — Business */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shrink-0">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-fuchsia-400/80 uppercase">Lane 1</p>
            <h2 className="text-xl font-black text-white">Business</h2>
          </div>
        </div>
        <p className="text-white/40 text-sm mb-6 max-w-2xl">Pooled Base44 credits cover images, short video, and voiceover. When a request needs a premium fallback LLM, that usage is resold at +30–50% over provider cost. Each tier's pool is a soft monthly cap — going over bills overage automatically, it never hard-stops you.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14">
          {LANE1_PLANS.map(plan => <PlanCard key={plan.key} plan={plan} />)}
        </div>

        {/* Lane 2 — Movie Maker Pro */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <Clapperboard className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-cyan-400/80 uppercase">Lane 2</p>
            <h2 className="text-xl font-black text-white">Movie Maker Pro</h2>
          </div>
        </div>
        <p className="text-white/40 text-sm mb-4 max-w-2xl">A separate product from Lane 1 — this is the only lane that spends real per-minute money on external AI providers, so it's metered in weighted render-credits instead of flat generations. Every tier is a finite, transparent pool with overage pricing — never unlimited.</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {RENDER_WEIGHTS.map(w => (
            <div key={w.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60">
              <span className="font-bold text-cyan-400">{w.weight}</span> {w.label}
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14">
          {LANE2_PLANS.map(plan => <PlanCard key={plan.key} plan={plan} />)}
        </div>

        {/* BYOK */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-emerald-400/80 uppercase">Add-on</p>
            <h2 className="text-xl font-black text-white">Bring Your Own Key (BYOK)</h2>
          </div>
        </div>
        <p className="text-white/40 text-sm mb-6 max-w-2xl">Connect your own Replicate, ElevenLabs, and/or LLM key from the Integrations page — Lane-2 jobs prefer your key over the platform's, billed directly by your own provider account. This is a platform-access fee only, not a usage credit pool.</p>
        <div className="max-w-sm mb-14">
          <PlanCard plan={BYOK_PLAN} />
        </div>

        {/* Email, SMS & WhatsApp sending */}
        <div className="bg-white/3 border border-white/8 rounded-3xl p-7 mb-8">
          <h3 className="text-xl font-black text-white mb-1">Email, SMS &amp; WhatsApp Sending</h3>
          <p className="text-white/50 text-sm mb-1">
            Platform-managed sending is billed per message beyond your plan's monthly quota.
          </p>
          <p className="text-white/40 text-xs mb-5">
            Agency plans: bring your own SendGrid, Twilio, or Meta BSP credentials for <strong className="text-white/70">zero platform fee</strong>.
            WhatsApp campaigns require pre-approved message templates per Meta Business API rules; transactional messages can be sent from your registered sender number without pre-approval.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MESSAGING_RATES.map(m => (
              <div key={m.label} className="p-4 rounded-2xl border border-white/10 bg-white/3">
                <div className="flex items-center gap-2 mb-1.5">
                  <m.Icon className="w-4 h-4 text-fuchsia-400" />
                  <span className="font-semibold text-white text-sm">{m.label}</span>
                </div>
                <p className="text-xs text-white/40 mb-1">via {m.provider}</p>
                <p className="text-sm font-bold text-white mb-1">{m.rate}</p>
                <p className="text-xs text-white/40">{m.byo}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Legal note */}
        <p className="text-center text-xs text-white/25">
          All prices shown exclude applicable taxes, calculated and applied at checkout. All sales are final. Subscriptions auto-renew. Cancel anytime before renewal to avoid charges. For billing questions: care@digitalstudios.app
        </p>
      </div>
    </div>
  );
}
