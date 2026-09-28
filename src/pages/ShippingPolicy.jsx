import LegalPage from '@/components/LegalPage';

export default function ShippingPolicy() {
  return <LegalPage title="Shipping & Delivery Policy" path="/shipping-policy">
    <p>DigitalStudios.app is a digital software service. There are no physical goods to ship, no shipping charges, and no delivery address is required.</p>
    <p>After successful payment, access to the purchased subscription or credits is delivered instantly online to your DigitalStudios.app account. Sign in to your account to use the service. Generating individual AI assets or rendering videos can take additional processing time depending on the job.</p>
    <p>If your purchase does not appear in your account after payment, contact <a className="text-primary underline" href="mailto:care@zoazoneservices.com">care@zoazoneservices.com</a> with your account email and transaction reference.</p>
  </LegalPage>;
}