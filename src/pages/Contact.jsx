import LegalPage from '@/components/LegalPage';

export default function Contact() {
  return <LegalPage title="Contact Us" path="/contact">
    <section><h2 className="text-xl font-semibold">India office</h2><p>Zoa Zone Services Pvt Ltd<br />376, G3, Road No 82, Film Nagar, Jubilee Hills, Hyderabad, Telangana 500096, India</p></section>
    <section><h2 className="text-xl font-semibold">Global operations</h2><p>Zoa Zone Services LLC<br />1770 Grand Concourse 12A, Bronx, NY 10457, USA</p></section>
    <p>Email: <a className="text-primary underline" href="mailto:care@zoazoneservices.com">care@zoazoneservices.com</a><br />Phone: <a className="text-primary underline" href="tel:+12566998899">+1 256 699 8899</a><br />Business hours: Monday–Saturday, 10:00–18:00 IST.</p>
    <section><h2 className="text-xl font-semibold">Grievance Officer — India</h2><p>Grievance Officer, Zoa Zone Services Pvt Ltd<br />Email: <a className="text-primary underline" href="mailto:care@zoazoneservices.com">care@zoazoneservices.com</a></p><p>For grievances relating to the service in India, please email the officer with your account details and a description of the issue. We aim to respond within 48 hours and resolve within 15 days, per the Information Technology Rules, 2021.</p></section>
  </LegalPage>;
}