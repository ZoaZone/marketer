import { useState } from "react";
import { Share, Copy, CheckCircle2, DollarSign, Users, TrendingUp, Link2, ExternalLink, Gift } from "lucide-react";
import { useOutletContext } from "react-router-dom";

export default function AffiliatePortal() {
  const { user } = useOutletContext() || {};
  const [copied, setCopied] = useState(false);

  const referralCode = user?.email
    ? `MKT-${user.email.split("@")[0].toUpperCase().slice(0, 8)}`
    : "MKT-YOURCODE";
  const referralLink = `https://agentmarketer.base44.app/?ref=${referralCode}`;

  const copy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const STATS = [
    { label: "Total Referrals", value: "0", Icon: Users, color: "text-fuchsia-400 bg-fuchsia-500/10" },
    { label: "Active Subscribers", value: "0", Icon: TrendingUp, color: "text-emerald-400 bg-emerald-500/10" },
    { label: "Commission Earned", value: "$0.00", Icon: DollarSign, color: "text-amber-400 bg-amber-500/10" },
    { label: "Pending Payout", value: "$0.00", Icon: Gift, color: "text-purple-400 bg-purple-500/10" },
  ];

  const TIERS = [
    { name: "Starter Affiliate", threshold: "1-4 referrals", commission: "20%", color: "border-white/10" },
    { name: "Pro Affiliate", threshold: "5-19 referrals", commission: "25%", color: "border-fuchsia-500/30", popular: true },
    { name: "Elite Affiliate", threshold: "20+ referrals", commission: "30%", color: "border-white/10" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Share className="w-6 h-6 text-fuchsia-400" /> Affiliate Portal
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Earn recurring commissions by referring new users to Agent Marketer</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATS.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center mb-3`}>
              <s.Icon className="w-4 h-4" />
            </div>
            <div className="text-2xl font-black text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="bg-card border border-fuchsia-500/20 rounded-2xl p-5">
        <h2 className="font-bold text-sm text-foreground mb-1 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-fuchsia-400" /> Your Referral Link
        </h2>
        <p className="text-xs text-muted-foreground mb-3">Share this link — you earn commission on every paying subscriber</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2.5 rounded-xl bg-muted text-sm text-muted-foreground font-mono truncate border border-border">
            {referralLink}
          </div>
          <button onClick={copy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap">
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">Referral code: <span className="font-mono text-fuchsia-400">{referralCode}</span></p>
      </div>

      {/* Commission tiers */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Commission Tiers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIERS.map(t => (
            <div key={t.name} className={`bg-card border rounded-2xl p-5 ${t.popular ? "border-fuchsia-500/40 shadow-sm shadow-fuchsia-500/10" : t.color}`}>
              {t.popular && <div className="text-xs font-bold text-fuchsia-400 mb-2 uppercase tracking-widest">Most Common</div>}
              <div className="text-3xl font-black text-foreground mb-1">{t.commission}</div>
              <div className="text-sm font-semibold text-foreground">{t.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.threshold}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Commissions are recurring — you earn every month your referral stays subscribed. Payouts processed monthly via PayPal or bank transfer.</p>
      </div>

      {/* How it works */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-bold text-sm text-foreground mb-4">How It Works</h2>
        <div className="space-y-3">
          {[
            { step: "1", text: "Share your unique referral link on social media, email, or your website" },
            { step: "2", text: "When someone signs up using your link and subscribes to any plan" },
            { step: "3", text: "You earn a recurring commission every month they remain a subscriber" },
            { step: "4", text: "Track your referrals, earnings, and request payouts right here" },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-fuchsia-500/10 text-fuchsia-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{s.step}</div>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
