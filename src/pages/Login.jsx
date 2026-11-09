import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft, UserPlus, CheckCircle } from "lucide-react";

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/692b24a5bac54e3067972063/2e8a22a03_AevoiceLogo.JPG";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/Dashboard";

  const [mode, setMode]   = useState("login"); // "login" | "signup" | "reset"
  const [form, setForm]   = useState({ email: "", password: "", name: "" });
  const [show, setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [msg,     setMsg]     = useState("");

  // Already logged in → redirect
  useEffect(() => {
    const token = localStorage.getItem("base44_access_token");
    if (token) navigate(from, { replace: true });
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setMsg("");
    try {
      if (mode === "login") {
        await base44.auth.login({ email: form.email, password: form.password });
        navigate(from, { replace: true });
      } else if (mode === "signup") {
        await base44.auth.signup({ email: form.email, password: form.password, full_name: form.name });
        navigate("/Pricing", { replace: true });
      } else {
        // Forgot password — use Base44 SDK method
        try {
          await base44.auth.sendPasswordResetEmail({ email: form.email });
        } catch {
          try { await base44.auth.forgotPassword({ email: form.email }); } catch {
            try { await base44.auth.resetPassword({ email: form.email }); } catch {
              // Fallback: any of these may work depending on SDK version
              await fetch(`https://app.base44.com/api/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: form.email })
              });
            }
          }
        }
        setMsg("If that email exists, a reset link has been sent. Check your inbox.");
      }
    } catch (err) {
      setError(err?.message || err?.error || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ["Home", "Login", "Plan", "Dashboard"];

  return (
    <div className="min-h-screen bg-[#050a14] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-purple-700/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Back */}
        <button onClick={() => navigate("/Home")}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-8 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
        </button>

        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 mb-4 shadow-2xl shadow-violet-500/30">
            <img src={LOGO} alt="media.aevoice.ai" className="w-full h-full object-cover"
              onError={e => { e.target.style.display="none"; e.target.parentElement.className += " bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center"; }} />
          </div>
          <h1 className="text-2xl font-black text-white">
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Forgot password?"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">media.aevoice.ai &middot; media.aevoice.ai</p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">Full Name</label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="text" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                  placeholder="Your full name" required
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
                placeholder="you@media.aevoice.ai" required
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" />
            </div>
          </div>

          {mode !== "reset" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500">Password</label>
                {mode === "login" && (
                  <button type="button" onClick={() => setMode("reset")}
                    className="text-xs text-violet-500 hover:opacity-80 transition-opacity">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={show ? "text" : "password"} value={form.password}
                  onChange={e => setForm(p => ({...p, password: e.target.value}))}
                  placeholder="••••••••" required minLength={8}
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-white/10 bg-white/[0.04] text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2.5 rounded-xl">
              <span className="mt-0.5">⚠</span> {error}
            </div>
          )}
          {msg && (
            <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 rounded-xl">
              <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {msg}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-700 text-white font-semibold text-sm hover:opacity-90 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-violet-500/30 transition-all mt-2">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Working…</>
              : mode === "login"  ? "Sign In →"
              : mode === "signup" ? "Create Account →"
              : "Send Reset Link"}
          </button>
        </form>

        {/* Mode toggle */}
        <div className="mt-5 text-center text-xs text-slate-500">
          {mode === "login" ? (
            <>Don't have an account?{" "}
              <button onClick={() => setMode("signup")} className="text-violet-500 hover:opacity-80 font-medium transition-opacity">
                Sign up free
              </button>
            </>
          ) : mode === "signup" ? (
            <>Already have an account?{" "}
              <button onClick={() => setMode("login")} className="text-violet-500 hover:opacity-80 font-medium transition-opacity">
                Sign in
              </button>
            </>
          ) : (
            <button onClick={() => setMode("login")} className="text-violet-500 hover:opacity-80 transition-opacity">
              ← Back to sign in
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="mt-8 flex items-center justify-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full transition-all ${
                step === "Login"
                  ? "bg-violet-500/20 text-white border border-violet-500/30"
                  : i < STEPS.indexOf("Login")
                    ? "text-violet-500/60"
                    : "text-slate-700"
              }`}>
                {i < STEPS.indexOf("Login") ? (
                  <CheckCircle className="w-3 h-3 text-violet-500/60" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[8px]">{i + 1}</span>
                )}
                {step}
              </div>
              {i < STEPS.length - 1 && <span className="text-slate-800">›</span>}
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-slate-700 mt-5">
          Part of AEVOICE.AI — The ultimate business technology.
        </p>
      </div>
    </div>
  );
}
