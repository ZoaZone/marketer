import { useState } from "react";
import { Link } from "react-router-dom";
import { useSeo, SEO } from "@/lib/seo";
import { FileText, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TERMS OF SERVICE — DRAFT FOR LEGAL REVIEW BEFORE RELIANCE
//
// Written to the owner's instructions (ZoaZone Services LLC and affiliates own
// the apps; payments flow to ZoaZone, affiliates, official partners or platform
// admins; personal and commercial use permitted, illegal use prohibited) and
// filled out with the clauses a SaaS platform of this shape normally carries.
//
// It is a starting draft, not legal advice, and three points genuinely need a
// lawyer's eye before this is relied on:
//
//   1. REFUNDS. A blanket "all payments are non-refundable" is unenforceable
//      against consumers in a number of markets — UK/EU distance-selling
//      cancellation rights, various US state rules, and India's consumer
//      protection regime among them — and card-scheme and Stripe/PayPal rules
//      cut across it too. §7 is therefore drafted as non-refundable EXCEPT where
//      law requires otherwise. That phrasing is far more likely to survive than
//      an absolute bar, which a court can strike out entirely and leave nothing.
//
//   2. VOICE CLONING AND DUBBING. Reproducing a person's voice without consent
//      is separately regulated in several jurisdictions and is the single
//      largest legal exposure this product carries. §6 puts the warranty on the
//      user, but that allocates risk — it does not remove it.
//
//   3. GOVERNING LAW. [STATE] below is a placeholder. It must name the LLC's
//      actual state of formation before publication.
//
// Placeholders in [SQUARE BRACKETS] must be filled before this is published.
// ─────────────────────────────────────────────────────────────────────────────

const CO = {
  legalName: "ZoaZone Services LLC",
  product: "Digital Studio",
  domain: "digitalstudios.app",
  supportEmail: "support@digitalstudios.app",
  legalEmail: "legal@digitalstudios.app",
  state: "[STATE]",
  address: "[REGISTERED ADDRESS]",
  effective: "August 30, 2026",
};

const SECTIONS = [
  { id: "acceptance", n: "1", label: "Acceptance" },
  { id: "who-we-are", n: "2", label: "Who we are" },
  { id: "eligibility", n: "3", label: "Eligibility & accounts" },
  { id: "licence", n: "4", label: "Your licence to use the Service" },
  { id: "acceptable-use", n: "5", label: "Acceptable use" },
  { id: "ai-content", n: "6", label: "AI content, voice & dubbing" },
  { id: "billing", n: "7", label: "Plans, billing & refunds" },
  { id: "credits", n: "8", label: "Credits & fair use" },
  { id: "affiliates", n: "9", label: "Affiliate & partner programme" },
  { id: "ip", n: "10", label: "Intellectual property" },
  { id: "third-party", n: "11", label: "Third-party services" },
  { id: "availability", n: "12", label: "Availability & support" },
  { id: "termination", n: "13", label: "Suspension & termination" },
  { id: "disclaimers", n: "14", label: "Disclaimers" },
  { id: "liability", n: "15", label: "Limitation of liability" },
  { id: "indemnity", n: "16", label: "Indemnity" },
  { id: "changes", n: "17", label: "Changes to these terms" },
  { id: "law", n: "18", label: "Governing law & disputes" },
  { id: "general", n: "19", label: "General" },
  { id: "contact", n: "20", label: "Contact" },
];

const H = ({ id, n, children }) => (
  <h2 id={id} className="scroll-mt-24 text-lg font-bold text-foreground mt-10 mb-3 flex gap-2.5">
    <span className="text-fuchsia-400 font-mono text-sm mt-1 flex-shrink-0">{n}.</span>
    <span>{children}</span>
  </h2>
);
const P = ({ children }) => <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>;
const L = ({ children }) => <li className="text-sm text-muted-foreground leading-relaxed mb-1.5">{children}</li>;
const UL = ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-0.5">{children}</ul>;
const Strong = ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>;

export default function Terms() {
  useSeo(SEO.terms);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-5 py-12">

        <header className="mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fuchsia-400 mb-3">
            <FileText className="w-3.5 h-3.5" /> Legal
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">
            {CO.product} — operated by {CO.legalName}. Effective {CO.effective}.
          </p>
          <Link to="/privacy" className="inline-flex items-center gap-1 text-sm text-fuchsia-400 hover:underline mt-3">
            Privacy Policy <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </header>

        {/* Contents */}
        <nav className="mb-10 rounded-2xl border border-border p-4">
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center justify-between w-full text-sm font-bold text-foreground">
            Contents
            <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
          {open && (
            <ol className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-xs text-muted-foreground hover:text-fuchsia-400 transition-colors">
                    {s.n}. {s.label}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </nav>

        <article>
          <H id="acceptance" n="1">Acceptance of these terms</H>
          <P>
            These Terms of Service (the <Strong>&ldquo;Terms&rdquo;</Strong>) form a binding agreement between you
            and {CO.legalName} governing your use of {CO.product} at {CO.domain}, together with any
            related applications, APIs, workers and services we operate (the <Strong>&ldquo;Service&rdquo;</Strong>).
          </P>
          <P>
            By creating an account, accessing the Service, or paying for a plan, you accept these
            Terms. If you do not accept them, do not use the Service. If you are accepting on behalf
            of a company or other organisation, you confirm you are authorised to bind it, and
            &ldquo;you&rdquo; means that organisation.
          </P>

          <H id="who-we-are" n="2">Who we are</H>
          <P>
            The Service is owned and operated by {CO.legalName}, a limited liability company formed
            in {CO.state}, of {CO.address} (<Strong>&ldquo;we&rdquo;</Strong>, <Strong>&ldquo;us&rdquo;</Strong>, <Strong>&ldquo;our&rdquo;</Strong>).
          </P>
          <P>
            {CO.legalName} and its affiliates own and operate {CO.product} and the other applications
            published under the ZoaZone name. We may perform our obligations, and exercise our rights,
            through affiliates, official partners, resellers, agents and authorised platform
            administrators, and we may assign or transfer this agreement to any of them or in
            connection with a merger, acquisition or sale of assets.
          </P>

          <H id="eligibility" n="3">Eligibility and your account</H>
          <UL>
            <L>You must be at least 18 years old, or the age of majority where you live, whichever is greater.</L>
            <L>You must provide accurate registration details and keep them current.</L>
            <L>You are responsible for all activity under your account and for keeping your credentials secure. Tell us promptly at {CO.supportEmail} if you suspect unauthorised access.</L>
            <L>Accounts are for you or your organisation. Do not share, sell or transfer an account without our written consent.</L>
            <L>You may not use the Service if we have previously terminated your account, or if applicable sanctions or export-control laws prohibit it.</L>
          </UL>

          <H id="licence" n="4">Your licence to use the Service</H>
          <P>
            Subject to these Terms and to your plan, we grant you a limited, non-exclusive,
            non-transferable, revocable licence to access and use the Service.
          </P>
          <P>
            <Strong>Permitted use is personal or commercial.</Strong> You may use the Service, and the
            output you generate with it, for your own purposes and for the purposes of clients you
            serve, including commercial exploitation of that output, subject to §5 and §6 and to your
            holding all necessary rights in what you upload.
          </P>

          <H id="acceptable-use" n="5">Acceptable use</H>
          <P>You must not use the Service for any unlawful purpose. Specifically, you must not:</P>
          <UL>
            <L>break any applicable law or regulation, or infringe anyone&rsquo;s intellectual property, privacy, publicity or personality rights;</L>
            <L>upload or generate material that is defamatory, obscene, or that sexualises or endangers minors;</L>
            <L>create content that impersonates a real person or organisation in order to deceive, including synthetic voice or likeness used to mislead;</L>
            <L>produce fraudulent, deceptive or misleading content — fake endorsements, fabricated records, disinformation, or material designed to manipulate an election;</L>
            <L>send unsolicited bulk messages, or messages that breach anti-spam or telecoms law (including TCPA, CAN-SPAM, GDPR/ePrivacy and equivalent rules) or a platform&rsquo;s own policies;</L>
            <L>harass, threaten, or incite violence or hatred against any person or group;</L>
            <L>reverse engineer, decompile, scrape, or attempt to derive our source code or models, or circumvent quotas, plan limits or security controls;</L>
            <L>resell or sublicense raw access to the Service, or use it to build a competing product;</L>
            <L>overload or disrupt the Service or the third-party providers it depends on.</L>
          </UL>
          <P>
            We may investigate suspected breaches and cooperate with law enforcement where legally
            required. Breach of this section may result in immediate suspension without refund, to the
            extent permitted by law.
          </P>

          <H id="ai-content" n="6">AI-generated content, voice and dubbing</H>
          <P>
            The Service generates video, images, music, speech and translated dubs using artificial
            intelligence, including third-party models. You should understand the following before
            relying on any output.
          </P>
          <UL>
            <L><Strong>Output is not guaranteed to be unique.</Strong> Generative models may produce similar results for different users. We do not warrant that output is original, novel or free of third-party rights.</L>
            <L><Strong>Copyright in AI output is uncertain and varies by country.</Strong> In some jurisdictions material generated without sufficient human authorship may not be protectable at all. We make no representation about the protectability of what you generate.</L>
            <L><Strong>Output may be inaccurate.</Strong> Translations, dubs, subtitles and generated text may contain errors. Check anything you intend to publish, broadcast or rely on commercially.</L>
          </UL>
          <P>
            <Strong>Rights in what you upload.</Strong> You represent and warrant that you own, or hold
            all necessary licences, consents and permissions in, every file you upload — including the
            underlying film, script, music and any performances embodied in it — and that our
            processing of it will not infringe anyone&rsquo;s rights.
          </P>
          <P>
            <Strong>Voice, likeness and dubbing.</Strong> Where you use features that reproduce,
            clone or translate a person&rsquo;s voice or likeness, you represent and warrant that you have
            each identifiable person&rsquo;s express, informed and documented consent for that use, in the
            territories where you will distribute the result, and that the use complies with all laws
            governing voice, likeness, publicity and synthetic media in those territories. You are
            solely responsible for obtaining and retaining evidence of that consent, and you must
            provide it to us on request. We may refuse or remove any dub where we reasonably believe
            consent is absent.
          </P>

          <H id="billing" n="7">Plans, billing and refunds</H>
          <UL>
            <L>Paid plans are billed in advance on a monthly or annual basis through our payment processors. Prices are shown at checkout and exclude taxes unless stated.</L>
            <L><Strong>Subscriptions renew automatically</Strong> at the then-current price until cancelled. You may cancel at any time from Billing; cancellation takes effect at the end of the current paid period, and you keep access until then.</L>
            <L>You authorise us and our processors to charge your payment method for all amounts due, including applicable taxes and any overage or usage charges described on the pricing page.</L>
            <L>We may change prices on reasonable notice. Changes apply from your next renewal.</L>
            <L>You are responsible for any taxes, duties or withholdings arising from your use, other than taxes on our income.</L>
          </UL>
          <P>
            <Strong>Refunds.</Strong> Fees are non-refundable, and payments are not pro-rated on
            cancellation, mid-term downgrade, or termination for breach —{" "}
            <Strong>except where a refund is required by applicable law</Strong>, including any
            statutory cancellation or cooling-off right you may have as a consumer, which these Terms
            do not limit or exclude. Amounts already consumed as AI generation, render or dubbing
            usage are not refundable in any event, because the underlying third-party cost has already
            been incurred on your behalf.
          </P>
          <P>
            <Strong>Who is paid.</Strong> All amounts payable under these Terms are payable to{" "}
            {CO.legalName}, or to such affiliate, official partner, authorised reseller or platform
            administrator as we may direct, and payment to any of them discharges your obligation.
          </P>
          <P>
            <Strong>Chargebacks.</Strong> If you initiate a chargeback or payment dispute instead of
            contacting us first, we may suspend your account pending resolution. Please write to{" "}
            {CO.supportEmail} — most billing issues are resolved quickly.
          </P>

          <H id="credits" n="8">Credits, quotas and fair use</H>
          <P>
            Plans include allowances for AI generation, rendering, dubbing minutes and messaging.
            Allowances reset each billing period and, unless your plan says otherwise, do not roll
            over and have no cash value. Purchased credits are consumed before or after plan
            allowances as described on the pricing page.
          </P>
          <P>
            Where you supply your own third-party API keys (&ldquo;BYOK&rdquo;), you remain responsible for
            your own usage and charges with that provider, and for complying with its terms. We store
            such keys encrypted but do not control the provider&rsquo;s pricing, availability or policies.
          </P>
          <P>
            We may apply reasonable rate limits, and may contact you where usage materially exceeds
            normal patterns for your plan.
          </P>

          <H id="affiliates" n="9">Affiliate and partner programme</H>
          <P>
            If you take part in our affiliate or partner programme, commission rates, tiers and payout
            terms are as set out in the programme materials and in your account. Commission is earned
            on qualifying completed payments that are not later refunded, charged back or reversed;
            commission on a reversed payment may be clawed back against your balance.
          </P>
          <P>
            Affiliates must promote the Service honestly, must not bid on our trademarks in paid search
            without written permission, must not spam, and{" "}
            <Strong>must clearly disclose the affiliate relationship</Strong> wherever required by law
            (including FTC endorsement rules in the United States). We may withhold payouts, suspend or
            remove any affiliate for breach, fraud or self-referral.
          </P>

          <H id="ip" n="10">Intellectual property</H>
          <P>
            <Strong>Ours.</Strong> The Service, including its software, interfaces, models we own,
            branding and documentation, belongs to {CO.legalName} and its licensors. Nothing here
            transfers ownership of it to you.
          </P>
          <P>
            <Strong>Yours.</Strong> You keep whatever rights you hold in the content you upload
            (<Strong>&ldquo;Input&rdquo;</Strong>). As between you and us, and subject to your compliance with
            these Terms and payment of applicable fees, we do not claim ownership of the content you
            generate (<Strong>&ldquo;Output&rdquo;</Strong>), and you may use it for personal or commercial
            purposes — subject to §6, which explains what we cannot warrant about it.
          </P>
          <P>
            <Strong>Licence to us.</Strong> You grant us a worldwide, non-exclusive, royalty-free
            licence to host, store, transmit, reproduce and process your Input and Output solely to
            operate, secure, support and improve the Service, and to route it to the third-party
            providers needed to fulfil your requests. This licence ends when you delete the relevant
            content, except for copies retained in backups for a limited period or as law requires.
          </P>
          <P>
            <Strong>Feedback.</Strong> If you send us suggestions, we may use them without obligation
            or compensation.
          </P>
          <P>
            <Strong>Complaints.</Strong> If you believe material on the Service infringes your rights,
            write to {CO.legalEmail} with enough detail to identify the material and your rights in it.
            We may remove content and terminate repeat infringers.
          </P>

          <H id="third-party" n="11">Third-party services</H>
          <P>
            The Service integrates third-party providers — including AI model providers, payment
            processors, email and messaging providers, and social platforms you choose to connect.
            Your use of those services is governed by their terms, and their acts and omissions
            (including outages, model changes, pricing changes and content policies) are outside our
            control. Connecting an account authorises us to act on that platform on your behalf, and
            you must comply with that platform&rsquo;s rules.
          </P>

          <H id="availability" n="12">Availability and support</H>
          <P>
            We aim to keep the Service available and to process jobs promptly, but we do not commit to
            any specific uptime, turnaround time or output quality unless we have agreed a separate
            written service-level agreement with you. Long-running work — feature-length renders and
            dubs in particular — depends on third-party capacity and may queue, take longer than
            estimated, or fail and need resubmitting. Support is provided at {CO.supportEmail} on the
            terms applicable to your plan.
          </P>
          <P>
            We may modify, add or discontinue features. Where a change materially reduces core
            functionality of a paid plan, we will give reasonable notice.
          </P>

          <H id="termination" n="13">Suspension and termination</H>
          <UL>
            <L>You may stop using the Service and cancel at any time from Billing.</L>
            <L>We may suspend or terminate your access immediately where you breach these Terms — in particular §5 or §6 — where required by law, where necessary to protect the Service or other users, or for non-payment.</L>
            <L>We may terminate for convenience on reasonable notice, in which case we will refund any prepaid fees covering the unused remainder of your term.</L>
            <L>On termination, your licence ends. We may delete your content after a reasonable period; export anything you want to keep before cancelling.</L>
            <L>Sections that by their nature should survive termination do so, including §6, §10, §14, §15, §16 and §18.</L>
          </UL>

          <H id="disclaimers" n="14">Disclaimers</H>
          <P className="uppercase">
            <Strong>
              The Service and all output are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
              warranties of any kind, whether express, implied or statutory, including implied
              warranties of merchantability, fitness for a particular purpose, title,
              non-infringement, accuracy, or uninterrupted or error-free operation, to the maximum
              extent permitted by law.
            </Strong>
          </P>
          <P>
            Nothing in these Terms excludes or limits any liability or right that cannot lawfully be
            excluded or limited, including consumer rights you may have where you live.
          </P>

          <H id="liability" n="15">Limitation of liability</H>
          <P>
            To the maximum extent permitted by law, neither party is liable for indirect, incidental,
            special, consequential, exemplary or punitive damages, or for lost profits, revenue,
            goodwill, or data, however caused and on any theory of liability.
          </P>
          <P>
            To the maximum extent permitted by law, our total aggregate liability arising out of or
            relating to the Service or these Terms will not exceed the greater of (a) the amounts you
            paid us for the Service in the twelve months before the event giving rise to the claim, or
            (b) one hundred United States dollars (US$100).
          </P>
          <P>
            These limits do not apply to liability that cannot lawfully be limited, and they apply
            even if a limited remedy fails of its essential purpose.
          </P>

          <H id="indemnity" n="16">Indemnity</H>
          <P>
            You will defend, indemnify and hold harmless {CO.legalName}, its affiliates, partners and
            their officers, employees and agents from any claim, demand, loss, liability or expense
            (including reasonable legal fees) arising from: your Input or Output; your use of the
            Service; your breach of these Terms; your breach of §6 (including any claim that you
            lacked rights or consent in source material, a voice or a likeness); or your violation of
            any law or third-party right.
          </P>

          <H id="changes" n="17">Changes to these terms</H>
          <P>
            We may update these Terms from time to time. Where a change is material we will give
            reasonable notice, by email or in the Service, before it takes effect. Continuing to use
            the Service after the effective date means you accept the updated Terms; if you do not
            accept them, cancel before that date. The current version is always at {CO.domain}/terms.
          </P>

          <H id="law" n="18">Governing law and disputes</H>
          <P>
            These Terms are governed by the laws of the State of {CO.state}, United States, without
            regard to its conflict-of-laws rules. The United Nations Convention on Contracts for the
            International Sale of Goods does not apply.
          </P>
          <P>
            Before filing any claim, you agree to contact us at {CO.legalEmail} and attempt to resolve
            it informally for at least thirty (30) days. Any dispute not resolved that way will be
            brought exclusively in the state or federal courts located in {CO.state}, and both parties
            consent to their jurisdiction.
          </P>
          <P>
            Where you are a consumer, this section does not deprive you of the protection of mandatory
            provisions of the law of your country of residence, including any right to bring
            proceedings in your local courts.
          </P>

          <H id="general" n="19">General</H>
          <UL>
            <L><Strong>Entire agreement.</Strong> These Terms and our Privacy Policy are the whole agreement between us about the Service and replace any earlier understanding.</L>
            <L><Strong>Severability.</Strong> If a provision is held unenforceable, it is modified to the minimum extent necessary, or severed, and the rest stays in force.</L>
            <L><Strong>No waiver.</Strong> Not enforcing a right is not a waiver of it.</L>
            <L><Strong>Assignment.</Strong> You may not assign these Terms without our written consent. We may assign them to an affiliate or in connection with a merger, acquisition or sale of assets.</L>
            <L><Strong>Force majeure.</Strong> Neither party is liable for delay or failure caused by events beyond its reasonable control, including third-party provider outages.</L>
            <L><Strong>No third-party beneficiaries</Strong>, except that our affiliates and partners may enforce provisions expressly benefiting them.</L>
            <L><Strong>Notices</Strong> to us go to {CO.legalEmail}; notices to you go to the email on your account.</L>
          </UL>

          <H id="contact" n="20">Contact</H>
          <P>
            {CO.legalName}<br />
            {CO.address}<br />
            General support: {CO.supportEmail}<br />
            Legal notices: {CO.legalEmail}
          </P>

          <p className="text-xs text-muted-foreground mt-10 pt-6 border-t border-border">
            Effective {CO.effective}. Please also read our{" "}
            <Link to="/privacy" className="text-fuchsia-400 hover:underline">Privacy Policy</Link>,
            which explains how we handle your data.
          </p>
        </article>
      </div>
    </div>
  );
}
