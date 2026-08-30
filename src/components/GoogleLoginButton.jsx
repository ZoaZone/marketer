import { useEffect, useRef } from "react";

// Read from the environment — never hardcoded. The value that used to sit here
// (342662050420-hjsrds4v…) was Base44's own platform OAuth client, not this
// app's: its redirect_uri is https://app.base44.com/api/apps/auth/callback and
// we cannot administer it, so no Google Cloud branding change would ever have
// taken effect through it. Set VITE_GOOGLE_CLIENT_ID to a client id from a
// Google Cloud project we control to enable this button.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * GoogleLoginButton — ZoaZone Shared Component
 * Uses Google Identity Services (GSI) One Tap + Button flow.
 * On success, exchanges the Google ID token with Base44 auth.
 *
 * NOT CURRENTLY MOUNTED — kept as scaffolding. /login redirects to /auth
 * (src/pages/Auth.jsx), which signs in through
 * base44.auth.loginWithProvider("google"). Its former consumer, pages/Login.jsx,
 * was unreachable dead code and has been deleted. Wiring this up requires both a
 * client id above AND a backend function that verifies the returned Google ID
 * token and mints an app session — see handleCredential below.
 *
 * Props:
 *   onSuccess(credential) — called with the Base44 session after login
 *   onError(err)          — called if login fails
 *   theme                 — "filled_black" | "filled_blue" | "outline" (default: "filled_black")
 *   text                  — "signin_with" | "signup_with" | "continue_with" (default: "signin_with")
 */
export default function GoogleLoginButton({
  onSuccess,
  onError,
  theme = "filled_black",
  text = "signin_with",
  base44,
}) {
  const btnRef = useRef(null);

  useEffect(() => {
    // No client id configured — render nothing rather than initialising GSI with
    // an empty client_id, which fails with an opaque console error.
    if (!GOOGLE_CLIENT_ID) {
      console.warn("[GoogleLogin] VITE_GOOGLE_CLIENT_ID is not set — button disabled.");
      return;
    }

    // Load GSI script if not already loaded
    if (!window.google?.accounts) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => initGoogle();
      document.head.appendChild(script);
    } else {
      initGoogle();
    }

    function initGoogle() {
      if (!window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Render the standard Google button
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme,
          size: "large",
          text,
          shape: "rectangular",
          width: btnRef.current.offsetWidth || 320,
          logo_alignment: "left",
        });
      }

      // Also show One Tap prompt
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // One Tap not shown - button is the fallback
          console.log("[GoogleLogin] One Tap not shown:", notification.getNotDisplayedReason?.());
        }
      });
    }

    async function handleCredential(response) {
      try {
        const { credential } = response;
        if (!credential) throw new Error("No credential returned from Google");

        // Exchange Google ID token with Base44
        let session;
        if (base44?.auth?.loginWithGoogle) {
          session = await base44.auth.loginWithGoogle({ credential });
        } else if (base44?.auth?.googleLogin) {
          session = await base44.auth.googleLogin({ credential });
        } else {
          // No SDK method to exchange a Google ID token for an app session.
          // The previous fallback here POSTed to https://base44.app/api/auth/google
          // — a hardcoded base44.app endpoint that is not part of the public API
          // and returns nothing usable, so this path silently failed while
          // looking like it worked. Fail loudly instead: exchanging the token
          // needs a backend function of ours that verifies the JWT against
          // https://www.googleapis.com/oauth2/v3/certs, checks aud/iss/exp, and
          // then issues the session.
          throw new Error(
            "Google sign-in is not wired up: no token-exchange backend is configured.",
          );
        }

        // Persist token
        const token = session?.access_token || session?.token || session?.data?.access_token;
        if (token) {
          localStorage.setItem("base44_access_token", token);
          if (base44?.auth?.setToken) base44.auth.setToken(token);
        }

        onSuccess?.(session);
      } catch (err) {
        console.error("[GoogleLogin] Error:", err);
        onError?.(err);
      }
    }

    return () => {
      // Cleanup: cancel One Tap on unmount
      window.google?.accounts?.id?.cancel?.();
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="w-full">
      <div ref={btnRef} className="w-full flex justify-center" />
    </div>
  );
}
