import { Link } from 'react-router-dom';

const links = [
  ['/about', 'About Us'], ['/contact', 'Contact Us'], ['/pricing', 'Pricing'],
  ['/privacy', 'Privacy Policy'], ['/terms', 'Terms & Conditions'],
  ['/refund-policy', 'Refund & Cancellation Policy'], ['/shipping-policy', 'Shipping & Delivery Policy'],
  ['/agent-program', 'Agent Program'],
];

export default function PublicFooter() {
  return <footer className="bg-neutral-950 text-neutral-300 border-t border-white/10 px-6 py-8 text-sm">
    <div className="max-w-7xl mx-auto space-y-4">
      <p>© 2026 DigitalStudios.app. Operated in India by Zoa Zone Services Pvt Ltd, 376, G3, Road No 82, Film Nagar, Jubilee Hills, Hyderabad, Telangana 500096, India. Global operations: Zoa Zone Services LLC, 1770 Grand Concourse 12A, Bronx, NY 10457, USA.</p>
      <p><a className="hover:text-white underline" href="mailto:care@zoazoneservices.com">care@zoazoneservices.com</a> · <a className="hover:text-white underline" href="tel:+12566998899">+1 256 699 8899</a></p>
      <nav aria-label="Public information" className="flex flex-wrap gap-x-5 gap-y-2">{links.map(([path, label]) => <Link key={path} to={path} className="hover:text-white underline underline-offset-2">{label}</Link>)}</nav>
    </div>
  </footer>;
}