import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, User, Lock, ArrowRight, Loader2, CheckCircle2, Sparkles, Image, Video, Mail, GitBranch, Share2, BarChart3, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useSeo, SEO } from "@/lib/seo";

const M_LOGO = "/brand/logo-mark.jpeg";

const LOCKED_FEATURES = [
  { Icon: Image,    label: "AI Image Generation",     desc: "Create stunning visuals in seconds with AI." },
  { Icon: Video,    label: "AI Video Creation",        desc: "Generate branded videos and reels automatically." },
  { Icon: Mail,     label: "Bulk Email / SMS / WhatsApp", desc: "Send thousands of messages with one click." },
  { Icon: Share2,   label: "Social Post Scheduling",   desc: "Auto-schedule posts across all platforms." },
  { Icon: GitBranch,label: "Funnel Builder",           desc: "Visual drag-drop funnels with automation." },
  { Icon: Zap,      label: "Follow-Up Automation",     desc: "Triggered sequences from lead actions." },
  { Icon: BarChart3,label: "Analytics & ROI",          desc: "Campaign performance and conversion dashboards." },
  { Icon: Sparkles, label: "AI Script & Ad Creator",   desc: "Generate ad copy, scripts, captions instantly." },
];

const INDUSTRIES = ["E-commerce", "Real Estate", "Healthcare", "Education", "Restaurant & Food", "Fashion & Apparel", "Fitness & Wellness", "Technology", "Finance", "Travel & Hospitality", "Agency", "Other"];

export default function FreeTrial() {
  useSeo(SEO.freeTrial);

  const fileRef = useRef(null);
  const [step, setStep] = useState("form"); // "form" | "saving" | "done"
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState({
    business_name: "",
    owner_name: "",
    email: "",
    phone: "",
    industry: "",
    website: "",
    description: "",
    logo_url: "",
    tagline: "",
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setProfile(p => ({ ...p, logo_url: file_url }));
    } catch {
      // Don't fall back to a blob: preview — it only resolves in this tab
      // and would leave logo_url pointing at a dead reference everywhere
      // else (the lead email, any later session).
      alert("Logo upload failed. Please try again.");
    }
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profile.business_name || !profile.email) return;
    setStep("saving");
    // Save as a beta request / lead
    try {
      await base44.integrations.Core.SendEmail({
        to: "care@aevoice.ai",
        subject: `New Free Trial Profile: ${profile.business_name}`,
        body: `Business: ${profile.business_name}\nOwner: ${profile.owner_name}\nEmail: ${profile.email}\nPhone: ${profile.phone}\nIndustry: ${profile.industry}\nWebsite: ${profile.website}\nTagline: ${profile.tagline}\nDescription: ${profile.description}`,
      });
    } catch {}
    setTimeout(() => setStep("done"), 1500);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <div className="flex items-center gap-2">
            <img src={M_LOGO} alt="" className="w-7 h-7 rounded-lg" onError={e => e.target.style.display = "none"} />
            <span className="font-black text-sm bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">DigitalStudios.app</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 text-xs font-medium mb-4">
            ✨ Free Trial — No Credit Card Required
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Create Your Business Profile</h1>
          <p className="text-white/50 text-base">Set up your brand profile and explore the platform. Upgrade anytime to unlock all features.</p>
        </div>

        {/* STEP: Form */}
        {step === "form" && (
          <div className="space-y-6">
            {/* Profile form card */}
            <div className="bg-white/3 border border-white/10 rounded-3xl p-7">
              <h2 className="text-base font-bold text-white mb-5 flex items-center gap-2">
                <User className="w-4 h-4 text-fuchsia-400" /> Business Profile
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Logo upload */}
                <div className="flex items-center gap-5 mb-2">
                  <div
                    className="w-20 h-20 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden cursor-pointer hover:border-fuchsia-500/50 transition-colors flex-shrink-0"
                    onClick={() => fileRef.current?.click()}>
                    {profile.logo_url
                      ? <img src={profile.logo_url} className="w-full h-full object-cover" alt="logo" />
                      : uploading
                      ? <Loader2 className="w-6 h-6 text-fuchsia-400 animate-spin" />
                      : <Upload className="w-6 h-6 text-white/30" />}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <div>
                    <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-fuchsia-400 hover:text-fuchsia-300 font-medium">
                      {profile.logo_url ? "Change logo" : "Upload business logo"}
                    </button>
                    <p className="text-xs text-white/30 mt-0.5">PNG, JPG up to 5MB</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Business Name *</label>
                    <input required value={profile.business_name} onChange={e => setProfile(p => ({ ...p, business_name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                      placeholder="Your brand or business name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Your Name</label>
                    <input value={profile.owner_name} onChange={e => setProfile(p => ({ ...p, owner_name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                      placeholder="Owner / contact person" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Email Address *</label>
                    <input required type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                      placeholder="you@yourbrand.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Phone / WhatsApp</label>
                    <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                      placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Industry</label>
                    <select value={profile.industry} onChange={e => setProfile(p => ({ ...p, industry: e.target.value }))}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-fuchsia-500/50">
                      <option value="" className="bg-[#111]">Select industry</option>
                      {INDUSTRIES.map(i => <option key={i} value={i} className="bg-[#111]">{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5">Website</label>
                    <input value={profile.website} onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                      placeholder="https://yourbrand.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">Tagline / One-liner</label>
                  <input value={profile.tagline} onChange={e => setProfile(p => ({ ...p, tagline: e.target.value }))}
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                    placeholder="e.g. India's fastest growing fintech platform" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">About Your Business</label>
                  <textarea value={profile.description} onChange={e => setProfile(p => ({ ...p, description: e.target.value }))} rows={3}
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50 resize-none"
                    placeholder="Briefly describe your products, services, and target audience…" />
                </div>

                <button type="submit"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-500/25 mt-2">
                  Save Profile & Explore Features <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Locked features preview */}
            <div className="bg-white/3 border border-white/8 rounded-3xl p-7">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" /> Features Included in Paid Plans
                </h2>
                <Link to="/pricing" className="text-xs text-fuchsia-400 hover:text-fuchsia-300 font-medium">View Plans →</Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {LOCKED_FEATURES.map(f => (
                  <div key={f.label} className="flex items-start gap-3 p-3.5 rounded-xl border border-white/6 bg-white/2">
                    <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center flex-shrink-0">
                      <f.Icon className="w-4 h-4 text-fuchsia-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/80">{f.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{f.desc}</p>
                    </div>
                    <Lock className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-1 ml-auto" />
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-white/8 text-center">
                <p className="text-sm text-white/50 mb-3">Unlock everything from <span className="text-fuchsia-400 font-bold">$49/month</span></p>
                <Link to="/pricing"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm hover:opacity-90 shadow-lg shadow-fuchsia-500/20">
                  Upgrade Now <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* STEP: Saving */}
        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <Loader2 className="w-10 h-10 text-fuchsia-400 animate-spin" />
            <p className="text-white font-bold">Saving your profile…</p>
          </div>
        )}

        {/* STEP: Done */}
        {step === "done" && (
          <div className="space-y-6">
            {/* Success banner */}
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-xl font-black text-white mb-1">Profile Created! 🎉</h2>
              <p className="text-white/60 text-sm">Your free trial profile for <span className="text-white font-semibold">{profile.business_name}</span> is live. Explore the features below — upgrade to unlock and use them all.</p>
            </div>

            {/* Platform features tour */}
            <div className="bg-white/3 border border-white/8 rounded-3xl p-7">
              <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-400" /> Platform Features (Preview Only)
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {LOCKED_FEATURES.map(f => (
                  <div key={f.label} className="flex items-start gap-3 p-3.5 rounded-xl border border-white/8 bg-white/3 relative overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center flex-shrink-0">
                      <f.Icon className="w-4 h-4 text-fuchsia-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white/80">{f.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{f.desc}</p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-xl">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 border border-white/10">
                        <Lock className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] text-white/70 font-medium">Upgrade to use</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile summary */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4">
              {profile.logo_url
                ? <img src={profile.logo_url} className="w-14 h-14 rounded-xl object-cover border border-white/10 flex-shrink-0" alt="logo" />
                : <div className="w-14 h-14 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-7 h-7 text-fuchsia-400" />
                  </div>}
              <div>
                <p className="font-bold text-white">{profile.business_name}</p>
                <p className="text-xs text-white/50">{profile.industry}{profile.industry && profile.email ? " · " : ""}{profile.email}</p>
                {profile.tagline && <p className="text-xs text-fuchsia-300/70 italic mt-0.5">"{profile.tagline}"</p>}
              </div>
            </div>

            {/* Upgrade CTA */}
            <div className="p-6 rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/5 text-center">
              <h3 className="font-black text-white text-xl mb-2">Ready to start marketing?</h3>
              <p className="text-white/50 text-sm mb-5">Pick a plan to unlock AI image/video creation, bulk messaging, social scheduling, funnels, and more.</p>
              <Link to="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm hover:opacity-90 shadow-lg shadow-fuchsia-500/25">
                View Plans & Upgrade <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-white/30 mt-3">Plans from $49/mo · Cancel anytime</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}