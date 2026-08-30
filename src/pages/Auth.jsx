import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User, Loader2, CheckCircle2, RefreshCw, Shield } from "lucide-react";
import { useSeo, SEO } from "@/lib/seo";

const LOGO = "/brand/wordmark.png";
const BRAND = "Digital Studio";
const TAGLINE = "The all-in-one AI creative studio";
const DASHBOARD = "/studio"; // post-login default landing — the creative hub

// ─── OTP Input ────────────────────────────────────────────────────────────────
function OTPInput({ value, onChange, disabled }) {
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);
  const refs = Array.from({ length: 6 }, () => null);
  const setRef = (i) => (el) => { refs[i] = el; };

  const handleKey = (i, e) => {
    if (e.key === "Backspace") {
      if (digits[i]) {
        const next = value.slice(0, i) + value.slice(i + 1);
        onChange(next);
      } else if (i > 0) {
        refs[i - 1]?.focus();
        const next = value.slice(0, i - 1) + value.slice(i);
        onChange(next);
      }
      return;
    }
    if (/^\d$/.test(e.key)) {
      const next = (value.slice(0, i) + e.key + value.slice(i + 1)).slice(0, 6);
      onChange(next);
      if (i < 5) refs[i + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) { onChange(pasted); refs[Math.min(pasted.length, 5)]?.focus(); }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input key={i} ref={setRef(i)} type="text" inputMode="numeric" maxLength={1}
          value={d} disabled={disabled}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          onChange={() => {}}
          className="w-11 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white text-center text-xl font-bold focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50 select-none"
        />
      ))}
    </div>
  );
}

// ─── Password strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const score = [password.length >= 8, /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "bg-red-500", "bg-amber-500", "bg-emerald-400", "bg-emerald-500"];
  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-all ${n <= score ? colors[score] : "bg-slate-700"}`} />
        ))}
      </div>
      <p className="text-[10px] text-slate-500">{labels[score] || "Too short (min 8)"}</p>
    </div>
  );
}

// ─── Main Auth Page ─────────────────────────────────────────────────────────
export default function Auth() {
  useSeo(SEO.auth);

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || DASHBOARD;

  const [mode, setMode] = useState("login");   // login | signup | reset
  const [flow, setFlow] = useState("email");   // email | otp | password | done
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Already logged in — skip to dashboard
  useEffect(() => {
    const token = localStorage.getItem("base44_access_token");
    if (!token) return;
    base44.auth.me()
      .then(() => navigate(DASHBOARD, { replace: true }))
      .catch(() => { localStorage.removeItem("base44_access_token"); localStorage.removeItem("token"); });
  }, []);

  const resetFlow = (newMode) => {
    setMode(newMode); setFlow("email"); setOtp(""); setPassword(""); setConfirm(""); setError(""); setInfo("");
  };

  // ── Step 1: Send OTP ─────────────────────────────────────────────────────
  // ── Google OAuth — Base44 provider login (Google is enabled by default). ──
  const handleGoogleLogin = () => {
    const safeFrom = (from && !/\/(login|auth|\/)/i.test(from)) ? from : DASHBOARD;
    base44.auth.loginWithProvider("google", safeFrom);
  };

  const sendOTP = async (e) => {
    e?.preventDefault();
    if (!email || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    setOtpSending(true); setError("");
    try {
      if (mode === "reset") {
        // Base44's native reset emails a reset TOKEN (not a 6-digit code),
        // so skip the OTP step and collect the token on the password step.
        await base44.auth.resetPasswordRequest(email.trim().toLowerCase());
        setInfo("We emailed a password reset link/token to " + email.trim().toLowerCase() + ". Paste the reset token below and choose a new password.");
        setFlow("password");
      } else {
        await base44.functions.invoke("sendAuthOTP", { action: "send", email: email.trim().toLowerCase(), purpose: mode });
        setFlow("otp");
      }
    } catch (err) {
      setError(err?.message || "Failed to send verification code. Please try again.");
    } finally { setOtpSending(false); }
  };

  const resendOTP = async () => {
    setResending(true); setError(""); setResent(false); setOtp("");
    try {
      await base44.functions.invoke("sendAuthOTP", { action: "send", email: email.trim().toLowerCase(), purpose: mode });
      setResent(true);
      setTimeout(() => setResent(false), 6000);
    } catch (err) { setError("Failed to resend. Please try again."); }
    setResending(false);
  };

  // ── Step 2: Verify OTP ───────────────────────────────────────────────────
  const verifyOTP = async (code) => {
    const finalCode = code || otp;
    if (finalCode.length < 6) return;
    setLoading(true); setError("");
    try {
      // Only signup reaches the OTP step now (reset uses a native reset
      // token collected on the password step), so always verify the code.
      await base44.functions.invoke("sendAuthOTP", { action: "verify", email: email.trim().toLowerCase(), otp: finalCode, purpose: mode });
      setFlow("password");
    } catch (err) {
      setError(err?.message || "Incorrect code. Please try again.");
    } finally { setLoading(false); }
  };

  const handleOTPChange = (val) => {
    setOtp(val);
    if (val.length === 6) setTimeout(() => verifyOTP(val), 200);
  };

  // ── Direct login: no OTP — a returning user already has a password, which
  // *is* their verification. Email verification (OTP) is only required to
  // create an account (signup) or to prove ownership before a password
  // reset — see submitPassword below, which still handles both of those.
  const submitLogin = async (e) => {
    e?.preventDefault();
    if (!email || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter your password."); return; }
    setLoading(true); setError("");
    const safeFrom = (from && !/\/(login|auth|\/)/i.test(from)) ? from : DASHBOARD;
    try {
      await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
      // A hard navigation, not react-router's navigate() — appParams.js
      // snapshots the access token once at module load, and base44Client.js
      // builds the SDK client from that same frozen snapshot, so a client-
      // side-only route change here left AuthProvider/base44's client still
      // believing the user was logged out, which bounced straight back to
      // /auth (the exact "enter password, land back on login" bug this
      // fixes). window.location.href forces app-params/base44Client/
      // AuthProvider to all re-initialize fresh against the token
      // loginViaEmailPassword just persisted — same pattern AdminLogin.jsx
      // already uses for this same reason.
      window.location.href = safeFrom;
    } catch (err) {
      const msg = err?.message || "";
      setError(msg.includes("password") || msg.includes("credential") || msg.includes("Invalid")
        ? "Incorrect email or password. Try again or use 'Forgot password' to reset."
        : (msg || "Sign in failed. Please try again."));
      setLoading(false);
    }
  };

  // ── Step 3: Submit password (signup / reset only — login never reaches
  // this, see submitLogin above) ───────────────────────────────────────────
  const submitPassword = async (e) => {
    e?.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (mode === "signup" && !name.trim()) { setError("Please enter your full name."); return; }
    setLoading(true); setError("");
    const safeFrom = (from && !/\/(login|auth|\/)/i.test(from)) ? from : DASHBOARD;
    try {
      // signup and reset both land here only after OTP has verified the
      // email; reset "resets" the password by re-registering the
      // already-verified email with a fresh one, rather than a separate
      // reset-token mechanism.
      if (mode === "reset") {
        await base44.auth.resetPassword({ resetToken: otp.trim(), newPassword: password });
      } else {
        try {
          await base44.auth.register({ email: email.trim().toLowerCase(), password, full_name: name });
        } catch (_) { /* already registered — fall through to login below */ }
      }
      await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
      // Hard navigation — see submitLogin's comment above for why.
      window.location.href = safeFrom;
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("already") || msg.includes("exists")) {
        try {
          await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
          window.location.href = safeFrom;
          return;
        } catch (e2) { setError(e2?.message || "Authentication failed."); setLoading(false); }
      } else {
        setError(msg || "Authentication failed. Please try again.");
        setLoading(false);
      }
    }
  };

  // ─── UI helpers ───────────────────────────────────────────────────────────
  const modeLabel = { login: "Sign In", signup: "Create Account", reset: "Reset Password" };
  const stepLabel = {
    email: mode === "login" ? "Enter your email to continue" : mode === "signup" ? "Start with your email address" : "Enter your email to reset password",
    otp: `We emailed a 6-digit code to ${email}`,
    password: mode === "login" ? "Enter your password" : mode === "signup" ? "Set your password" : "Create a new password",
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: "#050a14" }}>
      {/* Glow bg */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-10"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.4), transparent)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10 space-y-6">

        {/* Logo + Brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center">
            <img src={LOGO} alt={BRAND} className="h-12 w-auto rounded-xl" onError={e => { e.target.style.display="none"; }} />
          </div>
          <div>
            <p className="text-white font-black text-xl tracking-tight">{BRAND}</p>
            <p className="text-slate-500 text-xs mt-0.5">{TAGLINE}</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black/40 space-y-5">

          {/* Mode tabs */}
          {flow === "email" && (
            <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl">
              {["login", "signup"].map(m => (
                <button key={m} onClick={() => resetFlow(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-white"}`}>
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {/* Step header */}
          <div>
            {flow !== "email" && (
              <button onClick={() => { setFlow(flow === "password" ? "otp" : "email"); setError(""); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-3 transition-colors">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
            <h2 className="text-white font-black text-lg">{modeLabel[mode]}</h2>
            <p className="text-slate-400 text-xs mt-0.5">{stepLabel[flow]}</p>
          </div>

          {/* Error / Info */}
          {error && (
            <div className="p-3 rounded-xl text-xs bg-red-500/10 text-red-400 border border-red-500/20 leading-relaxed">{error}</div>
          )}
          {info && (
            <div className="p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{info}</div>
          )}
          {resent && (
            <div className="p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-center">✓ New code sent to {email}</div>
          )}

          {/* ── STEP: EMAIL (login) — combined email+password, no OTP.
              A returning user already has a password; that's their
              verification. ── */}
          {flow === "email" && mode === "login" && (
            <form onSubmit={submitLogin} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" value={email} required autoFocus
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPw ? "text" : "password"} value={password} required
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading || !email || !password}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-violet-500/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Signing in..." : "Sign In"}
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-700" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500">or</span>
                <div className="h-px flex-1 bg-slate-700" />
              </div>
              <button type="button" onClick={handleGoogleLogin} disabled={loading}
                className="w-full py-3 rounded-xl bg-white text-slate-800 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90">
                <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Continue with Google
              </button>

              <button type="button" onClick={() => resetFlow("reset")}
                className="w-full text-center text-xs text-slate-500 hover:text-violet-400 transition-colors py-1">
                Forgot password?
              </button>
            </form>
          )}

          {/* ── STEP: EMAIL (signup / reset) — email only; OTP verifies the
              address before a password can be set. ── */}
          {flow === "email" && mode !== "login" && (
            <form onSubmit={sendOTP} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" value={email} required autoFocus
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors" />
                </div>
              </div>
              <button type="submit" disabled={otpSending || !email}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-violet-500/20">
                {otpSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {otpSending ? "Sending code..." : "Send Verification Code →"}
              </button>
              {mode === "signup" && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-slate-700" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">or</span>
                    <div className="h-px flex-1 bg-slate-700" />
                  </div>
                  <button type="button" onClick={handleGoogleLogin} disabled={otpSending}
                    className="w-full py-3 rounded-xl bg-white text-slate-800 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90">
                    <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    Continue with Google
                  </button>
                </>
              )}
            </form>
          )}

          {/* ── STEP: OTP ── */}
          {flow === "otp" && (
            <div className="space-y-5">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Shield className="w-4 h-4 text-violet-400" />
                Enter the 6-digit code from your email
              </div>
              <OTPInput value={otp} onChange={handleOTPChange} disabled={loading} />
              <button onClick={() => verifyOTP(otp)} disabled={loading || otp.length < 6}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-violet-500/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? "Verifying..." : "Verify Code"}
              </button>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Didn't get it?</span>
                <button onClick={resendOTP} disabled={resending}
                  className="flex items-center gap-1 text-slate-500 hover:text-violet-400 transition-colors disabled:opacity-50">
                  {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Resend code
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: PASSWORD ── */}
          {flow === "password" && (
            <form onSubmit={submitPassword} className="space-y-4">
              {mode === "reset" && (
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">Reset token</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="text" value={otp} required autoFocus
                      onChange={e => setOtp(e.target.value)}
                      placeholder="Paste the token from your reset email"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors" />
                  </div>
                </div>
              )}
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="text" value={name} required autoFocus
                      onChange={e => setName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors" />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  {mode === "reset" ? "New Password" : "Password"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPw ? "text" : "password"} value={password} required
                    autoFocus={mode !== "signup"}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode !== "login" && <PasswordStrength password={password} />}
              </div>
              {mode !== "login" && (
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type={showPw ? "text" : "password"} value={confirm} required
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className={`w-full pl-10 py-2.5 rounded-xl bg-slate-800 border text-white text-sm focus:outline-none focus:border-violet-500 placeholder-slate-500 transition-colors ${confirm && confirm !== password ? "border-red-500/60" : "border-slate-700"}`} />
                  </div>
                  {confirm && confirm !== password && <p className="text-xs text-red-400 mt-1">Passwords don't match</p>}
                </div>
              )}
              <button type="submit" disabled={loading || !password || (mode !== "login" && password !== confirm) || (mode === "reset" && !otp.trim())}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-violet-500/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Please wait..." : mode === "signup" ? "Create Account" : mode === "reset" ? "Set New Password" : "Sign In"}
              </button>
            </form>
          )}
        </div>

        {/* Footer links */}
        <div className="text-center space-y-2">
          {mode !== "signup" && flow === "email" && (
            <p className="text-xs text-slate-600">
              No account?{" "}
              <button onClick={() => resetFlow("signup")} className="text-violet-400 hover:text-violet-300 font-medium transition-colors">Sign up free</button>
            </p>
          )}
          {mode === "signup" && flow === "email" && (
            <p className="text-xs text-slate-600">
              Already have an account?{" "}
              <button onClick={() => resetFlow("login")} className="text-violet-400 hover:text-violet-300 font-medium transition-colors">Sign in</button>
            </p>
          )}
          <p className="text-xs text-slate-700">
                          © 2026 {BRAND} · AI creative studio
          </p>
        </div>
      </div>
    </div>
  );
}
