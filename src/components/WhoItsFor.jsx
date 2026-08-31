import { Users, Briefcase, Building2, Clapperboard, Languages, GraduationCap } from "lucide-react";

/**
 * "Who it's for" — the marketing page's plain-language answer to what the
 * platform actually does for different kinds of work.
 *
 * Every claim below maps to something that ships today: the Lane 1 content
 * tools (images, script, voiceover, Ken Burns assembly, scheduling, bulk
 * messaging, funnels), the Lane 2 render worker (per-scene AI video via
 * Kling/MiniMax, MusicGen), and the dubbing workspace (ElevenLabs dubbing
 * with voice and background-score preservation, 22 languages, glossary and
 * speaker mapping, optional lip-sync). Do not add a sector here whose
 * described workflow the app cannot actually complete — an aspirational
 * line on this page becomes a refund conversation later.
 */

const SECTORS = [
  {
    icon: Users,
    title: "Creators & influencers",
    body:
      "Turn one idea into a week of posts. Write the script, generate the visuals, add a narrated voiceover, and schedule it out — without paying for a designer, an editor and a scheduling tool separately.",
    proof: "Creator, from $19/mo",
  },
  {
    icon: Briefcase,
    title: "Small businesses",
    body:
      "Point it at your website and it drafts the campaign for you: ad creatives, landing funnels, lead capture, and email or WhatsApp follow-up. The marketing function of a small team, run by one person.",
    proof: "Starter & Growth",
  },
  {
    icon: Building2,
    title: "Marketing agencies",
    body:
      "Run many brands from one place, each with its own assets, voice and reporting. White-label client portals, an affiliate and reseller programme, and the option to bring your own SendGrid, Twilio or Meta credentials so sending costs stay yours.",
    proof: "Agency, 10 brands",
  },
  {
    icon: Clapperboard,
    title: "Film & video studios",
    body:
      "Build a film scene by scene — generated footage rather than moving stills, with an AI score, narration and subtitles on a real timeline. Useful for pitch reels and pre-visualisation long before a camera is hired.",
    proof: "Indie & Studio",
  },
  {
    icon: Languages,
    title: "Dubbing & localisation houses",
    body:
      "Version a finished feature into 22 languages while keeping the original performer's voice, tone and background score. Multi-hour source files, batch output in one pass, glossary control so terminology stays consistent, speaker mapping, optional lip-sync and SRT export.",
    proof: "Dubbing House & Enterprise",
  },
  {
    icon: GraduationCap,
    title: "Educators & publishers",
    body:
      "Take one recorded lesson or explainer and make it reach a wider audience — narrated, captioned, and dubbed into the languages your learners actually speak, without re-recording anything.",
    proof: "Studio & up",
  },
];

export default function WhoItsFor() {
  return (
    <section className="px-6 py-20 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-10">
          <p className="text-[10px] font-bold tracking-widest text-fuchsia-400/80 uppercase mb-2">Who it&rsquo;s for</p>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
            One platform, from a first post to a dubbed feature film
          </h2>
          <p className="text-neutral-400 text-sm md:text-base leading-relaxed">
            Most teams stitch this together from five or six tools — a design app, a stock library, a
            voiceover service, an editor, a scheduler, and a localisation vendor who quotes by the
            minute. Digital Studio covers that span in one place, and meters it in units you can
            actually read on an invoice. Where you start depends on what you make.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTORS.map((s) => (
            <div key={s.title}
              className="rounded-3xl border border-white/10 bg-white/3 p-6 flex flex-col hover:border-white/20 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center mb-4 shrink-0">
                <s.icon className="w-4.5 h-4.5 text-white" />
              </div>
              <h3 className="text-base font-black text-white mb-2">{s.title}</h3>
              <p className="text-neutral-400 text-xs leading-relaxed flex-1">{s.body}</p>
              <p className="text-[11px] font-bold text-fuchsia-400/90 mt-4">{s.proof}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
