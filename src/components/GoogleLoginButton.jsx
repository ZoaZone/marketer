import { useEffect, useRef } from "react";
import { appParams } from "@/lib/app-params";

const GOOGLE_CLIENT_ID = "342662050420-hjsrds4v122ggc6np9hlcgp0n2dt5rqd.apps.googleusercontent.com";

export default function GoogleLoginButton({
  onSuccess,
  onError,
  theme = "filled_black",
  text = "signin_with",
  base44,
}) {
  const btnRef = useRef(null);

  useEffect(() => {
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
    }

    async function handleCredential(response) {
      try {
        const { credential } = response;
        if (!credential) throw new Error("No credential returned from Google");

        let session;
        if (base44?.auth?.loginWithGoogle) {
          session = await base44.auth.loginWithGoogle({ credential });
        } else if (base44?.auth?.googleLogin) {
          session = await base44.auth.googleLogin({ credential });
        } else {
          const appId = appParams?.appId;
          const url = appId
            ? `https://base44.app/api/auth/google?app_id=${appId}`
            : "https://base44.app/api/auth/google";
          const res = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${credential}`,
            },
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || err.error || `Auth failed: ${res.status}`);
          }
          session = await res.json();
        }

        const token = session?.access_token || session?.token || session?.data?.access_token;
        if (token) {
          localStorage.setItem("base44_access_token", token);
          localStorage.setItem("token", token);
          if (base44?.auth?.setToken) base44.auth.setToken(token);
        }

        onSuccess?.(session);
      } catch (err) {
        console.error("[GoogleLogin] Error:", err);
        onError?.(err);
      }
    }

    return () => {
      window.google?.accounts?.id?.cancel?.();
    };
  }, []);

  return (
    <div className="w-full">
      <div ref={btnRef} className="w-full flex justify-center" />
    </div>
  );
}
