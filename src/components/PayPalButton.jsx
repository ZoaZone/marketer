// PayPalButton.jsx — India-only PayPal payment button
// Use alongside Stripe (international). Show this ONLY for INR / Indian billing.
// Drop into any Pricing or Billing page.
//
// Usage:
//   <PayPalButton amount={99} currency="INR" planName="Starter" sourceApp="hellobiz" userEmail={user.email} />

import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

const PAYPAL_FUNCTION_URL = "https://aeva-91fddc64.base44.app/functions/paypalCheckout";

export default function PayPalButton({ amount, currency = "INR", planName = "", sourceApp = "", userEmail = "", onError }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePayPal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(PAYPAL_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_order",
          amount,
          currency,
          plan_name: planName,
          source_app: sourceApp,
          customer_email: userEmail,
          description: planName ? `${planName} Plan` : "Payment",
        }),
      });
      const data = await res.json();
      if (!data.success || !data.approve_url) {
        throw new Error(data.error?.message || data.error || "PayPal order creation failed");
      }
      // Redirect to PayPal approval page
      window.location.href = data.approve_url;
    } catch (e) {
      setError(e.message || "PayPal error. Please try again.");
      if (onError) onError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handlePayPal}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full bg-[#FFC439] hover:bg-[#f0b429] text-[#003087] font-bold text-sm px-6 py-3 rounded-lg transition-all shadow-md disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <img
            src="https://www.paypalobjects.com/webstatic/mktg/Logo/pp-logo-100px.png"
            alt="PayPal"
            className="h-5"
          />
        )}
        {loading ? "Redirecting to PayPal..." : `Pay ₹${amount} with PayPal`}
      </button>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      <p className="text-[10px] text-muted-foreground">
        🇮🇳 India payments via Zoa Zone Services Pvt Ltd · Secured by PayPal
      </p>
    </div>
  );
}
