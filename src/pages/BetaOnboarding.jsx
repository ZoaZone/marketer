import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  CheckCircle2, Loader2, ArrowRight,
  Gift, User, Mail, Lock
} from "lucide-react";

const APP_URL = "https://media.aevoice.ai";

const STEPS = [
  { id: 1, label: "Verify Invite" },
  { id: 2, label: "Create Account" },
  { id: 3, label: "Your Profile" },
  { id: 4, label: "All Set!" },
];

export default function BetaOnboarding() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Step 2
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Step 2 — manual invite code entry (if user lands without token)
  const [manualCode, setManualCode] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  // Step 3
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [useCase, setUseCase] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Validate token from URL ────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    validateByToken(token);
  }, [token]);

  const validateByToken = async (tok) => {
    setLoading(true);
    setError("");
    try {
      const results = await base44.entities.BetaRequest.filter({ invite_token: tok });
      if (!results || results.length === 0) {
        setError("This invite link is invalid or has already been used.");
        setLoading(false);
        return;
      }
      const inv = results[0];
      if (inv.status === "registered") {
        setError("This invite has already been used. Please log in instead.");
        setLoading(false);
        return;
      }
      if (inv.invite_expires_at && new Date(inv.invite_expires_at) < new Date()) {
        setError("This invite link has expired. Please contact the team for a new one.");
        setLoading(false);
        return;
      }
      setInvite(inv);
      if (inv.full_name) setFullName(inv.full_name);
      if (inv.company) setCompany(inv.company);
      setStep(1);
      setLoading(false);
    } catch (e) {
      setError("Could not validate your invite. Please try again.");
      setLoading(false);
    }
  };

  // ── Manual invite code lookup ──────────────────────────────────────────────
  const handleCodeLookup = async () => {
    if (!manualCode.trim() || !manualEmail.trim()) return;
    setLookingUp(true);
    setError("");
    try {
      // Code is first 6 chars of token uppercased
      const results = await base44.entities.BetaRequest.filter({ email: manualEmail.trim().toLowerCase() });
      const match = results?.find(r =>
        r.invite_token &&
        r.invite_token.slice(0, 6).toUpperCase() === manualCode.trim().toUpperCase()
      );
      if (!match) {
        setError("Code not found for this email. Please check and try again.");
        setLookingUp(false);
        return;
      }
      if (match.status === "registered") {
        setError("This invite has already been used. Please log in.");
        setLookingUp(false);
        return;
      }
      if (match.invite_expires_at && new Date(match.invite_expires_at) < new Date()) {
        setError("This invite code has expired.");
        setLookingUp(false);
        return;
      }
      setInvite(match);
      if (match.full_name) setFullName(match.full_name);
      if (match.company) setCompany(match.company);
      setStep(1);
      setLookingUp(false);
    } catch (e) {
      setError("Lookup failed: " + e.message);
      setLookingUp(false);
    }
  };

  // ── Step 2: Redirect to Base44 login/signup ───────────────────────────────
  const handleCreateAccount = () => {
    // Store invite token in sessionStorage so we can resume after auth
    if (invite?.invite_token) {
      sessionStorage.setItem("beta_invite_token", invite.invite_token);
      sessionStorage.setItem("beta_invite_email", invite.email);
    }
    // Redirect to Base44 login — after login they'll come back to this page
    const returnUrl = invite?.invite_token
      ? `/invite/${invite.invite_token}`
      : `/invite`;
    base44.auth.redirectToLogin(returnUrl);
  };

  // ── Step 3: Save profile & activate subscription ───────────────────────────
  const handleSaveProfile = async () => {
    if (!fullName.trim()) { setError("Please enter your name."); return; }
    setError("");
    setSavingProfile(true);
    try {
      // Activate Agency-tier subscription
      await base44.asServiceRole?.entities?.Subscription?.create?.({
        owner_email: invite.email,
        plan_name: "Beta Pro",
        plan_tier: "agency",
        status: "active",
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }) ?? await base44.entities.Subscription.create({
        owner_email: invite.email,
        plan_name: "Beta Pro",
        plan_tier: "agency",
        status: "active",
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Mark invite as registered
      await base44.entities.BetaRequest.update(invite.id, {
        status: "registered",
        full_name: fullName,
        company: company || invite.company || "",
        use_case: useCase || invite.use_case || "",
      });

      setSavingProfile(false);
      setStep(4);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
      setSavingProfile(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30 animate-pulse">
          <span className="text-white font-black text-2xl">A</span>
        </div>
        <Loader2 className="w-6 h-6 text-fuchsia-400 animate-spin" />
        <p className="text-white/40 text-sm">Validating your invite…</p>
      </div>
    </div>
  );

  // ── No token & no invite yet — show manual code entry ─────────────────────
  if (!invite && !token) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30 mb-3">
            <span className="text-white font-black text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">AEVOICE</h1>
          <p className="text-white/40 text-xs mt-1">media.aevoice.ai</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center">
              <Gift className="w-5 h-5 text-fuchsia-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Enter Your Invite Code</h2>
              <p className="text-white/40 text-xs">Got an invite email? Enter your code below</p>
            </div>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-red-400 text-sm">{error}</div>}

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-white/60 text-xs font-medium mb-1.5 block">Your Email Address</label>
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <Mail className="w-4 h-4 text-white/30" />
                <input
                  type="email"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/20"
                />
              </div>
            </div>
            <div>
              <label className="text-white/60 text-xs font-medium mb-1.5 block">6-Character Invite Code</label>
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3"
                maxLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xl font-black tracking-[0.4em] text-center outline-none focus:border-fuchsia-500/50 placeholder:text-white/20 placeholder:text-base placeholder:tracking-normal uppercase"
              />
            </div>
          </div>

          <button
            onClick={handleCodeLookup}
            disabled={lookingUp || !manualCode.trim() || !manualEmail.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-500/20"
          >
            {lookingUp ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : <>Verify Invite Code <ArrowRight className="w-4 h-4" /></>}
          </button>

          <p className="text-center text-white/20 text-xs mt-5">
            No code? <a href="/beta" className="text-fuchsia-400 hover:text-fuchsia-300">Request beta access</a> · <a href="/login" className="text-white/30 hover:text-white/50">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );

  // ── Invalid token error ────────────────────────────────────────────────────
  if (!invite && error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🔗</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Invite Issue</h2>
        <p className="text-white/50 mb-6 text-sm">{error}</p>
        <div className="flex flex-col gap-3">
          <a href="/invite" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 rounded-xl font-semibold text-sm hover:bg-fuchsia-500/20 transition-colors">
            Enter Code Manually <ArrowRight className="w-4 h-4" />
          </a>
          <a href="/login" className="inline-block px-6 py-3 border border-white/10 text-white/50 rounded-xl font-semibold text-sm hover:border-white/20 transition-colors">
            Sign In Instead
          </a>
        </div>
      </div>
    </div>
  );

  // ── Main onboarding flow ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30 mb-3">
            <span className="text-white font-black text-xl">A</span>
          </div>
          <span className="text-xl font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
            media.aevoice.ai
          </span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 mb-8">
          {STEPS.map((st, i) => (
            <div key={st.id} className="flex items-center gap-1.5 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                step > st.id  ? "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white" :
                step === st.id ? "bg-white/10 border-2 border-fuchsia-500 text-fuchsia-400" :
                                 "bg-white/5 text-white/20"
              }`}>
                {step > st.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : st.id}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${step > st.id ? "bg-gradient-to-r from-fuchsia-500 to-purple-600" : "bg-white/10"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm">

          {/* STEP 1: Welcome & confirm invite */}
          {step === 1 && invite && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-purple-600/20 border border-fuchsia-500/30 flex items-center justify-center mx-auto mb-5">
                <Gift className="w-8 h-8 text-fuchsia-400" />
              </div>
              <div className="inline-flex items-center gap-2 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-full px-4 py-1.5 mb-4">
                <span className="text-fuchsia-400 text-xs font-semibold">🎉 Beta Invite Confirmed</span>
              </div>
              <h1 className="text-2xl font-black text-white mb-2">
                You're approved!<br />
                <span className="bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
                  Welcome to AEVOICE Beta
                </span>
              </h1>
              <p className="text-white/50 text-sm mb-1">Invite reserved for</p>
              <p className="text-fuchsia-300 font-semibold text-sm mb-6">{invite.email}</p>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left space-y-2.5">
                {[
                  "✅ Full Agency-tier access — free for 1 year",
                  "✅ AI media creation — images, videos, copy",
                  "✅ Multi-channel: Email, SMS, WhatsApp, Social",
                  "✅ Priority beta support",
                ].map((item, i) => (
                  <p key={i} className="text-white/70 text-sm">{item}</p>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-500/20"
              >
                Set Up My Account <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: Create Account — redirect to Base44 auth */}
          {step === 2 && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-5">
                <Lock className="w-7 h-7 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Create Your Account</h2>
              <p className="text-white/50 text-sm mb-1">Your invite is reserved for</p>
              <p className="text-fuchsia-300 font-semibold text-sm mb-6">{invite?.email}</p>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-white/30 shrink-0" />
                  <span className="text-white/50 text-sm">{invite?.email}</span>
                </div>
              </div>

              <p className="text-white/40 text-xs mb-6">
                You'll be taken to a secure sign-up page to set your password. Once done, you'll be brought right back here.
              </p>

              <button
                onClick={handleCreateAccount}
                className="w-full py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-500/20"
              >
                Set Up Password & Continue <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-center text-white/20 text-xs mt-4">
                Already have an account? <a href="/login" className="text-fuchsia-400 hover:text-fuchsia-300">Sign in</a>
              </p>
            </div>
          )}

          {/* STEP 3: Profile */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center">
                  <User className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Tell Us About You</h2>
                  <p className="text-white/40 text-xs">Personalise your AEVOICE experience</p>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-red-400 text-sm">{error}</div>
              )}

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 block">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Sarah Johnson"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 block">Company / Brand</label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="e.g. Acme Marketing Co."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50 placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-white/60 text-xs font-medium mb-1.5 block">Primary use case</label>
                  <select
                    value={useCase}
                    onChange={e => setUseCase(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-fuchsia-500/50"
                  >
                    <option value="" className="bg-[#1a1a2e]">Select…</option>
                    <option value="social_media" className="bg-[#1a1a2e]">Social Media Management</option>
                    <option value="email_campaigns" className="bg-[#1a1a2e]">Email Marketing</option>
                    <option value="content_creation" className="bg-[#1a1a2e]">AI Content Creation</option>
                    <option value="lead_generation" className="bg-[#1a1a2e]">Lead Generation & Funnels</option>
                    <option value="agency" className="bg-[#1a1a2e]">Marketing Agency</option>
                    <option value="ecommerce" className="bg-[#1a1a2e]">E-commerce / D2C Brand</option>
                    <option value="other" className="bg-[#1a1a2e]">Other</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full py-3.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-500/20"
              >
                {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" />Activating Access…</> : <>Activate My Free Access <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          )}

          {/* STEP 4: Done! */}
          {step === 4 && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">
                You're in{fullName ? ", " + fullName.split(" ")[0] : ""}! 🎉
              </h2>
              <p className="text-white/50 text-sm mb-6">
                Full Agency-tier access activated. Welcome to AEVOICE beta — let's build something great.
              </p>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 mb-6 text-left space-y-2">
                <p className="text-emerald-400 font-semibold text-sm">What's unlocked:</p>
                {[
                  "🎨 AI Media Studio — visuals, copy, video scripts",
                  "📣 Campaigns — email, SMS & WhatsApp",
                  "📅 Social Hub — schedule across all platforms",
                  "📊 Analytics — track performance in real time",
                ].map((item, i) => (
                  <p key={i} className="text-white/60 text-sm">{item}</p>
                ))}
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          © 2026 AEVOICE · media.aevoice.ai · Questions? <a href="mailto:hello@aevoice.ai" className="hover:text-white/40 transition-colors">hello@aevoice.ai</a>
        </p>
      </div>
    </div>
  );
}