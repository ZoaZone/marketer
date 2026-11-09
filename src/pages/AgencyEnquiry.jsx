import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Building2, CheckCircle2, ArrowRight, Loader2, Users, Globe,
  Sparkles, BarChart3, Shield, Headphones, Zap, Star
} from "lucide-react";

const AGENCY_FEATURES = [
  { icon: Users, title: "Unlimited Client Seats", desc: "Manage all your clients from a single white-labeled dashboard." },
  { icon: Globe, title: "White-Label Platform", desc: "Brand the entire platform as your own. Custom domain + logo." },
  { icon: Sparkles, title: "10,000+ AI Generations", desc: "Bulk AI content creation across all client accounts." },
  { icon: BarChart3, title: "Unified Analytics", desc: "Cross-client performance reporting in one view." },
  { icon: Shield, title: "Dedicated Account Manager", desc: "Priority support with a named account manager for your agency." },
  { icon: Headphones, title: "API Access", desc: "Full API access for custom integrations and workflows." },
];

export default function AgencyEnquiry() {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", agency_name: "", client_count: "", current_tools: "", requirements: "" });
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
        company: form.agency_name || "",
        use_case: `AGENCY ENQUIRY | Phone: ${form.phone} | Clients: ${form.client_count} | Tools: ${form.current_tools} | Requirements: ${form.requirements}`,
        status: "pending",
        note: "Agency partnership enquiry",
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
        <div className="flex items-center gap-4">
          <Link to="/agent-program" className="text-sm text-fuchsia-400 hover:text-fuchsia-300 transition-colors font-medium">Agent Program →</Link>
          <Link to="/dashboard" className="text-sm text-white/60 hover:text-white transition-colors">Sign In</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative py-24 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-purple-500/8 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold mb-8">
            <Building2 className="w-3.5 h-3.5" /> Agency Partnership
          </div>
          <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
            Scale your agency with<br />
            <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AI-powered tools.</span>
          </h1>
          <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto leading-relaxed">
            Get a custom agency plan tailored to your team size, client count, and requirements. White-label the entire platform as your own.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#enquire" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-base hover:opacity-90 transition-opacity shadow-2xl shadow-fuchsia-500/30">
              Submit Agency Enquiry <ArrowRight className="w-5 h-5" />
            </a>
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/15 text-white/70 font-medium text-base hover:border-white/30 hover:text-white transition-all">
              View Pricing
            </Link>
          </div>
          <p className="text-xs text-white/30 mt-4">Custom pricing available · Dedicated onboarding · SLA guaranteed</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">Everything your agency needs</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {AGENCY_FEATURES.map(f => (
              <div key={f.title} className="p-5 rounded-2xl border border-white/8 bg-white/3 hover:border-white/15 transition-all">
                <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/20 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-fuchsia-400" />
                </div>
                <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="p-8 rounded-3xl border border-fuchsia-500/20 bg-fuchsia-500/5 text-center">
            <div className="flex justify-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />)}
            </div>
            <p className="text-white/70 text-lg leading-relaxed mb-4 italic max-w-2xl mx-auto">
              "Switching our entire agency to media.aevoice.ai was the best decision we made. Managing 20 clients from one platform, with AI doing the heavy lifting."
            </p>
            <p className="text-white font-semibold text-sm">James K. — Agency Owner, 20 Clients</p>
          </div>
        </div>
      </section>

      {/* Enquiry Form */}
      <section id="enquire" className="py-20 px-6">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold mb-4">
              <Zap className="w-3.5 h-3.5" /> Agency Enquiry
            </div>
            <h2 className="text-3xl font-black text-white mb-3">Let's talk agency pricing</h2>
            <p className="text-white/40 text-sm">Tell us about your agency and we'll put together a custom plan within 24 hours.</p>
          </div>

          {submitted ? (
            <div className="text-center p-10 rounded-3xl border border-emerald-500/30 bg-emerald-500/8">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-2xl font-black text-white mb-2">Enquiry Received!</h3>
              <p className="text-white/50 text-sm mb-6">Our team will reach out within 24 hours with a tailored agency proposal.</p>
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
                    <label className="text-xs font-semibold text-white/50 block mb-1.5">Your Name *</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="James Kumar"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 block mb-1.5">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="you@agency.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-white/50 block mb-1.5">Agency Name</label>
                    <input value={form.agency_name} onChange={e => setForm(f => ({ ...f, agency_name: e.target.value }))}
                      placeholder="Your Agency Co."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 block mb-1.5">Phone / WhatsApp</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+91 98765 43210"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">How many clients do you manage?</label>
                  <select value={form.client_count} onChange={e => setForm(f => ({ ...f, client_count: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50">
                    <option value="" className="bg-[#1a1a2e]">Select range…</option>
                    <option value="1-5" className="bg-[#1a1a2e]">1 – 5 clients</option>
                    <option value="6-15" className="bg-[#1a1a2e]">6 – 15 clients</option>
                    <option value="16-30" className="bg-[#1a1a2e]">16 – 30 clients</option>
                    <option value="30+" className="bg-[#1a1a2e]">30+ clients</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">Current tools you're using</label>
                  <input value={form.current_tools} onChange={e => setForm(f => ({ ...f, current_tools: e.target.value }))}
                    placeholder="e.g. Hootsuite, Mailchimp, Canva…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 block mb-1.5">What are your key requirements?</label>
                  <textarea value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
                    rows={3} placeholder="e.g. White-label, custom integrations, bulk messaging, etc."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20 resize-none" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-60 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-500/20">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : <>Submit Enquiry <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8 px-6 text-center">
        <p className="text-white/30 text-xs">© 2026 AEVOICE · <a href="mailto:agency@aevoice.ai" className="hover:text-white/50">agency@aevoice.ai</a> · <Link to="/" className="hover:text-white/50">media.aevoice.ai</Link></p>
      </footer>
    </div>
  );
}