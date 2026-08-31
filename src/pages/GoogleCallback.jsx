import { useEffect, useState } from "react";
import { appParams } from "@/lib/app-params";

const AEVA_FUNCTION_URL = "https://app.base44.com/api/apps/69b1f1d60b1fb9d791fddc64/functions/googleAuthCallback";

export default function GoogleCallback() {
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const savedState = sessionStorage.getItem("google_oauth_state");
      const returnPath = sessionStorage.getItem("google_oauth_return") || "/Dashboard";

      if (urlParams.get("error")) {
        setError(urlParams.get("error") === "access_denied"
          ? "Google sign-in was cancelled."
          : `Google error: ${urlParams.get("error")}`);
        return;
      }

      if (!code) {
        setError("No authorization code received from Google.");
        return;
      }

      if (state !== savedState) {
        setError("Security state mismatch. Please try signing in again.");
        return;
      }

      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const appId = appParams?.appId;

      try {
        const response = await fetch(AEVA_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirect_uri: redirectUri, app_id: appId }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || err.message || `Authentication failed: ${response.status}`);
        }

        const session = await response.json();
        const token = session?.access_token || session?.token || session?.data?.access_token;

        if (token) {
          localStorage.setItem("base44_access_token", token);
          localStorage.setItem("token", token);
        }

        sessionStorage.removeItem("google_oauth_state");
        sessionStorage.removeItem("google_oauth_return");

        window.location.href = returnPath;
      } catch (err) {
        console.error("[GoogleCallback] Error:", err);
        setError(err.message || "Google sign-in failed. Please try again.");
      }
    }

    handleCallback();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Sign-in Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a href="/Login" className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium">
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-gray-700 font-medium">Signing you in...</p>
      </div>
    </div>
  );
}
