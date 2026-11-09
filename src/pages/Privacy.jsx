import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const BRAND = {
  name: "AEVOICE AI",
  domain: "aevoice.ai",
  supportEmail: "privacy@aevoice.ai",
  dpoEmail: "dpo@aevoice.ai",
  companyName: "AEVOICE AI Inc.",
  companyAddress: "United States",
  effectiveDate: "May 10, 2026",
  lastReviewed: "May 10, 2026",
};

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "data-collected", label: "Data We Collect" },
  { id: "messaging-consent", label: "Messaging Consent" },
  { id: "a2p-compliance", label: "A2P & TCPA" },
  { id: "whatsapp-policy", label: "WhatsApp Policy" },
  { id: "email-policy", label: "Email Policy" },
  { id: "security", label: "Security" },
  { id: "user-rights", label: "Your Rights" },
  { id: "data-retention", label: "Data Retention" },
  { id: "hipaa", label: "HIPAA (Health)" },
  { id: "children", label: "Children's Privacy" },
  { id: "changes", label: "Policy Changes" },
  { id: "contact", label: "Contact Us" },
];

export default function PrivacyConsentPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [consentGiven, setConsentGiven] = useState({
    email: false,
    sms: false,
    whatsapp: false,
    marketing: false,
  });
  const [showConsentBanner, setShowConsentBanner] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("aevoice_consent");
    if (!stored) setShowConsentBanner(true);

    const handleScroll = () => {
      const sections = SECTIONS.map((s) => document.getElementById(s.id));
      const scrollY = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i] && sections[i].offsetTop <= scrollY) {
          setActiveSection(SECTIONS[i].id);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveConsent = () => {
    localStorage.setItem("aevoice_consent", JSON.stringify({ ...consentGiven, timestamp: new Date().toISOString() }));
    setShowConsentBanner(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">

      {/* ── Consent Banner ── */}
      {showConsentBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-indigo-700 shadow-2xl p-4 md:p-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm text-gray-300 mb-3">
              🔒 <strong className="text-white">AEVOICE AI</strong> uses your contact details to send account alerts,
              OTPs, transaction receipts, and service updates. We require your explicit consent per{" "}
              <span className="text-indigo-400">TCPA / A2P 10DLC / GDPR / CCPA</span> rules.
            </p>
            <div className="flex flex-wrap gap-4 mb-4">
              {[
                { key: "email", label: "📧 Transactional Emails" },
                { key: "sms", label: "📱 SMS / Text Messages" },
                { key: "whatsapp", label: "💬 WhatsApp Messages" },
                { key: "marketing", label: "📢 Marketing & Promotions" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentGiven[key]}
                    onChange={(e) => setConsentGiven((c) => ({ ...c, [key]: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="text-sm text-gray-200">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={saveConsent}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-semibold transition"
              >
                Save My Preferences
              </button>
              <button
                onClick={() => {
                  setConsentGiven({ email: true, sms: false, whatsapp: false, marketing: false });
                  setTimeout(saveConsent, 0);
                }}
                className="border border-gray-600 text-gray-300 hover:text-white px-5 py-2 rounded-lg text-sm transition"
              >
                Essential Only
              </button>
              <a href="#messaging-consent" onClick={() => scrollTo("messaging-consent")} className="text-indigo-400 text-sm self-center underline">
                Learn more
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-gradient-to-b from-indigo-950 to-gray-950 border-b border-indigo-900/40 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-indigo-600/20 text-indigo-400 text-xs px-3 py-1 rounded-full border border-indigo-700/50">
              Legal & Compliance
            </span>
            <span className="bg-green-600/20 text-green-400 text-xs px-3 py-1 rounded-full border border-green-700/50">
              GDPR · CCPA · TCPA · A2P 10DLC · HIPAA · CAN-SPAM
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Privacy, Security & Consent Policy
          </h1>
          <p className="text-gray-400 text-base max-w-2xl">
            This policy governs how <strong className="text-white">{BRAND.companyName}</strong> collects, uses, stores, and communicates with you across all our platforms — including AEVOICE Voice Platform, Marketer, Sree OS, Aevathon, and HealthAI Companion.
          </p>
          <p className="text-gray-500 text-sm mt-4">
            Effective Date: <span className="text-gray-300">{BRAND.effectiveDate}</span> &nbsp;|&nbsp;
            Last Reviewed: <span className="text-gray-300">{BRAND.lastReviewed}</span>
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 px-4 py-10">

        {/* ── Sidebar Nav ── */}
        <aside className="md:w-56 flex-shrink-0">
          <div className="sticky top-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 font-semibold">Contents</p>
            <nav className="flex flex-col gap-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`text-left text-sm px-3 py-1.5 rounded-lg transition ${
                    activeSection === s.id
                      ? "bg-indigo-600/20 text-indigo-300 font-semibold"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 space-y-14 pb-24">

          {/* 1. OVERVIEW */}
          <Section id="overview" title="1. Overview & Scope">
            <p>
              <strong>{BRAND.companyName}</strong> ("AEVOICE", "we", "us", or "our") operates the following platforms under the <code className="text-indigo-400 bg-gray-900 px-1 rounded">{BRAND.domain}</code> umbrella:
            </p>
            <ul className="mt-3 space-y-2">
              {[
                ["AEVOICE Voice Platform", "cream.aevoice.ai", "AI phone agents, CRM, call analytics"],
                ["Marketer", "media.aevoice.ai", "AI-powered marketing, campaigns, social scheduling"],
                ["Sree OS", "os.aevoice.ai", "Developer console, workflow engine"],
                ["Aevathon", "aevathon.aevoice.ai", "AI tools and automation suite"],
                ["HealthAI Companion", "health.workautomation.app", "Health AI platform — HIPAA-applicable"],
              ].map(([name, domain, desc]) => (
                <li key={name} className="flex flex-col sm:flex-row sm:items-start gap-1 bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-3">
                  <span className="font-semibold text-white w-48 flex-shrink-0">{name}</span>
                  <span className="text-indigo-400 text-sm w-52 flex-shrink-0">{domain}</span>
                  <span className="text-gray-400 text-sm">{desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              This policy applies to all visitors, registered users, business account holders, and their end customers who interact with any AEVOICE platform. By creating an account or using any AEVOICE service, you agree to this policy.
            </p>
            <AlertBox type="info">
              <strong>Platform Operators (Businesses):</strong> If you use AEVOICE to serve your own customers, you are the Data Controller for your customers' data. AEVOICE acts as a Data Processor on your behalf. You must maintain your own privacy disclosures and ensure your customers consent to AI-assisted calls.
            </AlertBox>
          </Section>

          {/* 2. DATA COLLECTED */}
          <Section id="data-collected" title="2. Data We Collect">
            <p>We collect the minimum data necessary to operate our services. Here's what we collect and why:</p>

            <SubHeading>2.1 Account & Identity Data</SubHeading>
            <DataTable rows={[
              ["Full Name", "Account creation, service personalization", "Contract performance"],
              ["Email Address", "Account alerts, OTPs, billing receipts, login", "Contract + Legitimate interest"],
              ["Phone Number", "SMS OTPs, account security, WhatsApp alerts", "Consent + Contract"],
              ["Company Name", "Business account features, invoicing", "Contract performance"],
              ["Payment Information", "Billing (processed by Stripe — we never store raw card data)", "Contract performance"],
            ]} />

            <SubHeading>2.2 Platform Usage Data</SubHeading>
            <DataTable rows={[
              ["Call Transcripts & Recordings", "AI training, quality review, compliance", "Legitimate interest + Consent"],
              ["Agent Configuration", "Service delivery", "Contract performance"],
              ["Knowledge Base Content", "AI voice agent responses", "Contract performance"],
              ["Login & Session Logs", "Security, fraud detection", "Legitimate interest"],
              ["IP Address & Device Info", "Security, geo-compliance", "Legitimate interest"],
            ]} />

            <SubHeading>2.3 Communications Data</SubHeading>
            <DataTable rows={[
              ["Messages sent/received via SMS", "Delivery confirmation, compliance logging", "Consent + Legal obligation"],
              ["WhatsApp message logs", "Support, compliance", "Consent"],
              ["Email open/click data", "Service improvement (opt-out available)", "Legitimate interest"],
            ]} />

            <SubHeading>2.4 Health Data (HealthAI Companion only)</SubHeading>
            <p className="text-yellow-400 text-sm">
              ⚕️ Health-related data processed through HealthAI Companion is treated as PHI (Protected Health Information) under HIPAA. See Section 10 for full details.
            </p>
          </Section>

          {/* 3. MESSAGING CONSENT */}
          <Section id="messaging-consent" title="3. Messaging Consent — SMS, WhatsApp & Email">
            <AlertBox type="warning">
              <strong>Explicit Consent Required:</strong> We obtain your explicit, informed consent before sending any SMS, WhatsApp, or marketing email. Consent is separate for each channel and can be withdrawn at any time.
            </AlertBox>

            <SubHeading>3.1 How We Collect Consent</SubHeading>
            <ul className="space-y-2 text-gray-300">
              {[
                "At account registration, via clearly labeled checkboxes for each communication channel (SMS, WhatsApp, Email).",
                "Consent is not pre-checked and is not a condition of using core services.",
                "Transactional messages (OTPs, billing alerts, security notices) require consent as part of service enrollment.",
                "Marketing messages require separate, explicit opt-in.",
                "We log the timestamp, IP address, and method of consent for every user.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-400 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <SubHeading>3.2 Types of Messages We Send</SubHeading>
            <div className="grid sm:grid-cols-2 gap-4 mt-2">
              {[
                {
                  title: "🔐 Transactional / Account",
                  items: ["One-time passcodes (OTP)", "Login verification codes", "Password reset links", "Billing receipts & invoices", "Payment confirmations", "Subscription renewal reminders", "Account suspension notices", "Security alerts (unusual login, etc.)"],
                  color: "blue",
                },
                {
                  title: "⚙️ Service & Operations",
                  items: ["Agent status updates", "Call completion summaries", "System outage notifications", "Feature update announcements", "Usage limit alerts", "Support ticket updates"],
                  color: "purple",
                },
                {
                  title: "📢 Marketing (Opt-in Only)",
                  items: ["New feature releases", "Promotional offers", "Partner announcements", "Webinar & event invites", "Monthly newsletters"],
                  color: "green",
                },
                {
                  title: "🚫 We Will NEVER Send",
                  items: ["Unsolicited cold messages", "Third-party advertising without consent", "Messages after opt-out", "Misleading sender information", "Affiliate spam"],
                  color: "red",
                },
              ].map((card) => (
                <div key={card.title} className={`bg-gray-900/60 border border-gray-800 rounded-xl p-4`}>
                  <h4 className="font-semibold text-white mb-2">{card.title}</h4>
                  <ul className="space-y-1">
                    {card.items.map((item) => (
                      <li key={item} className="text-gray-400 text-sm flex gap-1.5">
                        <span className="text-gray-600">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <SubHeading>3.3 How to Opt Out</SubHeading>
            <div className="grid sm:grid-cols-3 gap-4 mt-2">
              {[
                { channel: "SMS", method: 'Reply "STOP" to any message', note: "You will receive one final confirmation. No further messages." },
                { channel: "WhatsApp", method: "Message 'STOP' or go to Settings → Notifications", note: "Opt-out processed within 24 hours." },
                { channel: "Email", method: 'Click "Unsubscribe" in any email footer', note: "Mandatory transactional emails continue." },
              ].map((opt) => (
                <div key={opt.channel} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <h4 className="text-indigo-400 font-bold text-sm mb-1">📵 {opt.channel}</h4>
                  <p className="text-white text-sm font-medium">{opt.method}</p>
                  <p className="text-gray-400 text-xs mt-1">{opt.note}</p>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-sm mt-3">
              You may also manage all notification preferences in your account Settings → Notifications, or by emailing <a href={`mailto:${BRAND.supportEmail}`} className="text-indigo-400 underline">{BRAND.supportEmail}</a>.
            </p>
          </Section>

          {/* 4. A2P & TCPA */}
          <Section id="a2p-compliance" title="4. A2P 10DLC & TCPA Compliance">
            <p>
              AEVOICE sends application-to-person (A2P) SMS messages through registered US carriers in compliance with{" "}
              <strong className="text-white">A2P 10DLC (10-Digit Long Code)</strong> regulations enforced by The Campaign Registry (TCR) and US wireless carriers.
            </p>

            <SubHeading>4.1 Our A2P Commitments</SubHeading>
            <ul className="space-y-2 text-gray-300">
              {[
                "All SMS campaigns are registered with The Campaign Registry (TCR) with declared use cases.",
                "We identify our brand name clearly in every message (e.g., 'AEVOICE:').",
                "Message content is pre-approved and consistent with the registered campaign use case.",
                "We maintain a valid opt-out mechanism in EVERY message we send.",
                "We do not send messages between 9:00 PM and 8:00 AM local recipient time.",
                "We maintain consent records for a minimum of 5 years.",
                "We do not share or sell phone numbers to third-party marketers.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-green-400 mt-0.5">✓</span> {item}
                </li>
              ))}
            </ul>

            <SubHeading>4.2 TCPA Compliance</SubHeading>
            <p>
              Under the <strong className="text-white">Telephone Consumer Protection Act (TCPA)</strong>:
            </p>
            <ul className="space-y-2 mt-2 text-gray-300">
              {[
                "We obtain prior express written consent before sending marketing SMS messages.",
                "We honor STOP requests immediately and keep suppression lists indefinitely.",
                "Our AI phone agents identify themselves as automated systems at the start of every call.",
                "We do not use auto-dialers to contact individuals who have not consented to receive calls.",
                "For healthcare-related calls via HealthAI, we follow additional FCC exemptions and HIPAA guidelines.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-green-400 mt-0.5">✓</span> {item}
                </li>
              ))}
            </ul>

            <SubHeading>4.3 For Business Operators Using AEVOICE</SubHeading>
            <AlertBox type="warning">
              If you deploy AI phone agents through AEVOICE to contact your own customers, <strong>you are legally responsible</strong> for:
              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                <li>Obtaining valid consent from your customers before initiating AI-assisted calls.</li>
                <li>Registering your own A2P campaigns if you send SMS through our platform.</li>
                <li>Ensuring your agent scripts comply with applicable telemarketing and robocall laws.</li>
                <li>Including disclosures that calls are AI-handled where required by state law (e.g., California AB 302).</li>
              </ul>
              AEVOICE provides compliance tools (consent toggles, call disclosures) but is not liable for operator misuse.
            </AlertBox>
          </Section>

          {/* 5. WHATSAPP */}
          <Section id="whatsapp-policy" title="5. WhatsApp Business Messaging Policy">
            <p>
              AEVOICE sends WhatsApp messages through the official <strong className="text-white">WhatsApp Business API</strong> (Meta) and complies with WhatsApp's Business Messaging Policy and Commerce Policy.
            </p>

            <SubHeading>5.1 WhatsApp Consent Rules</SubHeading>
            <ul className="space-y-2 text-gray-300">
              {[
                "You must explicitly opt in to receive WhatsApp messages from AEVOICE.",
                "Opt-in is collected through our registration form or account settings — never assumed.",
                "We clearly state the types of messages you will receive at the time of opt-in.",
                "We include our business name in every WhatsApp message.",
                "You may opt out at any time by messaging 'STOP' or through your account settings.",
                "We do not send promotional WhatsApp messages without a prior opt-in.",
                "We only use approved WhatsApp Message Templates for regulated message categories.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-green-400 mt-0.5">✓</span> {item}
                </li>
              ))}
            </ul>

            <SubHeading>5.2 WhatsApp Message Types We Use</SubHeading>
            <DataTable rows={[
              ["Authentication", "OTPs, verification codes", "Transactional — requires service enrollment"],
              ["Utility", "Account alerts, billing receipts, subscription status", "Transactional — requires service enrollment"],
              ["Marketing", "Promotions, offers, newsletters", "Requires explicit marketing opt-in"],
            ]} headers={["Category", "Examples", "Consent Required"]} />

            <p className="text-gray-400 text-sm mt-3">
              AEVOICE does not use WhatsApp for spam, bulk cold outreach, or sharing user data with Meta beyond what is required for message delivery.
            </p>
          </Section>

          {/* 6. EMAIL */}
          <Section id="email-policy" title="6. Email Communications Policy">
            <p>
              All email communications from AEVOICE comply with <strong className="text-white">CAN-SPAM Act (US)</strong>, <strong className="text-white">CASL (Canada)</strong>, <strong className="text-white">GDPR (EU)</strong>, and applicable international email marketing laws.
            </p>

            <SubHeading>6.1 CAN-SPAM Compliance</SubHeading>
            <ul className="space-y-2 text-gray-300">
              {[
                "Every email clearly identifies AEVOICE AI Inc. as the sender.",
                "Subject lines are never deceptive or misleading.",
                "Every marketing email includes a physical postal address.",
                "Every marketing email includes a clear, working unsubscribe link.",
                "Unsubscribe requests are honored within 10 business days.",
                "We do not use purchased email lists.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-green-400 mt-0.5">✓</span> {item}
                </li>
              ))}
            </ul>

            <SubHeading>6.2 Transactional vs. Marketing Emails</SubHeading>
            <p>
              <strong className="text-white">Transactional emails</strong> (OTPs, billing receipts, security alerts, account notices) are sent based on your service enrollment. These cannot be fully opted out of while your account is active — they are essential to service delivery and account security.
            </p>
            <p className="mt-2">
              <strong className="text-white">Marketing emails</strong> require a separate opt-in and can be unsubscribed from at any time without affecting your account access.
            </p>
          </Section>

          {/* 7. SECURITY */}
          <Section id="security" title="7. Security Measures">
            <p>We implement industry-standard security controls to protect your data:</p>

            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {[
                {
                  icon: "🔒",
                  title: "Encryption",
                  items: ["TLS 1.2+ for all data in transit", "AES-256 encryption for data at rest", "End-to-end encryption for sensitive fields", "Call recordings encrypted in storage"],
                },
                {
                  icon: "🛡️",
                  title: "Access Control",
                  items: ["Role-based access control (RBAC)", "Multi-factor authentication (MFA) available", "Session timeout and token rotation", "Principle of least privilege enforced"],
                },
                {
                  icon: "🔍",
                  title: "Monitoring",
                  items: ["24/7 infrastructure monitoring", "Anomaly detection & alerting", "Audit logs for all admin actions", "Automated threat scanning"],
                },
                {
                  icon: "📋",
                  title: "Compliance & Audits",
                  items: ["SOC 2 Type II aligned practices", "Regular penetration testing", "Vulnerability disclosure program", "Incident response plan (< 72hr notification)"],
                },
                {
                  icon: "🗝️",
                  title: "OTP & Passcode Security",
                  items: ["OTPs expire in 5 minutes", "OTPs are single-use only", "Failed OTP attempts locked after 5 tries", "OTPs never stored in plain text"],
                },
                {
                  icon: "🏢",
                  title: "Infrastructure",
                  items: ["Hosted on SOC 2 certified cloud providers", "Data residency in US (default)", "Automated backups with tested recovery", "No customer data used for AI model training without consent"],
                },
              ].map((card) => (
                <div key={card.title} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                  <h4 className="font-semibold text-white mb-2">{card.icon} {card.title}</h4>
                  <ul className="space-y-1">
                    {card.items.map((item) => (
                      <li key={item} className="text-gray-400 text-sm flex gap-1.5">
                        <span className="text-green-400">✓</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <SubHeading>7.1 Reporting a Security Issue</SubHeading>
            <p>
              If you discover a security vulnerability, please report it responsibly to{" "}
              <a href="mailto:security@aevoice.ai" className="text-indigo-400 underline">security@aevoice.ai</a>. We commit to acknowledging your report within 48 hours and providing a remediation timeline within 7 business days. We do not pursue legal action against good-faith security researchers.
            </p>
          </Section>

          {/* 8. USER RIGHTS */}
          <Section id="user-rights" title="8. Your Privacy Rights">
            <p>Depending on your location, you have the following rights regarding your personal data:</p>

            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {[
                { right: "Right to Access", desc: "Request a copy of all personal data we hold about you.", how: "Email privacy@aevoice.ai or use Settings → Data Export" },
                { right: "Right to Correction", desc: "Request correction of inaccurate or incomplete data.", how: "Update directly in Settings, or email us" },
                { right: "Right to Deletion", desc: "Request deletion of your data ('Right to be Forgotten').", how: "Settings → Delete Account, or email us" },
                { right: "Right to Portability", desc: "Receive your data in a machine-readable format.", how: "Email privacy@aevoice.ai with your request" },
                { right: "Right to Object", desc: "Object to processing of your data for marketing purposes.", how: "Unsubscribe links in messages or Settings → Notifications" },
                { right: "Right to Restrict", desc: "Request limitation of how we use your data.", how: "Email privacy@aevoice.ai with your request" },
                { right: "Opt-Out of Sale (CCPA)", desc: "California residents: opt out of sale of personal information.", how: "We do not sell personal information. No action needed." },
                { right: "Withdraw Consent", desc: "Withdraw any consent given at any time.", how: "Settings → Notifications, or reply STOP to messages" },
              ].map((r) => (
                <div key={r.right} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                  <h4 className="text-indigo-300 font-semibold text-sm mb-1">{r.right}</h4>
                  <p className="text-gray-300 text-sm">{r.desc}</p>
                  <p className="text-gray-500 text-xs mt-2">📌 How: {r.how}</p>
                </div>
              ))}
            </div>

            <p className="text-gray-400 text-sm mt-4">
              We respond to all verified requests within <strong className="text-white">30 days</strong>. Complex requests may be extended by an additional 60 days with notice. Identity verification may be required before processing sensitive requests.
            </p>

            <SubHeading>8.1 California Residents (CCPA / CPRA)</SubHeading>
            <p>
              California residents have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA). We do <strong className="text-white">not sell</strong> or <strong className="text-white">share</strong> personal information for cross-context behavioral advertising. You may submit a request to know, delete, or correct your data by emailing{" "}
              <a href={`mailto:${BRAND.supportEmail}`} className="text-indigo-400 underline">{BRAND.supportEmail}</a>.
            </p>

            <SubHeading>8.2 EU / UK Residents (GDPR / UK GDPR)</SubHeading>
            <p>
              EU and UK residents may lodge a complaint with their local supervisory authority if they believe their data rights have been violated. Our Data Protection Officer can be contacted at{" "}
              <a href={`mailto:${BRAND.dpoEmail}`} className="text-indigo-400 underline">{BRAND.dpoEmail}</a>.
            </p>
          </Section>

          {/* 9. DATA RETENTION */}
          <Section id="data-retention" title="9. Data Retention">
            <DataTable
              headers={["Data Type", "Retention Period", "Reason"]}
              rows={[
                ["Account data", "Duration of account + 2 years post-closure", "Legal obligation, dispute resolution"],
                ["Call recordings", "90 days (default) — configurable by operator", "Quality review, compliance"],
                ["Call transcripts", "12 months", "AI improvement, compliance logging"],
                ["Billing & transaction records", "7 years", "Tax and accounting obligations"],
                ["SMS / WhatsApp consent logs", "5 years", "TCPA / A2P compliance"],
                ["Email consent logs", "5 years", "CAN-SPAM / GDPR compliance"],
                ["Security & access logs", "12 months", "Security incident investigation"],
                ["OTPs / passcodes", "Deleted immediately after use or 5-minute expiry", "Security"],
                ["Marketing analytics", "36 months", "Service improvement"],
                ["Health data (HealthAI)", "Minimum 6 years — see HIPAA section", "HIPAA compliance"],
              ]}
            />
            <p className="text-gray-400 text-sm mt-3">
              Upon account deletion, we anonymize or delete personal data within <strong className="text-white">30 days</strong>, except where retention is required by law. Anonymized, aggregated data may be retained indefinitely for platform analytics.
            </p>
          </Section>

          {/* 10. HIPAA */}
          <Section id="hipaa" title="10. HIPAA Compliance — HealthAI Companion">
            <AlertBox type="warning">
              This section applies exclusively to the <strong>HealthAI Companion</strong> platform (<code className="text-yellow-300">health.workautomation.app</code>). Other AEVOICE platforms do not process Protected Health Information (PHI).
            </AlertBox>

            <ul className="space-y-2 text-gray-300 mt-4">
              {[
                "AEVOICE enters into a Business Associate Agreement (BAA) with all covered entities using HealthAI Companion.",
                "PHI is encrypted at rest (AES-256) and in transit (TLS 1.3).",
                "Access to PHI is strictly role-based and logged in immutable audit trails.",
                "PHI is never used to train AI models without explicit authorization.",
                "Call recording PHI redaction is available and enabled by default for healthcare accounts.",
                "Transcript PHI redaction removes names, SSNs, dates of birth, and other identifiers.",
                "Data is retained for a minimum of 6 years per HIPAA requirements.",
                "Breach notification is provided within 60 days of discovery per HIPAA Breach Notification Rule.",
                "De-identification of health data follows the HIPAA Safe Harbor method.",
                "HIPAA training is completed by all staff with access to PHI systems.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-green-400 mt-0.5">✓</span> {item}
                </li>
              ))}
            </ul>
          </Section>

          {/* 11. CHILDREN */}
          <Section id="children" title="11. Children's Privacy">
            <p>
              AEVOICE services are intended for use by businesses and individuals aged <strong className="text-white">18 and older</strong>. We do not knowingly collect personal information from individuals under 18 years of age. If you believe a minor has provided us with personal information, please contact{" "}
              <a href={`mailto:${BRAND.supportEmail}`} className="text-indigo-400 underline">{BRAND.supportEmail}</a> and we will delete it promptly.
            </p>
          </Section>

          {/* 12. CHANGES */}
          <Section id="changes" title="12. Policy Changes">
            <p>
              We may update this policy periodically to reflect changes in our practices, technologies, or legal obligations. When we make material changes, we will:
            </p>
            <ul className="space-y-2 mt-2 text-gray-300">
              {[
                "Post the updated policy on this page with a new effective date.",
                "Send an email notification to all registered account holders.",
                "Display an in-app banner for 30 days after the update.",
                "For material changes affecting messaging consent, we will re-collect your explicit consent.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-400 mt-0.5">•</span> {item}
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Continued use of our services after the effective date of any updates constitutes acceptance of the revised policy.
            </p>
          </Section>

          {/* 13. CONTACT */}
          <Section id="contact" title="13. Contact & Data Requests">
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { title: "General Privacy Inquiries", email: BRAND.supportEmail, icon: "📧" },
                { title: "Data Protection Officer (EU/UK)", email: BRAND.dpoEmail, icon: "🏛️" },
                { title: "Security Vulnerability Reports", email: "security@aevoice.ai", icon: "🔒" },
                { title: "CCPA / CPRA Requests", email: BRAND.supportEmail, icon: "📋" },
              ].map((c) => (
                <div key={c.title} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-400 text-sm mb-1">{c.icon} {c.title}</p>
                  <a href={`mailto:${c.email}`} className="text-indigo-400 underline font-medium">{c.email}</a>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-sm mt-4">
              We aim to respond to all inquiries within <strong className="text-white">5 business days</strong>. Data subject requests are handled within 30 days as required by applicable law.
            </p>
          </Section>

          {/* Footer signature */}
          <div className="border-t border-gray-800 pt-8 text-center text-gray-500 text-sm">
            <p>{BRAND.companyName} · {BRAND.domain} · Effective {BRAND.effectiveDate}</p>
            <p className="mt-1">
              Questions? <a href={`mailto:${BRAND.supportEmail}`} className="text-indigo-400 underline">{BRAND.supportEmail}</a>
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}

// ── Helper Components ──

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="w-1 h-6 bg-indigo-500 rounded-full flex-shrink-0" />
        {title}
      </h2>
      <div className="text-gray-300 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function SubHeading({ children }) {
  return <h3 className="text-base font-semibold text-indigo-300 mt-5 mb-2">{children}</h3>;
}

function AlertBox({ type = "info", children }) {
  const styles = {
    info: "bg-blue-950/40 border-blue-700/50 text-blue-200",
    warning: "bg-yellow-950/40 border-yellow-700/50 text-yellow-200",
    danger: "bg-red-950/40 border-red-700/50 text-red-200",
  };
  const icons = { info: "ℹ️", warning: "⚠️", danger: "🚫" };
  return (
    <div className={`border rounded-xl p-4 text-sm leading-relaxed mt-3 ${styles[type]}`}>
      <span className="mr-2">{icons[type]}</span>
      {children}
    </div>
  );
}

function DataTable({ rows, headers }) {
  return (
    <div className="overflow-x-auto mt-3 rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800">
            {(headers || ["Data / Field", "Purpose", "Legal Basis"]).map((h) => (
              <th key={h} className="text-left px-4 py-3 text-gray-400 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-gray-800/50 ${i % 2 === 0 ? "bg-gray-900/30" : ""}`}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
