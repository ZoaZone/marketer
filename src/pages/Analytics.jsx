import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { BarChart3, TrendingUp, Users, Megaphone, Share2, GitBranch, Sparkles, ArrowUp, ArrowDown, Minus } from "lucide-react";

const COLORS = ["#d946ef","#a855f7","#ec4899","#f59e0b","#10b981","#3b82f6","#f43f5e","#8b5cf6"];

function StatCard({ Icon, label, value, sub, trend, color = "text-fuchsia-400" }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        {trend !== undefined && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${trend > 0 ? "text-emerald-400" : trend < 0 ? "text-red-400" : "text-muted-foreground"}`}>
            {trend > 0 ? <ArrowUp className="w-3 h-3" /> : trend < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-black text-foreground">{value}</div>
      <div className="text-sm text-muted-foreground font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="text-muted-foreground mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const { user } = useOutletContext() || {};
  const enabled = !!user?.email;
  const { data: campaigns = [] } = useQuery({ queryKey: ["campaigns_a", user?.email], queryFn: () => base44.entities.MarketingCampaign.filter(mine(user), null, 200), enabled });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts_a", user?.email], queryFn: () => base44.entities.MarketingContact.filter(mine(user), null, 500), enabled });
  const { data: leads = [] } = useQuery({ queryKey: ["leads_a", user?.email], queryFn: () => base44.entities.LeadCapture.filter(mine(user), "-captured_at", 500), enabled });
  const { data: posts = [] } = useQuery({ queryKey: ["posts_a", user?.email], queryFn: () => base44.entities.ScheduledPost.filter(mine(user), null, 200), enabled });
  const { data: funnels = [] } = useQuery({ queryKey: ["funnels_a", user?.email], queryFn: () => base44.entities.Funnel.filter(mine(user), null, 50), enabled });
  const { data: assets = [] } = useQuery({ queryKey: ["assets_a", user?.email], queryFn: () => base44.entities.ContentAsset.filter(mine(user), null, 200), enabled });
  const { data: messages = [] } = useQuery({ queryKey: ["messages_a", user?.email], queryFn: () => base44.entities.BulkMessage.filter(mine(user), null, 500), enabled });

  // Aggregates
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.open_count || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.click_count || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : 0;
  const ctr = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : 0;
  const postedCount = posts.filter(p => p.status === "posted").length;
  const aiCount = assets.filter(a => a.ai_generated).length;
  const avgConversion = funnels.length > 0
    ? (funnels.reduce((s, f) => s + (f.conversion_rate || 0), 0) / funnels.length).toFixed(1)
    : 0;

  // Campaign performance bar chart
  const campaignData = campaigns.slice(0, 8).map(c => ({
    name: (c.name || "Campaign").slice(0, 14),
    Sent: c.sent_count || 0,
    Opens: c.open_count || 0,
    Clicks: c.click_count || 0,
  }));

  // Channel breakdown pie
  const channelMap = campaigns.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {});
  const channelData = Object.entries(channelMap).map(([name, value]) => ({ name, value }));

  // Lead source breakdown
  const sourceMap = leads.reduce((acc, l) => { acc[l.source || "unknown"] = (acc[l.source || "unknown"] || 0) + 1; return acc; }, {});
  const sourceData = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

  // Platform breakdown for social
  const platformMap = posts.reduce((acc, p) => { acc[p.platform] = (acc[p.platform] || 0) + 1; return acc; }, {});
  const platformData = Object.entries(platformMap).map(([name, value]) => ({ name, value }));

  // Leads over time (last 7 days)
  const leadsByDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en", { weekday: "short" });
    const count = leads.filter(l => l.captured_at && new Date(l.captured_at).toDateString() === d.toDateString()).length;
    return { day: label, Leads: count };
  });

  // Contacts by stage
  const stageMap = contacts.reduce((acc, c) => { const s = c.funnel_stage || "unknown"; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const stageData = Object.entries(stageMap).map(([name, value]) => ({ name, value }));

  // Funnel performance
  const funnelData = funnels.map(f => ({
    name: (f.name || "Funnel").slice(0, 16),
    Leads: f.total_leads || 0,
    Converted: f.converted_leads || 0,
    Rate: f.conversion_rate || 0,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-fuchsia-400" /> Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Performance across campaigns, leads, social, and AI content</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        <StatCard Icon={Megaphone} label="Messages Sent" value={totalSent.toLocaleString()} sub={`${campaigns.length} campaigns`} trend={12} color="text-fuchsia-400" />
        <StatCard Icon={TrendingUp} label="Open Rate" value={`${openRate}%`} sub={`${totalOpens.toLocaleString()} opens`} trend={3} color="text-emerald-400" />
        <StatCard Icon={Users} label="Total Contacts" value={contacts.length.toLocaleString()} sub={`${leads.length} captured leads`} trend={8} color="text-blue-400" />
        <StatCard Icon={Share2} label="Posts Published" value={postedCount} sub={`${posts.length} total scheduled`} trend={-2} color="text-pink-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard Icon={GitBranch} label="Avg Conversion" value={`${avgConversion}%`} sub={`${funnels.length} funnels`} color="text-amber-400" />
        <StatCard Icon={Sparkles} label="AI Assets" value={aiCount} sub="generated" color="text-purple-400" />
        <StatCard Icon={TrendingUp} label="Click-Through" value={`${ctr}%`} sub={`${totalClicks.toLocaleString()} clicks`} color="text-cyan-400" />
        <StatCard Icon={Megaphone} label="Active Campaigns" value={campaigns.filter(c => c.status === "running").length} sub="currently running" color="text-rose-400" />
      </div>

      {/* Campaign performance */}
      {campaignData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-bold text-sm text-foreground mb-4">Campaign Performance</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={campaignData} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Sent" fill="#d946ef" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Opens" fill="#a855f7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Clicks" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3-column charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Channel breakdown */}
        {channelData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold text-sm text-foreground mb-4">Campaign Channels</h2>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {channelData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="capitalize text-muted-foreground">{d.name.replace(/_/g, " ")}</span>
                  </div>
                  <span className="font-semibold text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead sources */}
        {sourceData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold text-sm text-foreground mb-4">Lead Sources</h2>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {sourceData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[(i + 2) % COLORS.length] }} />
                    <span className="capitalize text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social platforms */}
        {platformData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold text-sm text-foreground mb-4">Social Platforms</h2>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={platformData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {platformData.map((_, i) => <Cell key={i} fill={COLORS[(i + 4) % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {platformData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[(i + 4) % COLORS.length] }} />
                    <span className="capitalize text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leads over time */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-bold text-sm text-foreground mb-4">Leads This Week</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={leadsByDay}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="Leads" stroke="#d946ef" strokeWidth={2} dot={{ fill: "#d946ef", r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Funnel performance */}
      {funnelData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-bold text-sm text-foreground mb-4">Funnel Performance</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={funnelData} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Leads" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Converted" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Contact stages */}
      {stageData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-bold text-sm text-foreground mb-3">Contact Pipeline Stages</h2>
          <div className="space-y-2">
            {stageData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground capitalize w-28 truncate">{d.name.replace(/_/g, " ")}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min((d.value / contacts.length) * 100, 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                </div>
                <span className="text-xs font-semibold text-foreground w-8 text-right">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
