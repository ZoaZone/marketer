/**
 * AuthCard — shared branded wrapper for all auth steps.
 */
const LOGO = "/logo.png";

export default function AuthCard({ children, title, subtitle }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: "#050a14" }}>
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-15"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.35), transparent)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-white/10 bg-white/5 mb-4 shadow-xl overflow-hidden">
            <img src={LOGO} alt="Digital Studio" className="w-12 h-12 object-cover rounded-xl"
              onError={e => { e.target.style.display = "none"; }} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">digitalstudios.app</h1>
          <p className="text-xs text-slate-400 mt-0.5">AI Marketing & Media Platform</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
          {(title || subtitle) && (
            <div className="text-center mb-6">
              {title && <h2 className="text-base font-bold text-white">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          By continuing you agree to our{" "}
          <a href="/privacy" className="hover:text-slate-400 underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}