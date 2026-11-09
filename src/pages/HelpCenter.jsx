import { useState } from "react";
import { HelpCircle, Search, ChevronDown, ChevronRight, MessageSquare, ExternalLink, BookOpen, Zap, Share2, GitBranch, Megaphone, Image, BarChart3 } from "lucide-react";

const FAQS = [
  {
    category: "Getting Started",
    icon: Zap,
    color: "text-fuchsia-400 bg-fuchsia-500/10",
    items: [
      { q: "How do I add my first client?", a: "Go to Settings → Clients and click 'Add Client'. Fill in their business details and you're ready to create campaigns on their behalf." },
      { q: "How do I connect a social media account?", a: "Navigate to Social Hub → click 'Connect Account'. We support Instagram, Facebook, TikTok, LinkedIn, and YouTube. You'll be prompted to authorize via OAuth." },
      { q: "What is the Media Studio?", a: "Media Studio is your AI content creation hub. Generate captions, ad copy, email templates, SMS templates, hashtag sets, and AI images — all with a single prompt." },
    ],
  },
  {
    category: "Campaigns",
    icon: Megaphone,
    color: "text-pink-400 bg-pink-500/10",
    items: [
      { q: "How do I send a bulk message campaign?", a: "Create a campaign in the Campaigns section, add a body, set the type (Email/SMS/WhatsApp), then click 'Send'. Contacts must have opted in for the relevant channel." },
      { q: "What channels does bulk messaging support?", a: "Email, SMS, WhatsApp, and multi-channel (all three simultaneously). Make sure your contacts have the relevant opt-in set to true." },
      { q: "Can I schedule a campaign?", a: "Yes — when creating a campaign, set a 'Scheduled At' date/time and the status will be set to 'scheduled' automatically." },
    ],
  },
  {
    category: "Social Hub",
    icon: Share2,
    color: "text-blue-400 bg-blue-500/10",
    items: [
      { q: "How do scheduled posts work?", a: "Compose your post in Social Hub, pick a platform and date/time, and click Schedule. Posts are published automatically at the set time." },
      { q: "Which platforms are supported?", a: "Instagram, Facebook, TikTok, LinkedIn, and YouTube. Connect accounts first in the Social Hub → Accounts tab." },
      { q: "Can AI write my social captions?", a: "Yes! In Media Studio, choose 'Caption', enter your topic, select the platform and tone, and generate AI-written captions instantly." },
    ],
  },
  {
    category: "Funnels & Leads",
    icon: GitBranch,
    color: "text-amber-400 bg-amber-500/10",
    items: [
      { q: "What is the Funnel Builder?", a: "A visual tool to create multi-stage marketing funnels. Each stage can trigger automated follow-up sequences based on lead behavior." },
      { q: "How does lead capture work?", a: "Use the Lead Capture page to embed forms or share QR codes. Every submission auto-creates a contact and places them in your funnel." },
      { q: "What are Follow-Up Sequences?", a: "Automated message sequences triggered when a lead enters a stage or takes an action. Set delays and choose the channel (email/SMS/WhatsApp) per step." },
    ],
  },
  {
    category: "AI & Media",
    icon: Image,
    color: "text-purple-400 bg-purple-500/10",
    items: [
      { q: "How many AI generations do I get?", a: "Starter: 500/mo · Growth: 2,500/mo · Agency: 10,000/mo. Each content generation (text or image) counts as one." },
      { q: "What types of content can AI generate?", a: "Captions, ad copy, email templates, SMS templates, hashtag sets, video scripts, and AI images — all platform-optimized." },
      { q: "Where are my generated assets saved?", a: "All generated content is saved to your Media Library automatically. Text content goes to Content Assets, images to Media Library Items." },
    ],
  },
  {
    category: "Billing & Plans",
    icon: BarChart3,
    color: "text-emerald-400 bg-emerald-500/10",
    items: [
      { q: "Can I upgrade or downgrade my plan?", a: "Yes — go to Billing and select a new plan. Upgrades take effect immediately, downgrades at the end of your billing cycle." },
      { q: "Is there a free trial?", a: "Yes! Sign up and get a 14-day free trial on the Growth plan, no credit card required." },
      { q: "Do you offer annual billing discounts?", a: "Yes — annual billing saves ~20%. Switch to annual in the Billing section." },
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
            <p className="text-sm mt-1">Try a different keyword or <a href="mailto:support@agentmarketer.com" className="text-fuchsia-400 hover:underline">contact support</a></p>
          </div>
        )}
      </div>
    </div>
  );
}
