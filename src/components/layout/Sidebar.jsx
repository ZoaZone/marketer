import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, Share2, Sparkles, PenTool,
  Search, GitBranch, UserPlus, MailCheck, Image, Globe,
  BarChart3, Settings, CreditCard, ChevronDown, LogOut, Menu, X,
  Lock, Bell, HelpCircle, ShieldCheck, Building2, Share,
  Sun, Moon, Wand2, Monitor, Film, Music, Sliders, Plug, Languages,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { BRAND } from "@/lib/brand";

function DarkToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("marketer_theme");
    // default = dark
    return stored !== "light";
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("marketer_theme", dark ? "dark" : "light");
  }, [dark]);

  // Apply on mount
  useEffect(() => {
    const stored = localStorage.getItem("marketer_theme");
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    <button onClick={() => setDark(d => !d)}
      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-all">
      {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-fuchsia-400" />}
      <span className="text-sm">{dark ? "Light Mode" : "Dark Mode"}</span>
    </button>
  );
}



// The creative experience is primary: CREATE and LIBRARY come first.
// Marketing/CRM tools are still fully available, just de-emphasized into a
// collapsible, collapsed-by-default group further down. All routes/paths
// are unchanged from before this reorg — only grouping/order/labels moved.
const NAV_SECTIONS = [
  {
    label: "OVERVIEW",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "CREATE",
    items: [
      { to: "/movie-maker",  icon: Film,    label: "Movie Maker", badge: "ENT", minTier: 4 },
      { to: "/song-creator", icon: Music,   label: "Song Creator", badge: "ENT", minTier: 4 },
      { to: "/dubbing",      icon: Languages, label: "Dubbing Studio", badge: "ENT", minTier: 4 },
      { to: "/media-editor", icon: Sliders, label: "AI Media Editor", badge: "ENT", minTier: 4 },
      { to: "/demo-video",   icon: Monitor, label: "Create Demo Video", badge: "NEW" },
      { to: "/ad-creator",   icon: PenTool, label: "Ad Creator", minTier: 2 },
      { to: "/quick-create", icon: Wand2,   label: "Quick Create", badge: "NEW" },
    ],
  },
  {
    label: "LIBRARY",
    items: [
      { to: "/media-library", icon: Image,     label: "Media Library" },
      { to: "/web-projects",  icon: Globe,     label: "Web & App Projects" },
      { to: "/analytics",     icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    label: "MARKETING (optional)",
    items: [
      { to: "/campaigns",       icon: Megaphone, label: "Campaigns" },
      { to: "/brands",          icon: Building2, label: "Brand Manager" },
      { to: "/social-hub",      icon: Share2,    label: "Social Hub" },
      { to: "/campaign-studio", icon: Sparkles,  label: "Campaign Studio", badge: "NEW" },
      { to: "/website-scanner", icon: Search,    label: "Website Scanner", minTier: 2 },
      { to: "/funnel-builder",  icon: GitBranch, label: "Funnel Builder" },
      { to: "/lead-capture",    icon: UserPlus,  label: "Lead Capture" },
      { to: "/follow-up",       icon: MailCheck, label: "Follow-Up" },
      { to: "/contacts",        icon: Users,     label: "Contacts" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { to: "/billing",       icon: CreditCard,  label: "Billing" },
      { to: "/integrations",  icon: Plug,        label: "Integrations" },
      { to: "/settings",      icon: Settings,    label: "Settings" },
      { to: "/notifications", icon: Bell,        label: "Notifications" },
      { to: "/help",          icon: HelpCircle,  label: "Help Center" },
    ],
  },
];

export default function Sidebar({ userTier = 0, isAdmin = false, user = null, subscription = null }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Marketing tools are de-emphasized: collapsed by default (everything
  // else starts expanded, matching prior behavior).
  const [collapsed, setCollapsed] = useState({ "MARKETING (optional)": true });

  const toggle = (label) => setCollapsed(p => ({ ...p, [label]: !p[label] }));

  // Plan name for the account badge. PLAN_BY_KEY is the same catalog the
  // pricing and billing surfaces read, so the label can never drift from what
  // the customer was actually sold.
  const planLabel =
    (subscription?.plan_tier && PLAN_BY_KEY[subscription.plan_tier]?.name) ||
    (subscription?.plan_tier ? String(subscription.plan_tier) : "Free");
  const logout = () => {
    localStorage.removeItem("base44_access_token");
    localStorage.removeItem("base44_refresh_token");
    sessionStorage.clear();
    base44.auth.logout("/auth");
  };

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Logo. Uses the horizontal lockup (icon + wordmark, ~1.87:1), which is
          the shape a 224px-wide sidebar header actually wants.
          History worth keeping: the original /logo.png was a 1024×1024 square
          whose mark filled only the middle ~17% of the height, so
          `max-h-24 object-contain` fitted the empty square to 96px and rendered
          the actual mark about 16px tall — the "too small to read" bug. Any
          replacement asset must be cropped tight to its artwork for the same
          reason: the box you give it is the size the mark should fill. */}
      <div className="px-4 pt-6 pb-5 border-b border-sidebar-border">
        <Link
          to="/studio"
          onClick={() => setMobileOpen(false)}
          aria-label={`${BRAND.name} — go to Studio`}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/60"
        >
          {/* The mark is light-on-transparent, so it needs a dark plate in light
              mode; in dark mode the sidebar already provides one. */}
          <div className="dark:bg-transparent bg-[#12121e] dark:p-0 px-3 py-2.5 rounded-xl transition-colors">
            <img
              src="/brand/lockup-h.png"
              alt={BRAND.name}
              width="600"
              height="321"
              className="w-full h-auto object-contain"
              onError={(e) => e.target.style.display = "none"} />
          </div>
          <p className="mt-2.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
            {BRAND.tagline}
          </p>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-3">
            {/* 9px uppercase was below the legible floor; 10.5px with wider
                tracking and more contrast keeps the labels quiet but readable. */}
            <button onClick={() => toggle(section.label)}
              aria-expanded={!collapsed[section.label]}
              className="flex items-center justify-between w-full px-3 py-2 text-[10.5px] font-bold tracking-[0.13em] text-muted-foreground/90 uppercase hover:text-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40">
              {section.label}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed[section.label] ? "-rotate-90" : ""}`} />
            </button>
            {!collapsed[section.label] && (
              <div className="mt-1 space-y-0.5">
                {section.items.map(item => {
                  const isActive = location.pathname === item.to;
                  const isLocked = !isAdmin && item.minTier && userTier < item.minTier;
                  return (
                    <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all group ${
                        isActive
                          ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                      }`}>
                      <item.icon className={`w-[17px] h-[17px] flex-shrink-0 ${isActive ? "text-fuchsia-400" : "text-muted-foreground/90 group-hover:text-foreground"}`} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {/* The pill used to be a 15%-opacity fill with no
                          border: measured 1.29:1 against the sidebar, i.e.
                          the box visually dissolved into the background. A
                          translucent fill cannot reach 3:1 on a near-black
                          surface however far you push it, so the border does
                          the work (3.1:1) and the fill only tints. 9px was
                          also below the legible floor. */}
                      {item.badge && !isLocked && (
                        <span className={`px-1.5 py-[3px] rounded-md text-[10px] font-bold tracking-wider border ${
                          item.badge === "ENT"
                            ? "bg-amber-400/20 text-amber-300 border-amber-400/45"
                            : "bg-fuchsia-400/20 text-fuchsia-300 border-fuchsia-300/50"
                        }`}>{item.badge}</span>
                      )}
                      {/* 1.57:1 before — effectively invisible. */}
                      {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground/70" />}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Agency/Affiliate — Agency tier */}
        {userTier >= 3 && (
          <div className="mt-2 pt-2 border-t border-sidebar-border space-y-0.5">
            <Link to="/affiliate" onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${location.pathname === "/affiliate" ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}>
              <Share className="w-4 h-4" /> Affiliate Portal
            </Link>
            <Link to="/agency" onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${location.pathname === "/agency" ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}>
              <Building2 className="w-4 h-4" /> Agency Portal
            </Link>
          </div>
        )}

        {/* Admin */}
        {isAdmin && (
          <div className="mt-2 pt-2 border-t border-sidebar-border">
            <Link to="/admin" onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${location.pathname === "/admin" ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}>
              <ShieldCheck className="w-4 h-4" /> Admin Dashboard
            </Link>
          </div>
        )}
      </nav>

      {/* User info + Theme + Logout */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 bg-sidebar-accent/50 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">
              {(user.full_name || user.email || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {user.full_name && <p className="text-xs font-semibold text-foreground truncate">{user.full_name}</p>}
              <p className="text-[10px] text-muted-foreground truncate">{user.email || "—"}</p>
              {/* Which plan the session is actually on. The subscription was
                  already loaded in AppLayout for tier gating; surfacing its
                  name here means the sidebar's locked items have a visible
                  reason. Falls back to Free when there is no subscription. */}
              <span
                title={planLabel}
                className="mt-1 inline-block max-w-full truncate rounded bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300 border border-fuchsia-400/40"
              >
                {isAdmin ? "Admin" : planLabel}
              </span>
            </div>
          </div>
        )}
        <DarkToggle />
        <button onClick={logout} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-red-500/10 hover:text-red-400 transition-all">
          <LogOut className="w-4 h-4" /> Log Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 bg-card border border-border rounded-lg flex items-center justify-center shadow-sm">
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-sidebar border-r border-sidebar-border z-40 transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {navContent}
      </aside>
    </>
  );
}