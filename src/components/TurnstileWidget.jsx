import { useEffect, useRef } from "react";

// The frontend half of the server-side Turnstile hook in
// base44/_shared/rateLimit.block.ts (copied into captureLeadFromForm,
// submitBetaRequest and sendAuthOTP). Both halves are env-gated and no-op
// until configured: the server ignores turnstile_token entirely while
// TURNSTILE_SECRET_KEY is unset, and this widget renders nothing (and never
// calls onToken) while VITE_TURNSTILE_SITE_KEY is unset. Set both to turn
// the check on — setting only the server secret without also setting this
// site key and deploying it would make the gated endpoints reject every
// request, since a request would never carry a token to verify.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

let scriptPromise = null;
function loadTurnstileScript() {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-turnstile]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-turnstile", "1");
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Drop into any public form. Calls onToken(token) once solved, and
 * onToken(null) if it expires or errors — callers should treat a null token
 * as "not verified yet" and either disable submit or let the server's
 * verifyTurnstile call reject it (it fails closed once configured).
 */
export default function TurnstileWidget({ onToken, className = "" }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onToken?.(token),
          "expired-callback": () => onToken?.(null),
          "error-callback": () => onToken?.(null),
        });
      })
      .catch(() => { /* Cloudflare unreachable — leave the form usable; the server-side check still applies if configured */ });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch (_) { /* already gone */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className={className} />;
}
