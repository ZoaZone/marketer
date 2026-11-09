import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCheck, Megaphone, GitBranch, Share2, Sparkles, Info, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

const TYPE_CONFIG = {
  campaign: { Icon: Megaphone, color: "text-fuchsia-400 bg-fuchsia-500/10" },
  funnel:   { Icon: GitBranch, color: "text-amber-400 bg-amber-500/10" },
  social:   { Icon: Share2,    color: "text-blue-400 bg-blue-500/10" },
  ai:       { Icon: Sparkles,  color: "text-purple-400 bg-purple-500/10" },
  success:  { Icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10" },
  warning:  { Icon: AlertCircle, color: "text-orange-400 bg-orange-500/10" },
  info:     { Icon: Info,      color: "text-sky-400 bg-sky-500/10" },
};

const SAMPLE = [
  { id: "s1", type: "campaign", title: "Campaign 'Spring Launch' completed", body: "1,250 messages delivered · 38.9% open rate", read: false, created_date: new Date(Date.now() - 1000 * 60 * 30) },
  { id: "s2", type: "funnel",   title: "New lead captured via Free Trial Funnel", body: "priya@example.com just signed up", read: false, created_date: new Date(Date.now() - 1000 * 60 * 60 * 2) },
  { id: "s3", type: "social",   title: "Scheduled post published", body: "TikTok reel went live · 2.3K likes so far", read: true,  created_date: new Date(Date.now() - 1000 * 60 * 60 * 5) },
  { id: "s4", type: "ai",       title: "AI image generated", body: "Your Spring Campaign banner is ready in Media Library", read: true, created_date: new Date(Date.now() - 1000 * 60 * 60 * 24) },
  { id: "s5", type: "success",  title: "Payment received", body: "Growth plan · ₹12,350/month activated", read: true, created_date: new Date(Date.now() - 1000 * 60 * 60 * 48) },
];

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

export default function Notifications() {
  const [items, setItems] = useState(SAMPLE);
  const unread = items.filter(i => !i.read).length;

  const markAll = () => setItems(prev => prev.map(i => ({ ...i, read: true })));
  const markOne = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i));
  const remove  = (id) => setItems(prev => prev.filter(i => i.id !== id));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-fuchsia-400" /> Notifications
            {unread > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-xs font-bold">{unread}</span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Activity across your campaigns, leads, and content</p>
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>You're all caught up!</p>
          </div>
        )}
        {items.map(item => {
          const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.info;
          return (
            <div key={item.id}
              onClick={() => markOne(item.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all hover:border-fuchsia-500/20 ${item.read ? "bg-card border-border opacity-60" : "bg-card border-fuchsia-500/20 shadow-sm shadow-fuchsia-500/5"}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                <cfg.Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${item.read ? "text-muted-foreground" : "text-foreground"}`}>{item.title}</p>
                  <span className="text-xs text-muted-foreground/50 whitespace-nowrap">{timeAgo(item.created_date)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.body}</p>
              </div>
              {!item.read && <div className="w-2 h-2 rounded-full bg-fuchsia-500 mt-1.5 flex-shrink-0" />}
              <button onClick={(e) => { e.stopPropagation(); remove(item.id); }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-muted-foreground/30 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
