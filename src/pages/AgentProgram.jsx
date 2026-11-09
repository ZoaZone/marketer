import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Handshake, DollarSign, Users, TrendingUp, CheckCircle2,
  ArrowRight, Loader2, Sparkles, Star, Zap, Gift, ChevronRight
} from "lucide-react";

const BENEFITS = [
  { icon: DollarSign, title: "50% Recurring Commission", desc: "Earn 50% of every subscription payment from clients you refer — every month, for life.", color: "from-emerald-500 to-teal-600" },
  { icon: Users, title: "Unlimited Referrals", desc: "No cap on earnings. Refer as many businesses as you want and scale your income.", color: "from-fuchsia-500 to-purple-600" },
  { icon: TrendingUp, title: "Real-Time Dashboard", desc: "Track your referrals, commissions, and payouts live in your Agent Dashboard.", color: "from-blue-500 to-indigo-600" },
  { icon: Gift, title: "Free Agency-Tier Access", desc: "All approved agents receive full Agency-tier platform access at no cost.", color: "from-amber-500 to-orange-600" },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Apply & Get Approved", desc: "Fill out the form below. Our team reviews and approves within 48 hours." },
  { step: "02", title: "Get Your Unique Link", desc: "Receive a personalized referral link and marketing materials to share." },
  { step: "03", title: "Refer Businesses", desc: "Share with marketers, agencies, brands — anyone who needs a marketing OS." },
  { step: "04", title: "Earn 50% Forever", desc: "Collect 50% recurring commission every time your referral is billed." },
];

const PLANS = [
  { name: "Starter", price: 49, commission: 24.50 },
  { name: "Growth", price: 149, commission: 74.50 },
  { name: "Agency", price: 399, commission: 199.50 },
];

export default function AgentProgram() {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company: "", audience: "", experience: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email) { setError("Name and email are required."); return; }
    setError("");
    setLoading(true);
    try {
      await base44.entities.BetaRequest.create({
        full_name: form.full_name,
        email: form.email,
        company: form.company || "",
        use_case: `AGENT APPLICATION | Phone: ${form.phone} | Audience: ${form.audience} | Experience: ${form.experience}`,
        status: "pending",
        note: "Agent program application",
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="border-b border-white/8 px-6 h-16 flex items-center justify-between max-w-7xl mx-auto">
        <Link to="/" className="text-lg font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
          media.aevoice.ai
        </Link>
        <Link to="/dashboard" className="text-sm text-white/60 hover:text-white transition-colors">Sign In</Link>
      </nav>

      {/* Hero */}
      <section className="relative py-24 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-fuchsia-500/8 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 text-xs font-semibold mb-8">
            <Handshake className="w-3.5 h-3.5" /> Agent Partner Program
          </div>
          <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
            Earn <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">50% commission</span><br />
            on every referral.
          </h1>
          <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto leading-relaxed">
            Become an approved AEVOICE Agent. Refer businesses to media.aevoice.ai and earn 50% recurring commission — every month, for life.
          </p>
          <a href="#apply" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-base hover:opacity-90 transition-opacity shadow-2xl shadow-fuchsia-500/30">
            Apply to Become an Agent <ArrowRight className="w-5 h-5" />
          </a>
          <p className="text-xs text-white/30 mt-4">Free to join · Approval within 48 hours · No monthly fees</p>
        </div>
      </section>

      {/* Commission Calculator */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-3">Your earnings potential</h2>
          <p className="text-white/40 text-center text-sm mb-10">See how much you could earn per referral each month</p>
          <div className="grid md:grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <div key={plan.name} className="p-6 rounded-2xl border border-white/10 bg-white/3 text-center hover:border-fuchsia-500/30 transition-all">
                <p className="text-white/50 text-sm mb-1">{plan.name} Plan</p>
                <p className="text-white/40 text-xs mb-4">${plan.price}/month per client</p>
                <div className="text-4xl font-black text-emerald-400 mb-1">${plan.commission.toFixed(2)}</div>
                <p className="text-white/40 text-xs">per client/month</p>
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <p className="text-emerald-400 text-xs font-semibold">10 clients = <span className="text-emerald-300 font-black">${(plan.commission * 10).toFixed(0)}/mo</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">Why agents love this program</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {BENEFITS.map(b => (
              <div key={b.title} className="flex gap-4 p-6 rounded-2xl border border-white/8 bg-white/3 hover:border-white/15 transition-all">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${b.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <b.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">{b.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">How it works</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative text-center p-5 rounded-2xl border border-white/8 bg-white/3">
                <div className="text-4xl font-black text-fuchsia-500/20 mb-3">{step.step}</div>
                <h3 className="font-bold text-white text-sm mb-2">{step.title}</h3>
                <p className="text-white/40 text-xs leading-relaxed">{step.desc}</p>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ChevronRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="py-20 px-6">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Apply Now — Free to Join
            </div>
            <h2 className="text-3xl font-black text-white mb-3">Become an Agent</h2>
            <p className="text-white/40 text-sm">Fill out the form and our team will review your application within 48 hours.</p>
          </div>

          {submitted ? (
            <div className="text-center p-10 rounded-3xl border border-emerald-500/30 bg-emerald-500/8">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-2xl font-black text-white mb-2">Application Received!</h3>
              <p className="text-white/50 text-sm mb-6">We'll review your application and email you within 48 hours with next steps and your referral link.</p>
              <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/20 transition-colors">
                Back to Home <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
              {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5 text-red-400 text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-white/50 block mb-1.5">Full Name *</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Sarah Johnson"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 block mb-1.5">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="you@example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">Phone / WhatsApp</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">Company / Brand</label>
                  <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="Your agency or business"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">Describe your audience / network</label>
                  <textarea value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                    rows={3} placeholder="e.g. I manage a community of 500+ small business owners on Instagram..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">Marketing / affiliate experience</label>
                  <select value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50">
                    <option value="" className="bg-[#1a1a2e]">Select experience level…</option>
                    <option value="new" className="bg-[#1a1a2e]">New to affiliate marketing</option>
                    <option value="some" className="bg-[#1a1a2e]">Some experience (1–2 programs)</option>
                    <option value="experienced" className="bg-[#1a1a2e]">Experienced (3+ programs)</option>
                    <option value="pro" className="bg-[#1a1a2e]">Professional affiliate / full-time</option>
                  </select>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-60 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-500/20">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : <>Submit Agent Application <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8 px-6 text-center">
        <p className="text-white/30 text-xs">© 2026 AEVOICE · <a href="mailto:partners@aevoice.ai" className="hover:text-white/50">partners@aevoice.ai</a> · <Link to="/" className="hover:text-white/50">media.aevoice.ai</Link></p>
      </footer>
    </div>
  );
}