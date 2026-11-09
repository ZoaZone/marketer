import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Eye, EyeOff, Mail, Lock, ShieldCheck } from "lucide-react";

const LOGO = "/brand/icon.png";
const BRAND = "Marketer OS";
const ADMIN_REDIRECT = "/admin-dashboard";

export default function AdminLogin() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (authed) window.location.href = ADMIN_REDIRECT;
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.auth.loginViaEmailPassword(form.email.trim().toLowerCase(), form.password);
      const user = await base44.auth.me();
      if (user?.role === "admin") {
        window.location.href = ADMIN_REDIRECT;
      } else {
        setError("Access denied. Admin credentials required.");
        await base44.auth.logout();
      }
    } catch (err) {
      setError(err?.message || "Invalid admin credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!form.email.trim()) { setError("Enter your email first, then click Forgot Password."); return; }
    try {
      await base44.auth.resetPasswordRequest(form.email.trim().toLowerCase());
      alert("Password reset link sent to " + form.email + ". Check your inbox.");
    } catch (err) {
      alert("If this admin account exists, a reset link was sent.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-white/10 bg-white/5 mb-4 shadow-xl overflow-hidden">
            <img src={LOGO} alt={BRAND} className="w-12 h-12 object-cover rounded-xl" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">{BRAND}</h1>
          <p className="text-xs text-amber-400 mt-0.5 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin Portal
          </p>
        </div>
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
          <h2 className="text-center text-base font-semibold text-white mb-5">Admin Sign In</h2>
          {error && (<div className="mb-4 p-3 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/20">{error}</div>)}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input type="email" value={form.email} required autoFocus onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500"
                  placeholder="admin@example.com" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input type={show ? "text" : "password"} value={form.password} required onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="Admin password" />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg bg-amber-500 text-slate-900 text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-1">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating...</> : "Sign In as Admin"}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button type="button" onClick={handleForgotPassword} className="text-xs text-slate-500 hover:text-amber-400 transition-colors underline underline-offset-2">
              Forgot admin password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}