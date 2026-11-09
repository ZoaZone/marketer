import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Megaphone, Share2, Sparkles, PenTool,
  FileText, Search, GitBranch, UserPlus, MailCheck, Image, Globe,
  BarChart3, Settings, CreditCard, ChevronDown, LogOut, Menu, X,
  Lock, Bell, HelpCircle, ShieldCheck, Zap, Building2, Share,
  Sun, Moon, Film
} from "lucide-react";
import { base44 } from "@/api/base44Client";

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


const M_LOGO = "https://media.base44.com/images/public/69b1f1d60b1fb9d791fddc64/d1aa347a6_generated_image.png";

const NAV_SECTIONS = [
  {
    label: "OVERVIEW",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/contacts",  icon: Users,           label: "Contacts" },
    ],
  },
  {
    label: "CAMPAIGNS",
    items: [
      { to: "/campaigns",  icon: Megaphone, label: "Campaigns" },
      { to: "/social-hub", icon: Share2,    label: "Social Hub" },
    ],
  },
  {
    label: "AI STUDIO",
    items: [
      { to: "/media-studio",    icon: Sparkles, label: "Media Studio" },
      { to: "/video-editor",    icon: Film,     label: "Video Editor" },
      { to: "/ad-creator",      icon: PenTool,  label: "Ad Creator",   minTier: 2 },
      { to: "/script-writer",   icon: FileText, label: "Script Writer", minTier: 2 },
      { to: "/website-scanner", icon: Search,   label: "Website Scanner", minTier: 2 },
      { to: "/media-library",   icon: Image,    label: "Media Library" },
    ],
  },
  {
    label: "FUNNELS & LEADS",
    items: [
      { to: "/funnel-builder", icon: GitBranch, label: "Funnel Builder" },
      { to: "/lead-capture",   icon: UserPlus,  label: "Lead Capture" },
      { to: "/follow-up",      icon: MailCheck, label: "Follow-Up" },
    ],
  },
  {
    label: "PROJECTS",
    items: [
      { to: "/web-projects", icon: Globe, label: "Web & App Projects" },
      { to: "/analytics",    icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { to: "/billing",       icon: CreditCard,  label: "Billing" },
      { to: "/settings",      icon: Settings,    label: "Settings" },
      { to: "/notifications", icon: Bell,        label: "Notifications" },
      { to: "/help",          icon: HelpCircle,  label: "Help Center" },
    ],
  },
];

export default function Sidebar({ userTier = 0, isAdmin = false, user = null }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const toggle = (label) => setCollapsed(p => ({ ...p, [label]: !p[label] }));
  const logout = () => {
    localStorage.removeItem("base44_access_token");
    localStorage.removeItem("base44_refresh_token");
    sessionStorage.clear();
    base44.auth.logout("/login");
  };

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <img src={M_LOGO} alt="M" className="h-9 w-9 rounded-xl object-cover shadow-lg shadow-fuchsia-500/20" onError={(e) => e.target.style.display="none"} />
          <div>
            <span className="text-base font-black bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent tracking-tight">media.aevoice.ai</span>
            <div className="flex items-center gap-1 mt-0.5">
              <Zap className="w-2.5 h-2.5 text-fuchsia-400" />
              <span className="text-[9px] text-muted-foreground font-medium tracking-wide">AI MARKETING OS</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-2">
            <button onClick={() => toggle(section.label)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase hover:text-muted-foreground transition-colors">
              {section.label}
              <ChevronDown className={`w-3 h-3 transition-transform ${collapsed[section.label] ? "-rotate-90" : ""}`} />
            </button>
            {!collapsed[section.label] && (
              <div className="mt-0.5 space-y-0.5">
                {section.items.map(item => {
                  const isActive = location.pathname === item.to;
                  const isLocked = item.minTier && userTier < item.minTier;
                  return (
                    <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                        isActive
                          ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                      }`}>
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-fuchsia-400" : ""}`} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {isLocked && <Lock className="w-3 h-3 text-muted-foreground/30" />}
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