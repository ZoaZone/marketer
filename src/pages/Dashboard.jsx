import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, Megaphone, Share2, GitBranch, MessageSquare, Clock, TrendingUp, Sparkles, Zap, ArrowRight, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

const M_LOGO = "https://media.base44.com/images/public/69b1f1d60b1fb9d791fddc64/d1aa347a6_generated_image.png";

export default function Dashboard() {
  const { user } = useOutletContext() || {};

  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.MarketingContact.list("-created_date", 50) });
  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns"], queryFn: () => base44.entities.MarketingCampaign.list("-created_date", 10) });
  const { data: posts = [] } = useQuery({ queryKey: ["scheduled_posts"], queryFn: () => base44.entities.ScheduledPost.list("-created_date", 10) });
  const { data: funnels = [] } = useQuery({ queryKey: ["funnels"], queryFn: () => base44.entities.Funnel.list("-created_date", 10) });
  const { data: leads = [] } = useQuery({ queryKey: ["leads"], queryFn: () => base44.entities.LeadCapture.list("-created_date", 20) });
  const { data: messages = [] } = useQuery({ queryKey: ["bulk_messages"], queryFn: () => base44.entities.BulkMessage.list("-created_date", 100) });

  const activeCampaigns = campaigns.filter(c => c.status === "running").length;
  const pendingPosts = posts.filter(p => p.status === "scheduled").length;
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const todayLeads = leads.filter(l => l.captured_at && new Date(l.captured_at).toDateString() === new Date().toDateString()).length;

  const STATS = [
    { label: "Total Contacts", value: contacts.length, Icon: Users, color: "text-fuchsia-400 bg-fuchsia-500/10", trend: "+12%" },
    { label: "Active Campaigns", value: activeCampaigns, Icon: Megaphone, color: "text-purple-400 bg-purple-500/10", trend: `${campaigns.length} total` },
    { label: "Messages Sent", value: totalSent.toLocaleString(), Icon: MessageSquare, color: "text-pink-400 bg-pink-500/10", trend: "all time" },
    { label: "Scheduled Posts", value: pendingPosts, Icon: Clock, color: "text-amber-400 bg-amber-500/10", trend: "upcoming" },
    { label: "Active Funnels", value: funnels.length, Icon: GitBranch, color: "text-emerald-400 bg-emerald-500/10", trend: "running" },
    { label: "Today's Leads", value: todayLeads, Icon: TrendingUp, color: "text-blue-400 bg-blue-500/10", trend: `${leads.length} total` },
  ];

  const QUICK_LINKS = [
    { label: "New Campaign", to: "/campaigns", Icon: Megaphone, color: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400" },
    { label: "AI Media", to: "/media-studio", Icon: Sparkles, color: "bg-purple-500/10 border-purple-500/30 text-purple-400" },
    { label: "Schedule Post", to: "/social-hub", Icon: Share2, color: "bg-pink-500/10 border-pink-500/30 text-pink-400" },
    { label: "Add Lead", to: "/lead-capture", Icon: Plus, color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
    { label: "Build Funnel", to: "/funnel-builder", Icon: GitBranch, color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
    { label: "Scan Website", to: "/website-scanner", Icon: Zap, color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <img src={M_LOGO} alt="" className="w-9 h-9 rounded-xl" onError={(e) => e.target.style.display="none"} />
          <div>
            <h1 className="text-2xl font-black text-foreground">
              Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground text-sm">Here's your marketing overview</p>
          </div>
        </div>
        <Link to="/campaigns" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-fuchsia-500/25">
          <Plus className="w-4 h-4" /> New Campaign
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATS.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center mb-3`}>
              <s.Icon className={`w-4 h-4 ${s.color.split(" ")[0]}`} />
            </div>
            <div className="text-2xl font-black text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            <div className="text-xs text-muted-foreground/50 mt-0.5">{s.trend}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_LINKS.map(q => (
            <Link key={q.label} to={q.to} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${q.color} hover:scale-105 transition-transform text-center`}>
              <q.Icon className="w-5 h-5" />
              <span className="text-xs font-semibold">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent campaigns + leads */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent campaigns */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Recent Campaigns</h3>
            <Link to="/campaigns" className="text-xs text-fuchsia-400 hover:underline">View all →</Link>
          </div>
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Megaphone className="w-8 h-8 text-muted-foreground/20 mb-2" />
              <p className="text-muted-foreground text-sm">No campaigns yet</p>
              <Link to="/campaigns" className="text-xs text-fuchsia-400 mt-2 hover:underline">Create your first →</Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {campaigns.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.type} · {c.sent_count || 0} sent</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.status === "running" ? "bg-emerald-500/10 text-emerald-400" :
                    c.status === "completed" ? "bg-blue-500/10 text-blue-400" :
                    c.status === "scheduled" ? "bg-amber-500/10 text-amber-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent leads */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Recent Leads</h3>
            <Link to="/lead-capture" className="text-xs text-fuchsia-400 hover:underline">View all →</Link>
          </div>
          {leads.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Users className="w-8 h-8 text-muted-foreground/20 mb-2" />
              <p className="text-muted-foreground text-sm">No leads yet</p>
              <Link to="/lead-capture" className="text-xs text-fuchsia-400 mt-2 hover:underline">Capture first lead →</Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {leads.slice(0, 5).map(l => (
                <div key={l.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{l.full_name || l.email || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{l.source} · {l.captured_at ? new Date(l.captured_at).toLocaleDateString() : ""}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-400 font-medium">{l.funnel_id ? "In funnel" : "New"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming posts */}
      {pendingPosts > 0 && (
        <div className="bg-card border border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-foreground">{pendingPosts} post{pendingPosts > 1 ? "s" : ""} scheduled</h3>
            <Link to="/social-hub" className="ml-auto text-xs text-amber-400 hover:underline">Manage →</Link>
          </div>
          <div className="space-y-2">
            {posts.filter(p => p.status === "scheduled").slice(0, 3).map(p => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">{p.platform}</span>
                <span className="text-muted-foreground truncate flex-1">{p.caption?.slice(0, 60) || "No caption"}…</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
