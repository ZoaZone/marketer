import { useState } from "react";
import { HelpCircle, Search, ChevronDown, ChevronRight, MessageSquare, ExternalLink, BookOpen, Zap, Share2, GitBranch, Megaphone, Image, Sparkles, Wand2, CreditCard, Building2, ShieldCheck, Globe, PenTool } from "lucide-react";

const FAQS = [
  {
    category: "Getting Started",
    icon: Zap,
    color: "text-fuchsia-400 bg-fuchsia-500/10",
    items: [
      { q: "What do I get when I sign up?", a: "Every new account starts with a free trial of 25 AI generations (about 5 images or 3 short videos) — no credit card required. Once that's used up you can subscribe to a plan or buy pay-as-you-go credits." },
      { q: "How do I add my first brand?", a: "Go to Brand Manager and click 'Add Brand'. Fill in the name, industry, voice/tone and colors — Studio, Quick Create and Ad Creator all use this to keep AI content on-brand." },
      { q: "How do I connect a social media account?", a: "Navigate to Social Hub → click 'Connect Account'. We support Instagram, Facebook, TikTok, LinkedIn, YouTube and Pinterest. You'll be prompted to authorize via OAuth." },
      { q: "Where do I create AI content?", a: "Use Studio for full campaigns (brand → accounts → content → media → preview → schedule → launch), or Quick Create for a one-off image/video with no setup." },
    ],
  },
  {
    category: "Studio — AI Campaign Builder",
    icon: Sparkles,
    color: "text-fuchsia-400 bg-fuchsia-500/10",
    items: [
      { q: "What is Studio?", a: "Studio is the guided, step-by-step campaign builder: pick a Brand, choose target social Accounts, generate Content (captions/ad copy/scripts), create or upload Media, Preview & Repurpose across platforms, set your Timeline, then Launch." },
      { q: "Can I attach reference images so the AI matches my photos?", a: "Yes — in the Media step of Studio (and in Quick Create), attach one or more reference images. The AI will try to replicate the people, products or style from those photos in the generated image or video." },
      { q: "How do I set a launch date for a campaign?", a: "On Studio's first step (Brand), set an optional 'Launch Date'. The Timeline step uses it as the default date for new schedule slots." },
      { q: "What's the difference between 'Post Now' and scheduling?", a: "'Post Now' publishes to your selected accounts immediately when you click Launch. Scheduling lets you pick specific dates/times per post in the Timeline step, or leave them blank to save as drafts you publish later from Social Hub." },
    ],
  },
  {
    category: "Quick Create & Demo Video Maker",
    icon: Wand2,
    color: "text-violet-400 bg-violet-500/10",
    items: [
      { q: "What is Quick Create?", a: "A standalone AI image or video generator — describe what you want, pick an aspect ratio, and generate. No brand, social accounts or script step required." },
      { q: "How do reference image attachments work in Quick Create?", a: "Click the paperclip icon under 'Reference Images', upload one or more photos (people, products, a style you like), and the AI uses them as visual references for your generated image or video." },
      { q: "What is the AI Demo Video Maker?", a: "Paste any website URL — AI scans the site, writes a narration script summarizing the business, and assembles a narrated walkthrough video. Great for sales outreach, onboarding, or social proof." },
      { q: "Where do Quick Create and Demo Video outputs go?", a: "Click 'Save to Library' to store the result in your Media Library, where it can be reused in Studio, Social Hub or Ad Creator." },
    ],
  },
  {
    category: "AI Generations, Free Trial & Credits",
    icon: Sparkles,
    color: "text-purple-400 bg-purple-500/10",
    items: [
      { q: "How many free AI generations do I get?", a: "25 total — roughly 5 images or 3 short (multi-scene) videos — with no credit card required. Check your usage on the Billing page." },
      { q: "What happens after I use my free generations?", a: "You'll see a 'Subscribe to continue' prompt. Subscribe to a plan for a monthly AI allowance, or buy pay-as-you-go credits from Billing to keep creating without a subscription." },
      { q: "How do AI generation credits work and what do they cost?", a: "1 credit = 1 image or video-scene generation = $0.06. Minimum purchase is $10 (≈166 credits); any amount $10 or above thereafter. Credits never expire and stack on top of your plan's monthly allowance." },
      { q: "How many AI generations does each plan include per month?", a: "Starter: 500/mo · Growth: 2,500/mo · Agency: 10,000/mo. Each image or video-scene generation counts as one." },
    ],
  },
  {
    category: "Media Library",
    icon: Image,
    color: "text-purple-400 bg-purple-500/10",
    items: [
      { q: "What's stored in the Media Library?", a: "Every AI-generated and uploaded image, video, and piece of written content (captions, ad copy, scripts, hashtag sets) created anywhere in the app — Studio, Quick Create, Demo Video Maker, Ad Creator, and Website Scanner." },
      { q: "Can I reuse a saved asset in a new campaign?", a: "Yes — browse or search the Media Library and select assets as reference media or starting content when building a new Studio campaign or social post." },
      { q: "What's the difference between 'AI generated' and uploaded items?", a: "AI-generated items count toward your free-trial allowance and plan's monthly AI generation limit. Items you upload yourself (photos, videos, music) don't count against that limit." },
    ],
  },
  {
    category: "Brands, Agency & Affiliate",
    icon: Building2,
    color: "text-sky-400 bg-sky-500/10",
    items: [
      { q: "How many brands can I create?", a: "Free trial & Starter: 1 brand · Growth: 3 brands · Agency: 10 brands. Admin accounts have no limit." },
      { q: "What happens when I hit my brand limit?", a: "Brand Manager shows a 'Brand limit reached' notice with a Subscribe button linking to Pricing, where you can upgrade for more brand slots." },
      { q: "What is the Agency Portal?", a: "Available on the Agency plan — manage all your client brands/accounts from one place." },
      { q: "How does the Affiliate Program work?", a: "Agency-plan users get access to the Affiliate Portal to earn recurring commissions by referring new users to DigitalStudios.app." },
    ],
  },
  {
    category: "Campaigns (Bulk Messaging)",
    icon: Megaphone,
    color: "text-pink-400 bg-pink-500/10",
    items: [
      { q: "How do I send a bulk message campaign?", a: "Create a campaign in the Campaigns section, add a body, set the type (Email/SMS/WhatsApp), then click 'Send'. Contacts must have opted in for the relevant channel." },
      { q: "What channels does bulk messaging support?", a: "Email, SMS, WhatsApp, and multi-channel (all three at once). Make sure contacts have the relevant opt-in set to true." },
      { q: "Can I schedule a campaign?", a: "Yes — set a date/time when creating the campaign and a date picker lets you pick exactly when it should go out; its status becomes 'scheduled' automatically." },
    ],
  },
  {
    category: "Social Hub",
    icon: Share2,
    color: "text-blue-400 bg-blue-500/10",
    items: [
      { q: "How do scheduled posts work?", a: "Compose your post in Social Hub, pick a platform and date/time with the built-in date picker, and click Schedule. Posts publish automatically at the set time." },
      { q: "Which platforms are supported?", a: "Instagram, Facebook, TikTok, LinkedIn, YouTube and Pinterest. Connect accounts first in the Social Hub → Accounts tab — connections are verified live." },
      { q: "Can AI write my social captions?", a: "Yes — generate captions in Studio's Content step or Quick Create, choosing the platform and tone, and post or schedule them directly from Social Hub." },
    ],
  },
  {
    category: "Funnels, Leads & Follow-Up",
    icon: GitBranch,
    color: "text-amber-400 bg-amber-500/10",
    items: [
      { q: "What is the Funnel Builder?", a: "A visual, drag-drop tool to create multi-stage marketing funnels. Each stage can trigger automated actions based on lead behavior." },
      { q: "How does lead capture work?", a: "Use the Lead Capture page to embed forms or share QR codes. Every submission auto-creates a contact and places them into your funnel." },
      { q: "What are Follow-Up Sequences?", a: "Automated multi-step message sequences triggered when a lead enters a stage or takes an action. Set delays per step and choose the channel (email/SMS/WhatsApp)." },
    ],
  },
  {
    category: "Ad Creator & Website Scanner",
    icon: PenTool,
    color: "text-cyan-400 bg-cyan-500/10",
    items: [
      { q: "What does the Website Scanner do?", a: "Enter any URL and it scans the site to extract a business summary, services, keywords, brand tone and offers — useful as a starting point for ad copy or a demo video." },
      { q: "What does Ad Creator do?", a: "Generates platform-ready ad creatives — copy plus AI visuals — using your brand profile, optionally seeded from a Website Scanner result." },
      { q: "Which plans include Ad Creator and Website Scanner?", a: "Growth and Agency plans. They're locked on the Starter plan and during the free trial." },
    ],
  },
  {
    category: "Projects, Analytics & Contacts",
    icon: Globe,
    color: "text-teal-400 bg-teal-500/10",
    items: [
      { q: "What is 'Web & App Projects' for?", a: "Track website and mobile app builds from brief through to launch — useful for agencies managing client deliverables alongside their marketing campaigns." },
      { q: "What does Analytics show?", a: "Performance across campaigns, leads, social posts, and AI content — conversion rates, engagement and revenue in one dashboard." },
      { q: "How do I manage my Contacts?", a: "The Contacts page lists everyone captured via funnels, forms or imports, including their email/SMS/WhatsApp opt-in status, which determines what bulk campaigns they can receive." },
    ],
  },
  {
    category: "Billing, Plans & Messaging Pricing",
    icon: CreditCard,
    color: "text-emerald-400 bg-emerald-500/10",
    items: [
      { q: "What plans are available?", a: "Starter ($49/mo), Growth ($149/mo) and Agency ($399/mo) — see Pricing for the full feature comparison. All plans include a monthly AI generation and bulk-messaging allowance." },
      { q: "Can I upgrade or downgrade my plan?", a: "Yes — go to Billing and select a new plan. Upgrades take effect immediately; downgrades apply at the end of your billing cycle." },
      { q: "Do you offer annual billing discounts?", a: "Yes — annual billing saves about 20% versus monthly. Switch to annual on the Pricing or Billing page." },
      { q: "Do you charge extra for sending Email, SMS or WhatsApp campaigns?", a: "Sending is included up to your plan's monthly message quota. Beyond that it's billed per message at the rates shown on the Billing page — or bring your own SendGrid/Twilio/WhatsApp Business credentials and send at $0 platform fee." },
    ],
  },
  {
    category: "Privacy, Security & AI Disclaimer",
    icon: ShieldCheck,
    color: "text-slate-400 bg-slate-500/10",
    items: [
      { q: "Is my account's data kept separate from other users?", a: "Yes — brands, campaigns, contacts and media are scoped to your account. Only platform admins can access cross-account data, and only for support and operations." },
      { q: "Can I trust AI-generated content and recommendations?", a: "AI-generated text, images, videos and suggestions can occasionally be inaccurate or 'hallucinate' details. Always review content for accuracy before publishing or sending it to your audience — see our AI Disclaimer in the Privacy Policy." },
      { q: "Where can I read the Privacy Policy and AI Disclaimer?", a: "Available at digitalstudios.app/privacy, linked from the footer of every page." },
    ],
  },
];

export default function HelpCenter() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState({});

  const toggle = (key) => setOpen(p => ({ ...p, [key]: !p[key] }));

  const filtered = FAQS.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !search || item.q.toLowerCase().includes(search.toLowerCase()) || item.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-fuchsia-400" /> Help Center
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Find answers, tutorials, and guides</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search help articles..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-fuchsia-500/50 transition-colors"
        />
      </div>

      {/* Quick links */}
      {!search && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Video Tutorials", icon: BookOpen, href: "#" },
            { label: "API Docs", icon: ExternalLink, href: "#" },
            { label: "Live Chat", icon: MessageSquare, href: "#" },
          ].map(link => (
            <a key={link.label} href={link.href}
              className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:border-fuchsia-500/30 transition-all text-sm font-medium text-foreground">
              <link.icon className="w-4 h-4 text-fuchsia-400" />
              {link.label}
            </a>
          ))}
        </div>
      )}

      {/* FAQs */}
      <div className="space-y-4">
        {filtered.map(cat => (
          <div key={cat.category} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.color}`}>
                <cat.icon className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-sm text-foreground">{cat.category}</h2>
            </div>
            <div className="divide-y divide-border">
              {cat.items.map((item, i) => {
                const key = `${cat.category}-${i}`;
                return (
                  <div key={key}>
                    <button onClick={() => toggle(key)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors">
                      <span className="text-sm font-medium text-foreground">{item.q}</span>
                      {open[key] ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </button>
                    {open[key] && (
                      <div className="px-5 pb-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p>No results for "{search}"</p>
            <p className="text-sm mt-1">Try a different keyword or <a href="mailto:care@digitalstudios.app" className="text-fuchsia-400 hover:underline">contact support</a></p>
          </div>
        )}
      </div>
    </div>
  );
}