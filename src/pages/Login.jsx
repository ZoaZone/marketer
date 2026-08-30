import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft } from "lucide-react";
import GoogleLoginButton from "@/components/GoogleLoginButton";

const LOGO = "/brand/logo-wordmark.jpg";
const BRAND = "MARKETER";
const TAGLINE = "AI Marketing OS";
const DASHBOARD = "/Dashboard";
const SIGNUP_REDIRECT = "/Pricing";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || DASHBOARD;

  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Already logged in → redirect
  // BUG-001 FIX: Validate token via API before redirecting (prevents loop on expired token).
  // BUG-011 FIX: Never redirect back to /login or /auth as the destination.
  useEffect(() => {
    const token = localStorage.getItem("base44_access_token");
    if (!token) return;
    const safeFrom = (from && !/\/(login|auth)/i.test(from)) ? from : "/Dashboard";
    base44.auth.me()
      .then(() => navigate(safeFrom, { replace: true }))
      .catch(() => {
        localStorage.removeItem("base44_access_token");
        localStorage.removeItem("token");
      });
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setMsg("");
    try {
      if (mode === "login") {
        await base44.auth.loginViaEmailPassword(form.email, form.password);
        navigate(from, { replace: true });
      } else if (mode === "signup") {
        await base44.auth.register({ email: form.email, password: form.password, full_name: form.name });
        await base44.auth.loginViaEmailPassword(form.email, form.password);
        navigate(SIGNUP_REDIRECT, { replace: true });
      } else {
        // Password reset — try both SDK method names for compatibility. The
        // third fallback that used to live here POSTed to a hardcoded
        // https://base44.app/... URL; it is gone, both because it pinned the
        // platform domain into a page users see and because it swallowed real
        // failures into a "reset link sent" message that was not true.
        try { await base44.auth.resetPasswordRequest(form.email); }
        catch { await base44.auth.sendPasswordResetEmail({ email: form.email }); }
        setMsg("Reset link sent — check your inbox.");
      }
    } catch (err) {
      setError(err?.message || err?.error || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = () => {
    navigate(from, { replace: true });
  };

  const handleGoogleError = (err) => {
    setError("Google sign-in failed: " + (err?.message || "Please try again."));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
         style={{ backgroundColor: "#050a14" }}>

      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-20"
             style={{ background: "radial-gradient(circle, rgba(99,102,241,0.3), transparent)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">

        {/* Back */}
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-8 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </button>

        {/* Logo + Brand */}
        <div className="text-center mb-8">
          <img src={LOGO} alt="DigitalStudios.app" className="h-14 object-contain mx-auto mb-1"
            onError={e => { e.target.style.display = "none"; }} />
          <p className="text-xs text-slate-400 mt-0.5">{TAGLINE}</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
          <h2 className="text-center text-base font-semibold text-white mb-5">
            {mode === "login" ? "Sign in to your account" : mode === "signup" ? "Create account" : "Reset password"}
          </h2>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/20">
              {error}
            </div>
          )}
          {msg && (
            <div className="mb-4 p-3 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {msg}
            </div>
          )}

          {/* ── Google OAuth — Primary CTA ── */}
          {mode !== "reset" && (
            <div className="mb-5">
              <GoogleLoginButton
                base44={base44}
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                text={mode === "signup" ? "signup_with" : "signin_with"}
                theme="filled_black"
              />
            </div>
          )}

          {/* Divider */}
          {mode !== "reset" && (
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-slate-700/60" />
              <span className="text-xs text-slate-500">or continue with email</span>
              <div className="flex-1 h-px bg-slate-700/60" />
            </div>
          )}

          {/* Email / Password form */}
          <form onSubmit={handleAuth} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Full Name</label>
                <input type="text" value={form.name} required
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-slate-500 placeholder-slate-500"
                  placeholder="Your full name" />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input type="email" value={form.email} required
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-slate-500 placeholder-slate-500"
                  placeholder="you@example.com" />
              </div>
            </div>

            {mode !== "reset" && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input type={show ? "text" : "password"} value={form.password} required
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-slate-500 placeholder-slate-500"
                    placeholder="••••••••" />
                  <button type="button" onClick={() => setShow(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-60 mt-1 flex items-center justify-center gap-2 hover:opacity-90">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-4 flex flex-col gap-2 text-center">
            {mode === "login" && (
              <>
                <button onClick={() => { setMode("reset"); setError(""); setMsg(""); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  Forgot password?
                </button>
                <p className="text-xs text-slate-500">
                  No account?{" "}
                  <button onClick={() => { setMode("signup"); setError(""); setMsg(""); }}
                    className="text-violet-400 hover:underline font-medium">
                    Sign up free
                  </button>
                </p>
              </>
            )}
            {(mode === "signup" || mode === "reset") && (
              <button onClick={() => { setMode("login"); setError(""); setMsg(""); }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        {/* Privacy footer */}
        <p className="text-center text-xs text-slate-600 mt-4">
          By continuing you agree to our{" "}
          <a href="/privacy" className="hover:text-slate-400 underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}