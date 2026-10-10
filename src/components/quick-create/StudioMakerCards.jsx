import { Link } from 'react-router-dom';
import { Briefcase, Clapperboard, ChevronRight, Lock } from 'lucide-react';

export default function StudioMakerCards({ canMovieMaker }) {
  return <div className="grid sm:grid-cols-2 gap-3">
    <div className="p-4 rounded-2xl border-2 border-fuchsia-500/50 bg-fuchsia-500/5">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shrink-0"><Briefcase className="w-4 h-4 text-white" /></div>
        <div><p className="text-sm font-bold text-foreground">Create with Studio</p><p className="text-[10px] font-bold tracking-widest text-fuchsia-400 uppercase">You are here</p></div>
      </div>
      <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">Choose Base44 integration credits only above for direct image or moving-video generation. The existing workflow keeps storyboard stills, external assembly, and optional premium video and audio.</p>
    </div>
    {canMovieMaker ? <Link to="/movie-maker" className="group p-4 rounded-2xl border border-border bg-card hover:border-cyan-500/40 transition-all">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0"><Clapperboard className="w-4 h-4 text-white" /></div>
        <div><p className="text-sm font-bold text-foreground flex items-center gap-1.5">Movie Maker Pro<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" /></p><p className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">Premium</p></div>
      </div>
      <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">Multi-shot scenes, reference locking for character consistency, dubbing, lip-sync and captions. For films rather than shorts.</p>
    </Link> : <div className="p-4 rounded-2xl border border-border bg-card opacity-80">
      <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0"><Lock className="w-4 h-4 text-muted-foreground" /></div><div><p className="text-sm font-bold text-foreground">Movie Maker Pro</p><p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Paid tiers only</p></div></div>
      <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">Multi-shot scenes, reference locking, dubbing, lip-sync and captions. <Link to="/pricing" className="text-fuchsia-400 hover:underline font-semibold">See plans</Link></p>
    </div>}
  </div>;
}