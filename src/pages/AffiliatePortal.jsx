import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Share, Copy, CheckCircle2, DollarSign, Users, TrendingUp, Link2, Gift,
  Loader2, Mail, CreditCard, ExternalLink, UserPlus, AlertCircle, Clock, Wallet,
} from "lucide-react";

function invoke(name, body) {
  return base44.functions.invoke(name, body).then(r => r?.data ?? r);
}

export default function AffiliatePortal() {
  const { user } = useOutletContext() || {};
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Invite acceptance — the invite email links to /affiliate?invite_token=...
  const [inviteToken, setInviteToken] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("invite_token");
    if (t) setInviteToken(t);
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["affiliate_dashboard", user?.email],
    queryFn: () => invoke("affiliateDashboardData", {}),
    enabled: !!user?.email,
  });

  const acceptInvite = async () => {
    setAccepting(true);
    setAcceptError("");
    try {
      const res = await invoke("acceptAffiliateInvite", { token: inviteToken });
      if (!res?.success) throw new Error(res?.error || "Could not accept this invite.");
      if (res.onboarding_url) setOnboardingUrl(res.onboarding_url);
      setInviteToken(null);
      window.history.replaceState({}, "", "/affiliate");
      qc.invalidateQueries({ queryKey: ["affiliate_dashboard"] });
    } catch (e) {
      setAcceptError(e.message);
    }
    setAccepting(false);
  };

  const referralLink = data?.affiliate?.code ? `${window.location.origin}/?ref=${data.affiliate.code}` : "";

  const copy = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inviteToken) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-card border border-fuchsia-500/20 rounded-2xl p-8 text-center space-y-4">
          <Gift className="w-10 h-10 text-fuchsia-400 mx-auto" />
          <h1 className="text-xl font-black text-foreground">You've been invited to become an affiliate</h1>
          <p className="text-sm text-muted-foreground">Accept to activate your account, get your unique referral code, and start earning commission.</p>
          {acceptError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-left">
              <AlertCircle className="w-4 h-4 shrink-0" /> {acceptError}
            </div>
          )}
          <button onClick={acceptInvite} disabled={accepting}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {accepting ? "Activating…" : "Accept & Activate"}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!data?.is_affiliate) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Share className="w-6 h-6 text-fuchsia-400" /> Affiliate Portal
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Earn commission by referring new subscribers.</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
          <Gift className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-semibold text-foreground">You're not an affiliate yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">Affiliates are invited by our team, or by an existing affiliate. Apply on the Agent Program page and we'll follow up if you're a fit.</p>
          <a href="/agent-program" className="inline-flex items-center gap-1 text-xs font-semibold text-fuchsia-400 hover:underline">Apply on Agent Program →</a>
        </div>
      </div>
    );
  }

  const { affiliate, clicks, conversions, commissions, sub_affiliates: subAffiliates, payouts, pending_invites: pendingInvites } = data;
  const isTier1 = affiliate.tier === 1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Share className="w-6 h-6 text-fuchsia-400" /> Affiliate Portal
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {isTier1 ? `Tier-1 affiliate · ${affiliate.commission_pct}% of every sale you refer` : `Sub-affiliate · ${affiliate.effective_pool_pct?.toFixed(1)}% of every sale you refer`}
        </p>
      </div>

      {onboardingUrl && (
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <p className="text-sm text-foreground">Finish connecting your payout account to receive commissions.</p>
          <a href={onboardingUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-semibold hover:opacity-90 shrink-0">
            Finish on Stripe <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Clicks", value: clicks, Icon: Users, color: "text-fuchsia-400 bg-fuchsia-500/10" },
          { label: "Conversions", value: conversions, Icon: TrendingUp, color: "text-emerald-400 bg-emerald-500/10" },
          { label: "Total Earned", value: `$${(affiliate.total_earned || 0).toFixed(2)}`, Icon: DollarSign, color: "text-amber-400 bg-amber-500/10" },
          { label: "Pending Payout", value: `$${(affiliate.balance_due || 0).toFixed(2)}`, Icon: Gift, color: "text-purple-400 bg-purple-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center mb-3`}><s.Icon className="w-4 h-4" /></div>
            <div className="text-2xl font-black text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="bg-card border border-fuchsia-500/20 rounded-2xl p-5">
        <h2 className="font-bold text-sm text-foreground mb-1 flex items-center gap-2"><Link2 className="w-4 h-4 text-fuchsia-400" /> Your Referral Link</h2>
        <p className="text-xs text-muted-foreground mb-3">Share this link — you earn commission on every paying subscriber</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2.5 rounded-xl bg-muted text-sm text-muted-foreground font-mono truncate border border-border">{referralLink}</div>
          <button onClick={copy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap">
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">Referral code: <span className="font-mono text-fuchsia-400">{affiliate.code}</span></p>
      </div>

      <PayoutCard affiliate={affiliate} onUpdated={refetch} />

      {isTier1 && <InviteSubAffiliateCard affiliate={affiliate} pendingInvites={pendingInvites} onInvited={refetch} />}

      {isTier1 && subAffiliates?.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Your Sub-Affiliates</div>
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/20 border-b border-border">{["Code", "Status", "Share of your pool", "Effective rate", "Earned"].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {subAffiliates.map(s => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{s.code}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{s.status}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.commission_pct}%</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{(s.effective_pool_pct || 0).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-foreground font-medium">${(s.total_earned || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Commission ledger */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Commission History</div>
        {commissions?.length ? (
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/20 border-b border-border">{["Plan", "Sale", "Role", "%", "Amount", "Status"].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {commissions.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 text-foreground">{c.plan}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">${(c.sale_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{c.role}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.pct_applied}%</td>
                  <td className="px-4 py-2.5 text-foreground font-medium">${(c.amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-center py-8 text-muted-foreground text-sm">No commissions yet</div>}
      </div>

      {/* Payout history */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Payout History</div>
        {payouts?.length ? (
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/20 border-b border-border">{["Period", "Amount", "Status", "Paid"].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {payouts.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-foreground">{p.period}</td>
                  <td className="px-4 py-2.5 text-foreground font-medium">${(p.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="text-center py-8 text-muted-foreground text-sm">No payouts yet</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: "bg-amber-500/10 text-amber-400",
    approved: "bg-cyan-500/10 text-cyan-400",
    paid: "bg-emerald-500/10 text-emerald-400",
    clawed_back: "bg-red-500/10 text-red-400",
    processing: "bg-amber-500/10 text-amber-400",
    failed: "bg-red-500/10 text-red-400",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${map[status] || "bg-muted text-muted-foreground"}`}>{status?.replace(/_/g, " ")}</span>;
}

function PayoutCard({ affiliate, onUpdated }) {
  const [mode, setMode] = useState(null); // "paypal" | null
  const [paypalEmail, setPaypalEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connectStripe = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await invoke("updateAffiliatePayout", { method: "stripe_connect" });
      if (!res?.success) throw new Error(res?.error || "Could not connect Stripe.");
      if (res.onboarding_url) window.open(res.onboarding_url, "_blank", "noopener,noreferrer");
      onUpdated();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const connectPaypal = async () => {
    if (!paypalEmail.includes("@")) { setError("Enter a valid PayPal email."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await invoke("updateAffiliatePayout", { method: "paypal", paypal_email: paypalEmail });
      if (!res?.success) throw new Error(res?.error || "Could not save your PayPal email.");
      setMode(null);
      setPaypalEmail("");
      onUpdated();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <h2 className="font-bold text-sm text-foreground flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-400" /> Payout Method</h2>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          {affiliate.payout_method === "stripe_connect" && affiliate.payout_account_ref ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><CheckCircle2 className="w-4 h-4" /> Stripe Connect · {affiliate.payout_account_ref}</span>
          ) : affiliate.payout_method === "paypal" && affiliate.payout_account_ref ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><CheckCircle2 className="w-4 h-4" /> PayPal · {affiliate.payout_account_ref}</span>
          ) : (
            <span className="text-muted-foreground">Not connected yet — payouts can't be sent until you connect a method.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={connectStripe} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />} Connect Stripe
          </button>
          <button onClick={() => setMode(m => m === "paypal" ? null : "paypal")} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Use PayPal instead</button>
        </div>
      </div>
      {mode === "paypal" && (
        <div className="flex items-center gap-2 pt-1">
          <input value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)} placeholder="you@paypal-email.com"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-cyan-500/50" />
          <button onClick={connectPaypal} disabled={busy} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-semibold disabled:opacity-50">Save</button>
        </div>
      )}
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
      <p className="text-[11px] text-muted-foreground">We never see or store your bank details — Stripe Connect and PayPal handle your account setup and identity verification directly.</p>
    </div>
  );
}

function InviteSubAffiliateCard({ affiliate, pendingInvites, onInvited }) {
  const [email, setEmail] = useState("");
  const [sharePct, setSharePct] = useState(50);
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const pool = affiliate.commission_pct || 0;
  const subRate = (pool * sharePct) / 100;
  const yourOverride = pool - subRate;

  const invite = async () => {
    if (!email.includes("@")) { setError("Enter a valid email."); return; }
    setInviting(true);
    setError("");
    setResult(null);
    try {
      const res = await invoke("createAffiliateInvite", { email, proposed_tier: 2, proposed_share_pct: sharePct });
      if (!res?.success) throw new Error(res?.error || "Could not create invite.");
      try {
        await invoke("sendEmailFallback", {
          to: email,
          subject: "You're invited to become a sub-affiliate",
          text: `You've been invited to join as a sub-affiliate. Accept your invite here: ${res.invite_link}`,
          html: `<p>You've been invited to join as a sub-affiliate.</p><p><a href="${res.invite_link}">Accept your invite →</a></p>`,
        });
      } catch (_) { /* invite record exists either way — email is best-effort */ }
      setResult(res.invite_link);
      setEmail("");
      onInvited();
    } catch (e) { setError(e.message); }
    setInviting(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-sm text-foreground flex items-center gap-2"><UserPlus className="w-4 h-4 text-fuchsia-400" /> Invite a Sub-Affiliate</h2>
      <p className="text-xs text-muted-foreground">Give away a share of your own {pool}% pool — you keep the rest as an override on every sale they refer.</p>

      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="sub-affiliate@example.com"
          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-fuchsia-500/50" />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Share of your pool</span>
          <span className="font-semibold text-foreground">{sharePct}%</span>
        </div>
        <input type="range" min={1} max={100} value={sharePct} onChange={e => setSharePct(Number(e.target.value))} className="w-full accent-fuchsia-500" />
        <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">Sub-affiliate earns <span className="font-bold text-foreground">{subRate.toFixed(1)}%</span> of sale</div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">You keep <span className="font-bold text-foreground">{yourOverride.toFixed(1)}%</span> as override</div>
        </div>
      </div>

      <button onClick={invite} disabled={inviting || !email}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
        {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Send Invite
      </button>
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
      {result && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Invite sent.</p>}

      {pendingInvites?.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Pending invites</p>
          <div className="space-y-1.5">
            {pendingInvites.map(i => (
              <div key={i.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{i.email}</span>
                <span className="text-muted-foreground">{i.proposed_share_pct}% share · expires {new Date(i.expires_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
