import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { getOrCreateCookieId } from "@/utils/affiliate";

export default function PayPalButton({ amount, currency = "INR", planName = "", planTier = "", userEmail = "", onError }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePayPal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("paypalCheckout", {
        action: "create_order",
        amount,
        currency,
        plan_name: planName,
        plan_tier: planTier,
        customer_email: userEmail,
        cookie_id: getOrCreateCookieId(),
      });
      const data = res?.data;
      if (!data?.success || !data?.approve_url) {
        throw new Error(data?.error || "PayPal order creation failed");
      }
      window.location.href = data.approve_url;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "PayPal error. Please try again.";
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
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
        <span>{loading ? "Redirecting…" : `Pay ${new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(amount)} with PayPal`}</span>
      </button>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <p className="text-[10px] text-white/25 text-center">
        Secured by PayPal
      </p>
    </div>
  );
}