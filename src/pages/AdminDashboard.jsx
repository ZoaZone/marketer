import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Users, Megaphone, BarChart3, DollarSign, Loader2, Search, Gift, Send, CheckCircle2, X, Plus, Link, Copy, UserCheck, Clock, UserX, UserPlus, Handshake, Mail, Ban, RotateCcw, Wallet, AlertCircle } from "lucide-react";
// MRR is computed from the canonical catalog. This used to read a separate
// src/lib/planPrices.js — a fourth hand-maintained copy of the price map,
// kept in sync "by comment discipline", which had already drifted (it still
// called the add-on "BYOK" after the catalog renamed it "BYO Providers").
// A stale copy here silently misreports revenue, so the file was deleted.
import { ALL_PLANS } from "@/config/plans";

const PLAN_PRICES = Object.fromEntries(ALL_PLANS.map(p => [p.key, p.price_monthly]));
const PLAN_NAMES = Object.fromEntries(ALL_PLANS.map(p => [p.key, p.name]));

function invokeFn(name, body) {
  return base44.functions.invoke(name, body).then(r => r?.data ?? r);
}

export default function AdminDashboard() {
  const {user}=useOutletContext()||{};
  const [tab,setTab]=useState("overview");
  const [search,setSearch]=useState("");
  const qc=useQueryClient();

  // Beta invite state
  const [inviteEmails,setInviteEmails]=useState("");
  const [inviteNote,setInviteNote]=useState("");
  const [inviting,setInviting]=useState(false);
  const [inviteResults,setInviteResults]=useState([]);
  const [linkCopied,setLinkCopied]=useState(false);

  // Free trial invite state
  const [freeInviteEmails,setFreeInviteEmails]=useState("");
  const [freeInviteNote,setFreeInviteNote]=useState("");
  const [freeInviting,setFreeInviting]=useState(false);
  const [freeInviteResults,setFreeInviteResults]=useState([]);

  // Affiliate program state
  const [affEmail,setAffEmail]=useState("");
  const [affPoolPct,setAffPoolPct]=useState(30);
  const [creatingAff,setCreatingAff]=useState(false);
  const [affInviteResult,setAffInviteResult]=useState(null);
  const [affInviteError,setAffInviteError]=useState("");
  const [editingPct,setEditingPct]=useState({});
  const [runningPayout,setRunningPayout]=useState(false);
  const [payoutResult,setPayoutResult]=useState(null);

  const isAdmin = user?.role === "admin";
  // These are deliberately platform-wide (admin sees every user's data) —
  // gated on isAdmin so a non-admin's browser never fetches other users'
  // records while the access-denied screen below is rendering.
  const {data:subs=[]}=useQuery({queryKey:["admin_subs"],queryFn:()=>base44.entities.Subscription.filter({},"-created_date",200),enabled:isAdmin});
  const {data:betaRequests=[],refetch:refetchBeta}=useQuery({queryKey:["beta_requests"],queryFn:()=>base44.entities.BetaRequest.filter({},"-created_date",200),enabled:isAdmin});
  const {data:campaigns=[]}=useQuery({queryKey:["admin_campaigns"],queryFn:()=>base44.entities.MarketingCampaign.filter({},"-created_date",200),enabled:isAdmin});
  const {data:leads=[]}=useQuery({queryKey:["admin_leads"],queryFn:()=>base44.entities.LeadCapture.filter({},"-captured_at",500),enabled:isAdmin});
  const {data:contacts=[]}=useQuery({queryKey:["admin_contacts"],queryFn:()=>base44.entities.MarketingContact.filter({},"-created_date",500),enabled:isAdmin});
  const {data:assets=[]}=useQuery({queryKey:["admin_assets"],queryFn:()=>base44.entities.ContentAsset.filter({},"-created_date",200),enabled:isAdmin});
  const {data:affiliates=[],refetch:refetchAffiliates}=useQuery({queryKey:["admin_affiliates"],queryFn:()=>base44.entities.Affiliate.filter({},"-created_date",200),enabled:isAdmin});
  const {data:commissions=[],refetch:refetchCommissions}=useQuery({queryKey:["admin_commissions"],queryFn:()=>base44.entities.Commission.filter({},"-created_date",300),enabled:isAdmin});
  const {data:payoutBatches=[],refetch:refetchPayouts}=useQuery({queryKey:["admin_payout_batches"],queryFn:()=>base44.entities.PayoutBatch.filter({},"-created_date",100),enabled:isAdmin});

  if(user?.role!=="admin") return(
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center"><ShieldCheck className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3"/><p className="text-lg font-semibold text-foreground">Admin Access Required</p></div>
    </div>
  );

  const activeSubs=subs.filter(s=>s.status==="active");
  const mrr=activeSubs.reduce((s,sub)=>s+(PLAN_PRICES[sub.plan_tier]||0),0);
  const totalSent=campaigns.reduce((s,c)=>s+(c.sent_count||0),0);
  const aiCount=assets.filter(a=>a.ai_generated).length;

  const filteredSubs=subs.filter(s=>!search||(s.owner_email||"").toLowerCase().includes(search.toLowerCase()));

  const APP_URL = "https://digitalstudios.app";
  const betaInviteLink = `${APP_URL}/beta`;

  const copyLink = () => {
    navigator.clipboard.writeText(betaInviteLink);
    setLinkCopied(true);
    setTimeout(()=>setLinkCopied(false),2000);
  };

  const sendBetaInvites = async () => {
    const emails = inviteEmails.split(/[\n,;]+/).map(e=>e.trim()).filter(Boolean);
    if (!emails.length) return;
    setInviting(true);
    setInviteResults([]);
    const results = [];
    for (const email of emails) {
      try {
        await base44.functions.invoke("sendBetaInvite", {
          email,
          note: inviteNote || "",
          source: "manual_invite",
        });
        results.push({ email, status: "success" });
      } catch (err) {
        results.push({ email, status: "error", msg: err.message });
      }
    }
    setInviteResults(results);
    setInviting(false);
    qc.invalidateQueries(["admin_subs"]);
  };

  const sendFreeInvites = async () => {
    const emails = freeInviteEmails.split(/[\n,;]+/).map(e=>e.trim()).filter(Boolean);
    if (!emails.length) return;
    setFreeInviting(true);
    setFreeInviteResults([]);
    const results = [];
    for (const email of emails) {
      try {
        await base44.functions.invoke("sendBetaInvite", {
          email,
          note: freeInviteNote || "",
          source: "free_invite",
        });
        results.push({ email, status: "success" });
      } catch (err) {
        results.push({ email, status: "error", msg: err.message });
      }
    }
    setFreeInviteResults(results);
    setFreeInviting(false);
  };

  const approveBetaRequest = async (req) => {
    try {
      // Create subscription
      await base44.entities.Subscription.create({
        owner_email: req.email,
        plan_name: "Beta Pro",
        plan_tier: "agency",
        status: "active",
        current_period_end: new Date(Date.now()+365*24*60*60*1000).toISOString(),
      });
      await base44.functions.invoke("sendBetaInvite", {
        email: req.email,
        full_name: req.full_name || "",
        note: "",
        source: "beta_request_approved",
      });
      await base44.entities.BetaRequest.update(req.id, { status: "approved", invite_sent: true });
      refetchBeta();
      qc.invalidateQueries(["admin_subs"]);
    } catch(err) { alert("Error: "+err.message); }
  };

  const rejectBetaRequest = async (req) => {
    await base44.entities.BetaRequest.update(req.id, { status: "rejected" });
    refetchBeta();
  };

  // ── Affiliate program ──────────────────────────────────────────────────
  const createTier1Affiliate = async () => {
    if (!affEmail.includes("@")) { setAffInviteError("Enter a valid email."); return; }
    setCreatingAff(true);
    setAffInviteError("");
    setAffInviteResult(null);
    try {
      const res = await invokeFn("createAffiliateInvite", { email: affEmail, proposed_tier: 1, proposed_share_pct: affPoolPct });
      if (!res?.success) throw new Error(res?.error || "Could not create invite.");
      try {
        await invokeFn("sendEmailFallback", {
          to: affEmail,
          subject: "You're invited to become an affiliate",
          text: `You've been invited to join our affiliate program at a ${affPoolPct}% commission rate. Accept here: ${res.invite_link}`,
          html: `<p>You've been invited to join our affiliate program at a <strong>${affPoolPct}%</strong> commission rate.</p><p><a href="${res.invite_link}">Accept your invite →</a></p>`,
        });
      } catch (_) { /* invite record exists either way — email is best-effort */ }
      setAffInviteResult(res.invite_link);
      setAffEmail("");
    } catch (e) { setAffInviteError(e.message); }
    setCreatingAff(false);
  };

  const saveAffiliatePct = async (aff) => {
    const val = Number(editingPct[aff.id]);
    if (!Number.isFinite(val) || val <= 0 || val > 100) { alert("Enter a valid % between 1 and 100."); return; }
    await base44.entities.Affiliate.update(aff.id, { commission_pct: val, effective_pool_pct: aff.tier === 1 ? val : aff.effective_pool_pct });
    if (aff.tier === 1) {
      // A tier-1 pool change must cascade to every existing sub-affiliate's
      // stored effective_pool_pct (their share % of the pool is unchanged,
      // but the pool itself just moved) — otherwise their split math goes
      // stale against the new pool.
      const subs = affiliates.filter(a => a.parent_affiliate_id === aff.id);
      for (const sub of subs) {
        await base44.entities.Affiliate.update(sub.id, { effective_pool_pct: (val * (sub.commission_pct || 0)) / 100 });
      }
    }
    setEditingPct(p => { const n = { ...p }; delete n[aff.id]; return n; });
    refetchAffiliates();
  };

  const toggleSuspend = async (aff) => {
    await base44.entities.Affiliate.update(aff.id, { status: aff.status === "suspended" ? "active" : "suspended" });
    refetchAffiliates();
  };

  const approveCommission = async (c) => {
    await base44.entities.Commission.update(c.id, { status: "approved" });
    refetchCommissions();
  };

  const clawbackCommission = async (c) => {
    if (!confirm("Claw back this commission? This reverses it — it will never be paid out.")) return;
    await base44.entities.Commission.update(c.id, { status: "clawed_back" });
    const affMatches = affiliates.filter(a => a.id === c.affiliate_id);
    if (affMatches[0]) {
      const aff = affMatches[0];
      await base44.entities.Affiliate.update(aff.id, { balance_due: Math.max(0, (aff.balance_due || 0) - (c.amount || 0)) });
    }
    refetchCommissions();
    refetchAffiliates();
  };

  const triggerPayoutBatch = async () => {
    setRunningPayout(true);
    setPayoutResult(null);
    try {
      const res = await invokeFn("runPayoutBatch", {});
      setPayoutResult(res?.batches || []);
      refetchCommissions();
      refetchAffiliates();
      refetchPayouts();
    } catch (e) { setPayoutResult([{ status: "failed", error: e.message }]); }
    setRunningPayout(false);
  };

  const Stat=({Icon,label,value,color="text-fuchsia-400 bg-fuchsia-500/10"})=>(
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-3`}><Icon className={`w-4 h-4 ${color.split(" ")[0]}`}/></div>
      <div className="text-2xl font-black text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );

  return(
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-fuchsia-400"/>
        <div><h1 className="text-2xl font-black text-foreground">Admin Dashboard</h1><p className="text-muted-foreground text-sm">DigitalStudios.app platform overview</p></div>
      </div>

      <div className="flex gap-2 border-b border-border pb-1">
        {[{v:"overview",l:"Overview"},{v:"subscribers",l:"Subscribers"},{v:"activity",l:"Activity"},{v:"affiliates",l:"🤝 Affiliates"},{v:"beta",l:"🎁 Beta Invites"},{v:"freeinvite",l:"🚀 Free Trial Invites"}].map(t=>(
          <button key={t.v} onClick={()=>setTab(t.v)} className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${tab===t.v?"text-fuchsia-400 border-b-2 border-fuchsia-500":"text-muted-foreground hover:text-foreground"}`}>{t.l}</button>
        ))}
      </div>

      {tab==="overview"&&(
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat Icon={Users} label="Active Subscribers" value={activeSubs.length}/>
            <Stat Icon={DollarSign} label="Platform MRR" value={`$${mrr.toLocaleString()}`} color="text-emerald-400 bg-emerald-500/10"/>
            <Stat Icon={Megaphone} label="Messages Sent" value={totalSent.toLocaleString()} color="text-purple-400 bg-purple-500/10"/>
            <Stat Icon={BarChart3} label="AI Generations" value={aiCount} color="text-amber-400 bg-amber-500/10"/>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat Icon={Users} label="Total Contacts" value={contacts.length} color="text-blue-400 bg-blue-500/10"/>
            <Stat Icon={Users} label="Total Leads" value={leads.length} color="text-pink-400 bg-pink-500/10"/>
            <Stat Icon={Megaphone} label="Total Campaigns" value={campaigns.length} color="text-orange-400 bg-orange-500/10"/>
            <Stat Icon={DollarSign} label="All Subscriptions" value={subs.length} color="text-cyan-400 bg-cyan-500/10"/>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold text-foreground mb-4">Plan Breakdown</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {Object.keys(PLAN_PRICES).map(tier=>{
                const cnt=activeSubs.filter(s=>s.plan_tier===tier).length;
                return(<div key={tier} className="text-center p-4 border border-border rounded-xl">
                  <div className="text-2xl font-black text-foreground">{cnt}</div>
                  <div className="text-xs text-muted-foreground">{PLAN_NAMES[tier]}</div>
                  <div className="text-xs text-emerald-400 mt-0.5">${(cnt*(PLAN_PRICES[tier]||0)).toLocaleString()}/mo</div>
                </div>);
              })}
            </div>
          </div>
        </div>
      )}

      {tab==="subscribers"&&(
        <div className="space-y-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subscribers…" className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none"/></div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/20 border-b border-border">{["Email","Plan","Status","Joined"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {filteredSubs.slice(0,50).map(s=>(
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-sm text-foreground">{s.owner_email}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-fuchsia-500/10 text-fuchsia-400 px-2 py-0.5 rounded-full font-medium">{s.plan_name||"Free"}</span></td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${s.status==="active"?"bg-emerald-500/10 text-emerald-400":"bg-muted text-muted-foreground"}`}>{s.status}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.created_date?new Date(s.created_date).toLocaleDateString():""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSubs.length===0&&<div className="text-center py-8 text-muted-foreground text-sm">No subscribers found</div>}
          </div>
        </div>
      )}

      {tab==="beta"&&(
        <div className="space-y-5 max-w-2xl">
          <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-2xl p-5 flex gap-3 items-start">
            <Gift className="w-5 h-5 text-fuchsia-400 mt-0.5 shrink-0"/>
            <div>
              <p className="text-sm font-bold text-foreground">Free Beta Invites — Full Agency Access</p>
              <p className="text-xs text-muted-foreground mt-1">Share the invite link or manually email users. Approved users get a welcome email with a sign-up link and Agency-tier access waiting for them.</p>
            </div>
          </div>

          {/* Shareable invite link */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Link className="w-3.5 h-3.5"/>Shareable Beta Signup Link</p>
            <p className="text-[11px] text-muted-foreground">Share this link on social media, WhatsApp, email, etc. Interested users fill a form and you approve them from the Pending Requests section below.</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground flex items-center truncate font-mono text-xs">
                {betaInviteLink}
              </div>
              <button onClick={copyLink} className={`flex items-center gap-1.5 px-3 h-9 rounded-md text-xs font-semibold transition-all border ${linkCopied?"bg-emerald-500/10 text-emerald-400 border-emerald-500/20":"bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20 hover:bg-fuchsia-500/20"}`}>
                {linkCopied?<><CheckCircle2 className="w-3.5 h-3.5"/>Copied!</>:<><Copy className="w-3.5 h-3.5"/>Copy Link</>}
              </button>
            </div>
          </div>

          {/* Pending beta requests */}
          {betaRequests.length>0&&(
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-400"/>Beta Requests</p>
                <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">{betaRequests.filter(r=>r.status==="pending").length} pending</span>
              </div>
              {betaRequests.map(r=>(
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.email}{r.company?` · ${r.company}`:""}</p>
                    {r.use_case&&<p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{r.use_case}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${r.status==="approved"?"bg-emerald-500/10 text-emerald-400":r.status==="rejected"?"bg-red-500/10 text-red-400":"bg-amber-500/10 text-amber-400"}`}>{r.status}</span>
                  {r.status==="pending"&&(
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={()=>approveBetaRequest(r)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors">
                        <UserCheck className="w-3.5 h-3.5"/>Approve
                      </button>
                      <button onClick={()=>rejectBetaRequest(r)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
                        <UserX className="w-3.5 h-3.5"/>Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Plus className="w-3.5 h-3.5"/>Email Addresses</label>
              <textarea
                value={inviteEmails}
                onChange={e=>setInviteEmails(e.target.value)}
                rows={5}
                placeholder={"user1@example.com\nuser2@example.com\nor comma-separated: a@b.com, c@d.com"}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Enter one email per line, or comma/semicolon separated.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Personal Note (optional)</label>
              <textarea
                value={inviteNote}
                onChange={e=>setInviteNote(e.target.value)}
                rows={2}
                placeholder="e.g. We'd love your feedback as an early tester…"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="text-[11px] text-muted-foreground">This note is included in the welcome email sent to each invitee.</p>
            </div>

            <button
              onClick={sendBetaInvites}
              disabled={inviting||!inviteEmails.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-all shadow-lg shadow-fuchsia-500/20">
              {inviting?<><Loader2 className="w-4 h-4 animate-spin"/>Sending Invites…</>:<><Send className="w-4 h-4"/>Send Beta Invites</>}
            </button>
          </div>

          {inviteResults.length>0&&(
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Invite Results</div>
              {inviteResults.map((r,i)=>(
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  {r.status==="success"
                    ?<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>
                    :<X className="w-4 h-4 text-red-400 shrink-0"/>}
                  <span className="text-sm text-foreground flex-1">{r.email}</span>
                  {r.status==="success"
                    ?<span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Invited ✓</span>
                    :<span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full truncate max-w-[200px]">{r.msg}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="freeinvite"&&(
        <div className="space-y-5 max-w-2xl">
          <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-5 flex gap-3 items-start">
            <UserPlus className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0"/>
            <div>
              <p className="text-sm font-bold text-foreground">Free Trial Invites — Standard Free Account</p>
              <p className="text-xs text-muted-foreground mt-1">Invite users to try DigitalStudios.app with a no-credit-card free trial: 25 free AI generations (1 = one AI image or one voiceover up to 1,500 characters), full platform access apart from the paid Studio & Dubbing features, and an in-app prompt to subscribe once the trial limit is reached.</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Plus className="w-3.5 h-3.5"/>Email Addresses</label>
              <textarea
                value={freeInviteEmails}
                onChange={e=>setFreeInviteEmails(e.target.value)}
                rows={5}
                placeholder={"user1@example.com\nuser2@example.com\nor comma-separated: a@b.com, c@d.com"}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Enter one email per line, or comma/semicolon separated.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Personal Note (optional)</label>
              <textarea
                value={freeInviteNote}
                onChange={e=>setFreeInviteNote(e.target.value)}
                rows={2}
                placeholder="e.g. Thanks for your interest — here's your free trial…"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="text-[11px] text-muted-foreground">This note is included in the welcome email sent to each invitee.</p>
            </div>

            <button
              onClick={sendFreeInvites}
              disabled={freeInviting||!freeInviteEmails.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20">
              {freeInviting?<><Loader2 className="w-4 h-4 animate-spin"/>Sending Invites…</>:<><Send className="w-4 h-4"/>Send Free Trial Invites</>}
            </button>
          </div>

          {freeInviteResults.length>0&&(
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Invite Results</div>
              {freeInviteResults.map((r,i)=>(
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  {r.status==="success"
                    ?<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>
                    :<X className="w-4 h-4 text-red-400 shrink-0"/>}
                  <span className="text-sm text-foreground flex-1">{r.email}</span>
                  {r.status==="success"
                    ?<span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Invited ✓</span>
                    :<span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full truncate max-w-[200px]">{r.msg}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="affiliates"&&(
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-2xl p-5 flex gap-3 items-start">
            <Handshake className="w-5 h-5 text-fuchsia-400 mt-0.5 shrink-0"/>
            <div>
              <p className="text-sm font-bold text-foreground">2-Tier Affiliate Program</p>
              <p className="text-xs text-muted-foreground mt-1">Create tier-1 affiliates with a commission % (their pool). Each tier-1 affiliate can invite their own sub-affiliates and share a slice of their pool — the server enforces that a sub's share can never exceed 100% of the parent's pool, so no one can mint commission you didn't authorize.</p>
            </div>
          </div>

          {/* Create tier-1 affiliate */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 max-w-xl">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5"/>Create Tier-1 Affiliate</p>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0"/>
              <input value={affEmail} onChange={e=>setAffEmail(e.target.value)} placeholder="affiliate@example.com" className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none"/>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground shrink-0">Commission pool %</label>
              <input type="number" min={1} max={100} value={affPoolPct} onChange={e=>setAffPoolPct(Number(e.target.value)||0)} className="w-24 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none"/>
            </div>
            <button onClick={createTier1Affiliate} disabled={creatingAff||!affEmail} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-all">
              {creatingAff?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>} Send Invite
            </button>
            {affInviteError&&<p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/>{affInviteError}</p>}
            {affInviteResult&&<p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/>Invite sent.</p>}
          </div>

          {/* Affiliate roster */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Affiliates ({affiliates.length})</div>
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/20 border-b border-border">{["Code","User","Tier","Parent","Commission %","Effective %","Status","Earned","Balance","Actions"].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {affiliates.map(a=>{
                  const parent = affiliates.find(p=>p.id===a.parent_affiliate_id);
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-mono text-xs text-foreground whitespace-nowrap">{a.code}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{a.user_id}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{a.tier}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{parent?.code||"—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input type="number" min={1} max={100} value={editingPct[a.id] ?? a.commission_pct ?? 0}
                            onChange={e=>setEditingPct(p=>({...p,[a.id]:e.target.value}))}
                            className="w-16 h-7 px-1.5 rounded border border-input bg-background text-xs focus:outline-none"/>
                          {String(editingPct[a.id] ?? a.commission_pct) !== String(a.commission_pct) && (
                            <button onClick={()=>saveAffiliatePct(a)} className="text-[10px] px-1.5 py-1 rounded bg-fuchsia-500/10 text-fuchsia-400 font-semibold hover:bg-fuchsia-500/20">Save</button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{(a.effective_pool_pct||0).toFixed(1)}%</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${a.status==="active"?"bg-emerald-500/10 text-emerald-400":a.status==="suspended"?"bg-red-500/10 text-red-400":"bg-amber-500/10 text-amber-400"}`}>{a.status}</span></td>
                      <td className="px-3 py-2 text-xs text-foreground font-medium">${(a.total_earned||0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-foreground font-medium">${(a.balance_due||0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button onClick={()=>toggleSuspend(a)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors ${a.status==="suspended"?"bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20":"bg-red-500/10 text-red-400 hover:bg-red-500/20"}`}>
                          {a.status==="suspended"?<><RotateCcw className="w-3 h-3"/>Reactivate</>:<><Ban className="w-3 h-3"/>Suspend</>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {affiliates.length===0&&<div className="text-center py-8 text-muted-foreground text-sm">No affiliates yet</div>}
          </div>

          {/* Commission ledger */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">Commission Ledger ({commissions.length})</div>
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/20 border-b border-border">{["Plan","Sale","Affiliate","Role","%","Amount","Status","Actions"].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {commissions.map(c=>{
                  const aff = affiliates.find(a=>a.id===c.affiliate_id);
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2 text-xs text-foreground">{c.plan}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">${(c.sale_amount||0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{aff?.code||c.affiliate_id}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground capitalize">{c.role}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.pct_applied}%</td>
                      <td className="px-3 py-2 text-xs text-foreground font-medium">${(c.amount||0).toFixed(2)}</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${c.status==="paid"?"bg-emerald-500/10 text-emerald-400":c.status==="approved"?"bg-cyan-500/10 text-cyan-400":c.status==="clawed_back"?"bg-red-500/10 text-red-400":"bg-amber-500/10 text-amber-400"}`}>{c.status.replace(/_/g," ")}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {c.status==="pending"&&<button onClick={()=>approveCommission(c)} className="text-xs px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 font-medium hover:bg-cyan-500/20">Approve</button>}
                          {(c.status==="pending"||c.status==="approved")&&<button onClick={()=>clawbackCommission(c)} className="text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20">Claw back</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {commissions.length===0&&<div className="text-center py-8 text-muted-foreground text-sm">No commissions yet</div>}
          </div>

          {/* Payout batches */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5"/>Run Payout Batch</p>
              <button onClick={triggerPayoutBatch} disabled={runningPayout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white text-xs font-semibold disabled:opacity-60 hover:opacity-90 transition-all">
                {runningPayout?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<DollarSign className="w-3.5 h-3.5"/>} Pay All Approved Balances
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Pays every affiliate with an <strong className="text-foreground">approved</strong> balance via their connected rail (Stripe Connect or PayPal). Pending commissions are left untouched until approved above.</p>
            {payoutResult&&(
              <div className="space-y-1.5">
                {payoutResult.map((r,i)=>(
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.status==="paid"?<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400"/>:<X className="w-3.5 h-3.5 text-red-400"/>}
                    <span className="text-foreground">{affiliates.find(a=>a.id===r.affiliate_id)?.code||r.affiliate_id||"—"}</span>
                    <span className="text-muted-foreground">${(r.total||0).toFixed(2)}</span>
                    {r.error&&<span className="text-red-400 truncate">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">{["Period","Affiliate","Amount","Status","Paid"].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {payoutBatches.map(b=>(
                    <tr key={b.id}>
                      <td className="px-3 py-2 text-xs text-foreground">{b.period}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{affiliates.find(a=>a.id===b.affiliate_id)?.code||b.affiliate_id}</td>
                      <td className="px-3 py-2 text-xs text-foreground font-medium">${(b.total_amount||0).toFixed(2)}</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${b.status==="paid"?"bg-emerald-500/10 text-emerald-400":b.status==="failed"?"bg-red-500/10 text-red-400":"bg-amber-500/10 text-amber-400"}`}>{b.status}</span></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{b.paid_at?new Date(b.paid_at).toLocaleDateString():"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payoutBatches.length===0&&<div className="text-center py-6 text-muted-foreground text-sm">No payout batches yet</div>}
            </div>
          </div>
        </div>
      )}

      {tab==="activity"&&(
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {campaigns.slice(0,20).map(c=>(
            <div key={c.id} className="flex items-center gap-3 px-5 py-3">
              <Megaphone className="w-4 h-4 text-fuchsia-400 flex-shrink-0"/>
              <div className="flex-1"><p className="text-sm font-medium text-foreground">{c.name}</p><p className="text-xs text-muted-foreground">{c.type} · {c.sent_count||0} sent</p></div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${c.status==="running"?"bg-emerald-500/10 text-emerald-400":"bg-muted text-muted-foreground"}`}>{c.status}</span>
            </div>
          ))}
          {campaigns.length===0&&<div className="text-center py-8 text-muted-foreground text-sm">No activity yet</div>}
        </div>
      )}
    </div>
  );
}