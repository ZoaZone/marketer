import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
export default function PaymentCancel() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <XCircle className="w-16 h-16 text-red-400 mb-4" />
      <h1 className="text-3xl font-black mb-2">Payment Cancelled</h1>
      <p className="text-muted-foreground mb-6">No charges were made. You can try again anytime.</p>
      <Link to="/" className="px-6 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:opacity-90">
        Back to Pricing
      </Link>
    </div>
  );
}
