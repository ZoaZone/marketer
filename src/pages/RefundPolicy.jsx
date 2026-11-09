import { Link } from 'react-router-dom';
import LegalPage from '@/components/LegalPage';

export default function RefundPolicy() {
  return <LegalPage title="Refund & Cancellation Policy" path="/refund-policy">
    <p>DigitalStudios.app subscriptions renew automatically unless cancelled. You can cancel at any time in your account settings under Billing. Cancellation stops the next renewal and takes effect at the end of your current billing cycle; you retain access until then.</p>
    <p>For a refund request, email <a className="text-primary underline" href="mailto:care@zoazoneservices.com">care@zoazoneservices.com</a> with your account email, payment date, transaction reference and reason. We review eligibility under your purchase terms and applicable law. Eligible refunds are processed within 5–7 business days to the original payment method after approval; the payment provider or bank may take additional time to show the credit.</p>
    <p>Failed or duplicate debits are automatically refunded after confirmation. If a reversal has not appeared, send us the transaction reference so we can investigate. Used AI credits, generation and render usage are generally not refundable once consumed, except where required by law. See our <Link to="/terms" className="text-primary underline">Terms & Conditions</Link> for further details.</p>
  </LegalPage>;
}