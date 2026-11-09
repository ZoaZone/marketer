/**
 * PrivacyFooterSnippet.jsx
 * 
 * Drop this into the footer of ANY AEVOICE app.
 * Route /privacy must point to PrivacyConsentPage.jsx
 * 
 * Usage:
 *   import PrivacyFooterSnippet from "@/components/PrivacyFooterSnippet";
 *   <PrivacyFooterSnippet />
 */

import { Link } from "react-router-dom";

export default function PrivacyFooterSnippet({ variant = "dark" }) {
  const textColor = variant === "dark" ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-700";
  const borderColor = variant === "dark" ? "border-gray-800" : "border-gray-200";

  return (
    <footer className={`border-t ${borderColor} mt-16 px-4 py-8`}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <p className={`${variant === "dark" ? "text-gray-600" : "text-gray-400"}`}>
          © {new Date().getFullYear()} AEVOICE AI Inc. All rights reserved.
        </p>
        <div className="flex flex-wrap gap-4 items-center">
          <Link to="/privacy" className={`${textColor} transition`}>
            🔒 Privacy & Consent Policy
          </Link>
          <span className={variant === "dark" ? "text-gray-700" : "text-gray-300"}>·</span>
          <a href="mailto:privacy@aevoice.ai" className={`${textColor} transition`}>
            privacy@aevoice.ai
          </a>
          <span className={variant === "dark" ? "text-gray-700" : "text-gray-300"}>·</span>
          <span className={`${variant === "dark" ? "text-gray-600" : "text-gray-400"} text-xs`}>
            A2P 10DLC · GDPR · CCPA · TCPA · HIPAA Compliant
          </span>
        </div>
      </div>
    </footer>
  );
}
