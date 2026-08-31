import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PayPalButton from "@/components/PayPalButton";
import { Check, ArrowRight, ArrowLeft, Loader2, Star, Sparkles, Gift, Mail, Phone, MessageSquare, Film, Clapperboard, KeyRound, Briefcase } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useSeo, SEO } from "@/lib/seo";

import {
  LANE1_PLANS as CATALOG_LANE1,
  LANE2_PLANS as CATALOG_LANE2,
  BYOK_PLAN as CATALOG_BYOK,
  AI_CREDIT_RETAIL_USD,
  RENDER_MINUTE_WEIGHTS,
  FREE_TRIAL_GENERATIONS,
  BILLING_MODEL,
} from "@/config/plans";

const PRICE_PER_CREDIT = AI_CREDIT_RETAIL_USD;
const FREE_TRIAL_LIMIT = FREE_TRIAL_GENERATIONS;
const CREDIT_PACKS = [10, 25, 50, 100];

const MESSAGING_RATES = [
  { Icon: Mail,          label: "Email",     provider: "SendGrid / Resend",     rate: "$1.30 / 1,000 emails",         byo: "Agency & Enterprise: bring your own SendGrid key — $0 platform fee" },
  { Icon: Phone,         label: "SMS",       provider: "Twilio",                rate: "≈ $0.013 / SMS (US)",           byo: "Agency & Enterprise: bring your own Twilio account — $0 platform fee" },
  { Icon: MessageSquare, label: "WhatsApp",  provider: "Meta Cloud API",        rate: "≈ $0.013 / conversation (US)", byo: "Agency & Enterprise: bring your own Meta BSP token — $0 platform fee" },
];

// Plans come from the canonical catalog (src/config/plans.js) so this page,
// the in-app Billing page and the Stripe checkout function cannot describe
// the same money differently — which they did: this page advertised nine
// plans and allowances (300/800/3,000/9,000 pooled credits) that no endpoint
// enforced, while Billing sold three plans quoting entirely different
// numbers. Colour/icon are presentation-only and stay here.
const ACCENT = {
  creator: { color: "border-white/10", Icon: Sparkles },
  starter: { color: "border-white/10", Icon: Briefcase },
  growth: { color: "border-fuchsia-500/40", Icon: Star },
  agency: { color: "border-white/10", Icon: Briefcase },
  indie: { color: "border-white/10", Icon: Film },
  studio: { color: "border-fuchsia-500/40", Icon: Clapperboard },
  dubbing_house: { color: "border-white/10", Icon: Clapperboard },
  enterprise: { color: "border-cyan-500/40", Icon: Briefcase },
  byok: { color: "border-amber-500/30", Icon: KeyRound },
};

const decorate = (plan) => ({
  ...plan,
  ...(ACCENT[plan.key] || {}),
  desc: plan.tagline,
  contactSales: !!plan.sales_assisted,
  credits: [
    plan.allowance.render_minutes > 0 ? `${plan.allowance.render_minutes.toLocaleString()} Render Minutes/mo` : null,
    plan.allowance.ai_credits > 0 ? `${plan.allowance.ai_credits.toLocaleString()} AI credits/mo` : null,
  ].filter(Boolean).join(" · "),
});

// The weight chips under the Lane 2 header. Derived from the catalog rather
// than hand-written: the previous hardcoded list (7x/8x/15x/6x) bore no
// relation to what any operation actually costs, and nothing would have
// caught it drifting further.
const RENDER_WEIGHTS = [
  { label: "Dubbed minute", weight: `${RENDER_MINUTE_WEIGHTS.dubbing_minute}x` },
  { label: "Video scene (5s)", weight: `${RENDER_MINUTE_WEIGHTS.ai_video_scene}x` },
  { label: "Lip-sync minute", weight: `${RENDER_MINUTE_WEIGHTS.lipsync_minute}x` },
  { label: "Music track", weight: `${RENDER_MINUTE_WEIGHTS.music_track}x` },
];

const LANE1_CARDS = CATALOG_LANE1.map(decorate);
const LANE2_CARDS = CATALOG_LANE2.map(decorate);
const BYOK_CARD = decorate(CATALOG_BYOK);

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

        <button onClick={() => handleCheckout(plan)} disabled={!!loadingPlan}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            plan.popular
              ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:opacity-90 shadow-lg shadow-fuchsia-500/30"
              : "border border-white/15 text-white/80 hover:border-white/30 hover:text-white"
          } disabled:opacity-60`}>
          {loadingPlan === plan.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Started <ArrowRight className="w-4 h-4" /></>}
        </button>
        {/* Enterprise is buyable at list price AND sales-assisted for custom
            volume — it used to be contact-sales only, with no checkout path
            behind it at all. */}
        {plan.contactSales && (
          <a href="mailto:care@zoazoneservices.com?subject=Enterprise%20volume%20pricing"
            className="mt-2 w-full py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
            <Mail className="w-3.5 h-3.5" /> Talk to sales about custom volume
          </a>
        )}
        {isIndia && (
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
            <img src="/brand/wordmark.png" alt={BRAND.name} className="h-12 object-contain" onError={(e) => e.target.style.display="none"} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Choose your plan</h1>
          <p className="text-white/50 text-lg mb-6">Two lanes, priced for what they actually cost: Business runs on pooled AI credits, Studio &amp; Dubbing meters real external render work in Render Minutes.</p>

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
              <h3 className="text-base font-black text-white mb-0.5">Pay-as-you-go AI Credits</h3>
              <p className="text-sm text-white/50">No subscription, or need to top up this month&rsquo;s AI credits? Buy anytime. 1 credit = 1 AI image or short video scene = ${PRICE_PER_CREDIT.toFixed(2)} + applicable taxes. Credits never expire.</p>
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
        <p className="text-white/40 text-sm mb-6 max-w-2xl">{BILLING_MODEL.ai_credit} Your monthly allowance covers images, short video, voiceover, scripts and campaign copy. {BILLING_MODEL.overage}</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14">
          {LANE1_CARDS.map(plan => <PlanCard key={plan.key} plan={plan} />)}
        </div>

        {/* Lane 2 — Studio & Dubbing */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <Clapperboard className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-cyan-400/80 uppercase">Lane 2</p>
            <h2 className="text-xl font-black text-white">Studio &amp; Dubbing</h2>
          </div>
        </div>
        <p className="text-white/40 text-sm mb-4 max-w-2xl">{BILLING_MODEL.render_minute} Every tier is a finite, published pool with published overage — never &ldquo;unlimited&rdquo;. {BILLING_MODEL.byok}</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {RENDER_WEIGHTS.map(w => (
            <div key={w.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60">
              <span className="font-bold text-cyan-400">{w.weight}</span> {w.label}
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14">
          {LANE2_CARDS.map(plan => <PlanCard key={plan.key} plan={plan} />)}
        </div>

        {/* BYO Providers */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-emerald-400/80 uppercase">Add-on</p>
            <h2 className="text-xl font-black text-white">Bring Your Own Providers</h2>
          </div>
        </div>
        <p className="text-white/40 text-sm mb-6 max-w-2xl">Connect your own Replicate, ElevenLabs and/or LLM key from the Integrations page — Lane-2 jobs then run on your account and your provider bills you directly, so they consume none of your Render Minutes. This is a platform-access fee only, not a usage pool. Included free with Studio, Dubbing House and Enterprise.</p>
        <div className="max-w-sm mb-14">
          <PlanCard plan={BYOK_CARD} />
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

        {/* Legal note. This previously read "All sales are final", which
            contradicted the Terms — §7 makes fees non-refundable EXCEPT where
            law requires otherwise, because an absolute bar is unenforceable
            against consumers in several markets and a court can strike the whole
            clause. Checkout copy and the Terms have to say the same thing, or
            the stricter-sounding one gets read against us. */}
        <p className="text-center text-xs text-white/25">
          All prices shown exclude applicable taxes, calculated and applied at checkout.
          Subscriptions auto-renew; cancel anytime before renewal to avoid charges.
          Fees are non-refundable except where required by law — see our{" "}
          <Link to="/terms" className="underline hover:text-white/40">Terms of Service</Link>.
          For billing questions: care@digitalstudios.app
        </p>
      </div>
    </div>
  );
}
