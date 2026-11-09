import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
export default function PaymentSuccess() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <CheckCircle className="w-16 h-16 text-emerald-400 mb-4" />
      <h1 className="text-3xl font-black mb-2">Payment Successful!</h1>
      <p className="text-muted-foreground mb-6">Thank you — your account has been upgraded.</p>
      <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:opacity-90">
        Go to Dashboard
      </Link>
    </div>
  );
}
