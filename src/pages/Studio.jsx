import { useOutletContext, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";
import { BRAND } from "@/lib/brand";
import { Film, Music, Sliders, Monitor, Plus, Image as ImageIcon, ArrowRight, Briefcase, Clapperboard } from "lucide-react";

// The two lanes (Work Package G): Lane 1 (Business/Marketing — Base44-native
// generation + FFmpeg assembly, no paid Replicate/ElevenLabs calls) and
// Lane 2 (Movie Maker Pro — adds paid Kling/ElevenLabs generation).
// See src/utils/lane1.js and src/utils/lane2.js for the enforced boundary.
const LANES = [
  {
    to: "/quick-create", icon: Briefcase, gradient: "from-fuchsia-500 to-purple-600",
    audience: "For Business / Marketing", label: "Quick Create",
    description: "Prompt → script → storyboard → short video → voiceover → export. Fast, on-brand content — no per-minute AI video billing.",
  },
  {
    to: "/movie-maker", icon: Clapperboard, gradient: "from-cyan-500 to-blue-600",
    audience: "For Film & Studios", label: "Movie Maker Pro",
    description: "Script → reference lock → per-scene AI video (Kling) → music → dubbing → lip-sync → captions → master export.",
  },
];

// The default post-login landing — a creative hub foregrounding the AI
// creative tools (see Auth.jsx's DASHBOARD redirect and the Sidebar logo
// link, both of which now point here instead of /dashboard). The marketing
// dashboard itself is unchanged and still reachable from the sidebar.
const TOOLS = [
  { to: "/movie-maker",  icon: Film,    gradient: "from-cyan-500 to-blue-600",   label: "Movie Maker", description: "Feature-length AI films — scenes, music, subtitles, dubbing" },
  { to: "/song-creator", icon: Music,   gradient: "from-violet-500 to-pink-600", label: "Song Creator", description: "AI lyrics, voiceover, and multilingual dubbing" },
  { to: "/media-editor", icon: Sliders, gradient: "from-fuchsia-500 to-purple-600", label: "Media Editor", description: "Style transforms, captions, background music" },
  { to: "/demo-video",   icon: Monitor, gradient: "from-fuchsia-500 to-purple-600", label: "Demo Video", description: "Turn any URL into a narrated demo video" },
];

export default function Studio() {
  const { user } = useOutletContext() || {};

  const { data: recent = [] } = useQuery({
    queryKey: ["studio_recent_projects", user?.email],
    queryFn: () => base44.entities.ContentAsset.filter(mine(user), "-created_date", 8),
    enabled: !!user?.email,
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase">{BRAND.name}</p>
          <h1 className="text-2xl font-black text-foreground">
            {user?.full_name ? `Welcome back, ${user.full_name.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{BRAND.tagline}</p>
        </div>
        <Link to="/movie-maker"
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/25">
          <Plus className="w-4 h-4" /> New Movie
        </Link>
      </div>

      {/* Two lanes — distinct entry points by audience */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Choose your lane</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {LANES.map(l => (
            <Link key={l.to} to={l.to}
              className="group flex flex-col gap-3 p-6 rounded-2xl bg-card border border-border hover:border-cyan-500/30 transition-all hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${l.gradient} flex items-center justify-center shadow-lg shrink-0`}>
                  <l.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">{l.audience}</p>
              </div>
              <p className="font-bold text-foreground text-lg flex items-center gap-1.5">
                {l.label}
                <ArrowRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all" />
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">{l.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Creative tool cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Create</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOOLS.map(t => (
            <Link key={t.to} to={t.to}
              className="group flex flex-col gap-3 p-5 rounded-2xl bg-card border border-border hover:border-cyan-500/30 transition-all hover:-translate-y-0.5">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center shadow-lg shrink-0`}>
                <t.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  {t.label}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all" />
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent projects */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent projects</h2>
          <Link to="/media-library" className="text-xs text-cyan-400 hover:underline">View library →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center bg-card border border-border rounded-2xl">
            <ImageIcon className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-muted-foreground text-sm">Nothing created yet</p>
            <Link to="/movie-maker" className="text-xs text-cyan-400 mt-2 hover:underline">Start your first project →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {recent.map(a => (
              <div key={a.id} className="rounded-xl bg-card border border-border overflow-hidden">
                {a.type === "image" && a.file_url ? (
                  <div className="aspect-video bg-muted overflow-hidden"><img src={a.file_url} alt={a.title} className="w-full h-full object-cover" /></div>
                ) : a.type === "video" && a.file_url ? (
                  <div className="aspect-video bg-black overflow-hidden"><video src={a.file_url} className="w-full h-full object-cover opacity-80" /></div>
                ) : (
                  <div className="aspect-video flex items-center justify-center bg-muted text-muted-foreground text-xs">{a.type?.replace(/_/g, " ") || "project"}</div>
                )}
                <p className="text-xs font-medium text-foreground truncate px-2.5 py-2">{a.title || "Untitled"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
