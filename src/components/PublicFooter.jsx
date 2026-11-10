import { Link } from 'react-router-dom';
import EcosystemLinks from '@/components/EcosystemLinks';

const links = [
  ['/about', 'About Us'], ['/contact', 'Contact Us'], ['/pricing', 'Pricing'],
  ['/privacy', 'Privacy Policy'], ['/terms', 'Terms & Conditions'],
  ['/refund-policy', 'Refund & Cancellation Policy'], ['/shipping-policy', 'Shipping & Delivery Policy'],
  ['/agent-program', 'Agent Program'],
];

// chitra.medha.io is a white-labeled storefront of this same app/database,
// operated by Zoa Zone Digi Tech Pvt Ltd. Override footer identity for that
// host only; every other hostname (digitalstudios.app, etc.) renders unchanged.
export default function PublicFooter() {
  const onMedha = typeof window !== "undefined" && window.location.hostname === "chitra.medha.io";
  const email = onMedha ? "care@medha.io" : "care@zoazoneservices.com";
  const brandName = onMedha ? "Chitra" : "DigitalStudios.app";

  return <footer className="bg-neutral-950 text-neutral-300 border-t border-white/10 px-6 py-8 text-sm">
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        {onMedha ? (
          <p>Zoa Zone Digi Tech Pvt Ltd, 376, Road No. 82, Film Nagar, Jubilee Hills, Hyderabad, Telangana 500096, India.</p>
        ) : (
          <>
            <p>Zoa Zone Services LLC, 1770 Grand Concourse 12A, Bronx, NY 10457, USA.</p>
            <p>Zoa Zone Services Pvt Ltd, 376, G3, Road No 82, Film Nagar, Jubilee Hills, Hyderabad, Telangana 500096, India.</p>
          </>
        )}
      </div>
      <EcosystemLinks selfKey="digitalstudio" onMedha={onMedha} />
      <p>© 2026 {brandName}. All rights reserved.</p>
      <p><a className="hover:text-white underline" href={`mailto:${email}`}>{email}</a></p>
      <nav aria-label="Public information" className="flex flex-wrap gap-x-5 gap-y-2">{links.map(([path, label]) => <Link key={path} to={path} className="hover:text-white underline underline-offset-2">{label}</Link>)}</nav>
    </div>
  </footer>;
}