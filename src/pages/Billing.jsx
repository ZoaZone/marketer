import { useState, useEffect, useRef } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { CreditCard, Check, Zap, Loader2, ExternalLink, Calendar, AlertCircle, Mail, Phone, MessageSquare, Sparkles, Gift } from "lucide-react";
import PayPalButton from "@/components/PayPalButton";
import { recordCommissionFor } from "@/utils/affiliate";

// $0.06 per AI generation credit (~50% platform margin over the ~$0.04 raw
// provider cost). Free trial includes 25 generations (≈5 images / 3 short videos).
const PRICE_PER_CREDIT = 0.06;
const FREE_TRIAL_LIMIT = 25;
const CREDIT_PACKS = [10, 25, 50, 100];

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
    features: ["Unlimited clients", "10,000 AI generations/mo", "50,000 bulk messages/mo", "Unlimited social accounts", "Affiliate portal", "Agency portal", "Dedicated manager"],
  },
];

export default function Billing() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");
  const [creditAmount, setCreditAmount] = useState(10);
  const [buyingCredits, setBuyingCredits] = useState(false);

  const { data: sub } = useQuery({
    queryKey: ["subscription", user?.email],
    queryFn: () => base44.entities.Subscription.filter({ owner_email: user?.email }, null, 1).then(r => r[0] || null),
    enabled: !!user?.email,
  });

  // Stripe Checkout has no webhook receiver in this app — the redirect back
  // here with ?session_id= is the only signal a real (non-demo) purchase
  // completed, so this confirms it with Stripe and activates the
  // subscription (see stripeCheckoutCREAM's "confirm" action).
  const confirmedRef = useRef(false);
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId || confirmedRef.current) return;
    confirmedRef.current = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("stripeCheckoutCREAM", { action: "confirm", session_id: sessionId });
        const data = res?.data ?? res;
        if (data?.confirmed && data?.subscription_id) {
          await recordCommissionFor(data.subscription_id);
          qc.invalidateQueries({ queryKey: ["subscription"] });
        }
      } catch (_) { /* best-effort — the plan page still shows current status either way */ }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [qc]);

  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns_b", user?.email], queryFn: () => base44.entities.MarketingCampaign.filter(mine(user), null, 200), enabled: !!user?.email });
  const { data: assets = [] } = useQuery({ queryKey: ["assets_b", user?.email], queryFn: () => base44.entities.ContentAsset.filter(mine(user), null, 200), enabled: !!user?.email });
  const { data: messages = [] } = useQuery({ queryKey: ["messages_b", user?.email], queryFn: () => base44.entities.BulkMessage.filter(mine(user), null, 500), enabled: !!user?.email });
  const { data: aiGenerations = [] } = useQuery({
    queryKey: ["media_items_b", user?.email],
    queryFn: () => base44.entities.MediaLibraryItem.filter({ created_by: user?.email, ai_generated: true }, null, 500),
    enabled: !!user?.email,
  });

  const totalSent = messages.filter(m => m.status === "delivered").length;
  const aiGenCount = assets.filter(a => a.ai_generated).length;

  // Any real (non-free) plan_tier counts as paid — Lane 1, Lane 2, and BYOK
  // tiers all qualify, so this never drifts out of sync when a new tier is added.
  const isPaidPlan = !!sub && ["active", "trialing"].includes(sub.status) && !!sub.plan_tier && sub.plan_tier !== "free";
  const trialUsed = aiGenerations.length;
  const creditsBalance = sub?.credits_balance || 0;

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

  const buyCredits = async (amount) => {
    setBuyingCredits(true);
    setError("");
    try {
      const res = await base44.functions.invoke("buyCredits", { amount_usd: amount });
      const data = res?.data ?? res;
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data?.success) {
        qc.invalidateQueries(["subscription"]);
      } else {
        setError(data?.error || "Something went wrong");
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
    setBuyingCredits(false);
  };

  const openPortal = async () => {
    setLoadingPortal(true);
    setError("");
    try {
      const res = await base44.functions.invoke("stripePortalMarketer", { return_url: window.location.href });
      if (res?.url) window.location.href = res.url;
      else setError(res?.error || "Could not open billing portal. Contact care@digitalstudios.app");
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

      {/* Free trial status */}
      {!isPaidPlan && (
        <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-fuchsia-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Free Trial</span>
          </div>
          <h2 className="text-2xl font-black text-foreground">No subscription yet</h2>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>AI generations used</span>
              <span>{Math.min(trialUsed, FREE_TRIAL_LIMIT)} / {FREE_TRIAL_LIMIT}</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600 transition-all" style={{ width: `${Math.min(100, (trialUsed / FREE_TRIAL_LIMIT) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">≈ 5 images or 3 short videos. {creditsBalance > 0 ? `You also have ${creditsBalance.toLocaleString()} purchased credits available.` : "Subscribe to a plan or buy credits below to keep creating once your trial is used up."}</p>
          </div>
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
                    planTier={plan.key}
                    sourceApp="marketer"
                    userEmail={user?.email || ""}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Generation Credits */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-1">
          <div>
            <h3 className="font-bold text-foreground flex items-center gap-2"><Sparkles className="w-4 h-4 text-fuchsia-400" /> AI Generation Credits</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Pay-as-you-go credits for AI image &amp; video generations — on top of your plan's monthly allowance, or instead of a subscription.
              1 credit = 1 generation = ${PRICE_PER_CREDIT.toFixed(2)}.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black text-foreground">{creditsBalance.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">credits available</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {CREDIT_PACKS.map(amt => (
            <button key={amt} onClick={() => setCreditAmount(amt)}
              className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${creditAmount === amt ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400" : "border-border text-muted-foreground hover:bg-muted/20"}`}>
              ${amt} <span className="block text-[11px] font-normal opacity-70">{Math.floor(amt / PRICE_PER_CREDIT).toLocaleString()} credits</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1 max-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input type="number" min={10} step={1} value={creditAmount}
              onChange={e => setCreditAmount(Math.max(10, Number(e.target.value) || 0))}
              className="w-full h-10 pl-6 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={() => buyCredits(creditAmount)} disabled={buyingCredits || creditAmount < 10}
            className="flex items-center gap-2 px-5 h-10 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-all shadow-lg shadow-fuchsia-500/20">
            {buyingCredits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Buy {Math.floor(creditAmount / PRICE_PER_CREDIT).toLocaleString()} Credits
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Minimum purchase $10. Any amount $10 or above can be purchased — credits never expire.</p>
      </div>

      {/* Messaging & Email sending */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-bold text-foreground mb-1">Email, SMS &amp; WhatsApp Sending</h3>
        <p className="text-sm text-muted-foreground mb-1">
          Platform-managed sending is included up to your plan's monthly quota, then billed per message.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          <strong className="text-foreground">Agency &amp; Enterprise:</strong> bring your own SendGrid, Twilio, or Meta BSP credentials for zero platform fee — enter them in{" "}
          <Link to="/settings" className="text-fuchsia-400 hover:underline">Settings → API Keys</Link>.
          WhatsApp marketing campaigns require pre-approved message templates (Meta Business API rules). Transactional messages can be sent from your registered sender without pre-approval.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { Icon: Mail, label: "Email", provider: "SendGrid / Resend", rate: "$1.30 / 1,000 emails", byo: "Agency & Enterprise: BYO SendGrid key — $0 platform fee" },
            { Icon: Phone, label: "SMS", provider: "Twilio", rate: "≈ $0.013 / SMS (US)", byo: "Agency & Enterprise: BYO Twilio account — $0 platform fee" },
            { Icon: MessageSquare, label: "WhatsApp", provider: "Meta Cloud API", rate: "≈ $0.013 / conversation (US)", byo: "Agency & Enterprise: BYO Meta BSP token — $0 platform fee" },
          ].map(m => (
            <div key={m.label} className="p-4 rounded-xl border border-border bg-background">
              <div className="flex items-center gap-2 mb-1.5">
                <m.Icon className="w-4 h-4 text-fuchsia-400" />
                <span className="font-semibold text-foreground text-sm">{m.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">via {m.provider}</p>
              <p className="text-sm font-bold text-foreground mb-1">{m.rate}</p>
              <p className="text-xs text-muted-foreground">{m.byo}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Questions? <a href="mailto:care@digitalstudios.app" className="text-fuchsia-400 hover:underline">care@digitalstudios.app</a> · 14-day free trial on Growth plan
      </p>
    </div>
  );
}
