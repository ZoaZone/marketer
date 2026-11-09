import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Send, CheckCircle2, Loader2 } from "lucide-react";

export default function BetaSignup() {
  const [form, setForm] = useState({ full_name: "", email: "", company: "", use_case: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      // Use the public backend function — no auth required
      await base44.functions.invoke("submitBetaRequest", { ...form });
      setDone(true);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30 mb-3">
            <span className="text-white font-black text-2xl tracking-tight">A</span>
          </div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">AEVOICE</h1>
          <p className="text-muted-foreground text-sm mt-1">AI Marketing OS</p>
        </div>

        {done ? (
          <div className="bg-card border border-emerald-500/20 rounded-2xl p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Request Submitted!</h2>
            <p className="text-muted-foreground text-sm">
              Thanks! Our team will review your request and send you an invite to your email once approved. Usually within 24 hours.
            </p>
            <div className="bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-xl p-3 text-xs text-fuchsia-300">
              ✨ You'll get full Agency-tier access — completely free as a beta user.
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Request Free Beta Access</h2>
              <p className="text-muted-foreground text-sm mt-1">Get full access to all AEVOICE features — free for early beta users. Our team will review and send your invite.</p>
            </div>

            <div className="bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-fuchsia-400 shrink-0" />
              <p className="text-xs text-fuchsia-300 font-medium">Full Agency-tier • All AI features • No credit card needed</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
                <input
                  value={form.full_name}
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Your full name"
                  required
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="you@example.com"
                  required
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Company / Brand (optional)</label>
                <input
                  value={form.company}
                  onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                  placeholder="Your business name"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">How will you use AEVOICE? (optional)</label>
                <textarea
                  value={form.use_case}
                  onChange={e => setForm(p => ({ ...p, use_case: e.target.value }))}
                  rows={3}
                  placeholder="e.g. Social media marketing for my e-commerce brand…"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !form.full_name.trim() || !form.email.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 hover:opacity-90 transition-all shadow-lg shadow-fuchsia-500/20">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : <><Send className="w-4 h-4" />Request Beta Access</>}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
