import { base44 } from "@/api/base44Client";
import GoogleIcon from "@/components/GoogleIcon";

// ── Google Login, via the Base44 platform's own OAuth redirect ──────────────
// We previously tried to build a custom Google Identity Services (GIS) button
// that would POST the Google ID token to `base44.app/api/auth/google` and
// exchange it for a session, so the Google consent screen could show this
// app's own OAuth client/branding instead of Base44's. That endpoint does not
// support an ID-token exchange: probed 2026-09-02, GET -> 401 "No
// authentication header", POST -> 405 Method Not Allowed. The identical
// probe against the same endpoint from a second, independent Base44 app
// (traditionalmatrimony.com) returned the same 401/405 pair, so this is a
// platform-level gap, not a bug in this app's request — see
// docs/google-oauth-investigation.md for the full comparison.
//
// The pattern that *does* work on Base44 today, confirmed live in production
// on pdfax (a sibling Base44 app — see its src/pages/Login.jsx), is the
// SDK's own redirect flow: base44.auth.loginWithProvider("google", fromUrl).
// It sends the user to Base44's hosted Google OAuth flow and redirects back
// to `fromUrl` with `?access_token=...`, which this app's own
// src/lib/app-params.js already picks up and persists (the same mechanism
// email/password login relies on). The tradeoff — the Google consent screen
// reads "to continue to base44.com" rather than this app's own name — is a
// cosmetic platform limitation, not a broken login.
export default function GoogleLoginButton({
  fromUrl = "/",
  theme = "filled_black",
  className = "",
}) {
  const handleClick = () => {
    base44.auth.loginWithProvider("google", fromUrl);
  };

  const dark = theme !== "outline";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ||
        `w-full py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          dark
            ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
        }`
      }
    >
      <GoogleIcon className="w-4 h-4" />
      Continue with Google
    </button>
  );
}
