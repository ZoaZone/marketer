import { useMemo, useState } from "react";
import { ArrowRight, RotateCcw, Sparkles, Info } from "lucide-react";
import {
  ALL_PLANS, PLAN_BY_KEY, RENDER_MINUTE_WEIGHTS,
  RENDER_MINUTE_RETAIL_USD, AI_CREDIT_RETAIL_USD,
  DUBBING_TIERS, RENDER_TIERS, FREE_TRIAL_GENERATIONS,
} from "@/config/plans";

/**
 * "Help me choose a plan."
 *
 * Everything here is derived from the canonical catalog and from
 * RENDER_MINUTE_WEIGHTS — the same weights the backend actually charges
 * with. That matters: a recommender that guesses would happily point a
 * dubbing customer at Creator, which the server would then refuse with a
 * 403, or quote a volume the plan cannot cover. The estimate a visitor sees
 * here is the arithmetic their invoice will use.
 *
 * It deliberately recommends the CHEAPEST plan that both (a) unlocks the
 * features the answers require and (b) covers the stated monthly volume —
 * not the most expensive one that fits.
 */

const ROLES = [
  { id: "creator", label: "Creator or influencer", hint: "Posting for my own audience" },
  { id: "business", label: "A business", hint: "Marketing our own product" },
  { id: "agency", label: "An agency", hint: "Delivering for client brands" },
  { id: "studio", label: "A film or video studio", hint: "Producing original footage" },
  { id: "dubbing", label: "A dubbing or localisation house", hint: "Versioning finished films" },
];

const OUTPUTS = [
  { id: "social", label: "Social posts & ad creatives", needs: null,
    hint: "Images, captions, short clips" },
  { id: "shortvid", label: "Short marketing videos", needs: null,
    hint: "Script → images → voiceover, assembled" },
  { id: "aivideo", label: "Per-scene AI video", needs: "render",
    hint: "Generated motion footage, not stills" },
  { id: "dubbing", label: "Dubbed versions of existing video", needs: "dubbing",
    hint: "Same voice and score, new language" },
];

// Monthly volume inputs, only shown when they are relevant to the answers.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

/**
 * The recommendation, as a pure function so it can be tested. Exported for
 * scripts/test-advisor.mjs — a recommender that points a dubbing customer at
 * a plan the server will 403, or quotes a volume the plan cannot cover, is
 * worse than no recommender at all.
 */
export function recommendPlan({ output, images = 0, scenes = 0, dubMinutes = 0, languages = 1, lipSync = false, brands = 1 }) {
  const needsDubbing = output === "dubbing";
  const needsRender = output === "aivideo" || needsDubbing;

  // Convert the stated volume into the two units the platform meters in,
  // using the published weights.
  let rm = 0;
  let credits = images;

  if (output === "aivideo") {
    rm += scenes * RENDER_MINUTE_WEIGHTS.ai_video_scene;
  }
  if (needsDubbing) {
    rm += dubMinutes * languages * RENDER_MINUTE_WEIGHTS.dubbing_minute;
    if (lipSync) rm += dubMinutes * languages * RENDER_MINUTE_WEIGHTS.lipsync_minute;
  }
  // A short marketing video is roughly 6 credits: ~5 scene images plus a
  // voiceover. Counted on top of whatever standalone images they asked for.
  if (output === "shortvid") credits += 6 * Math.max(1, Math.round(images / 20));

  const eligible = ALL_PLANS.filter((p) => {
    if (p.key === "byok") return false;                       // handled separately below
    if (needsDubbing && !DUBBING_TIERS.includes(p.key)) return false;
    if (needsRender && !RENDER_TIERS.includes(p.key)) return false;
    if (brands > 1 && p.limits.brands !== -1 && p.limits.brands < brands) return false;
    return true;
  });

  const covers = (p) =>
    (p.allowance.render_minutes === -1 || p.allowance.render_minutes >= rm) &&
    (p.allowance.ai_credits === -1 || p.allowance.ai_credits >= credits);

  const byPrice = [...eligible].sort((a, b) => a.price_monthly - b.price_monthly);
  const fits = byPrice.find(covers);
  // Nothing covers it: the honest answer is the top plan plus overage, or
  // a conversation — not a plan that silently overruns every month.
  const pick = fits || byPrice[byPrice.length - 1] || PLAN_BY_KEY.creator;

  const overRm = Math.max(0, rm - (pick.allowance.render_minutes || 0));
  const overCredits = Math.max(0, credits - (pick.allowance.ai_credits || 0));
  const overageUsd = Math.round(
    overRm * RENDER_MINUTE_RETAIL_USD + overCredits * AI_CREDIT_RETAIL_USD,
  );

  const stepUp = byPrice.find((p) => p.price_monthly > pick.price_monthly && covers(p));

  return { pick, rm, credits, fits: !!fits, overageUsd, stepUp, eligible: byPrice };
}

export default function PlanAdvisor({ onChoose }) {
  const [role, setRole] = useState(null);
  const [output, setOutput] = useState(null);
  const [images, setImages] = useState(100);
  const [scenes, setScenes] = useState(20);
  const [dubMinutes, setDubMinutes] = useState(60);
  const [languages, setLanguages] = useState(2);
  const [lipSync, setLipSync] = useState(false);
  const [brands, setBrands] = useState(1);

  // Only decides which sliders to show; recommendPlan derives its own.
  const needsDubbing = output === "dubbing";

  const result = useMemo(() => {
    if (!role || !output) return null;
    return recommendPlan({ output, images, scenes, dubMinutes, languages, lipSync, brands });
  }, [role, output, images, scenes, dubMinutes, languages, lipSync, brands]);

  const reset = () => { setRole(null); setOutput(null); };

  const Chip = ({ active, onClick, label, hint }) => (
    <button type="button" onClick={onClick}
      className={`text-left px-4 py-3 rounded-2xl border transition-all ${
        active
          ? "border-fuchsia-500/60 bg-fuchsia-500/10"
          : "border-white/10 bg-white/3 hover:border-white/25"
      }`}>
      <div className="text-sm font-bold text-white">{label}</div>
      {hint && <div className="text-[11px] text-white/40 mt-0.5">{hint}</div>}
    </button>
  );

  const Slider = ({ label, value, set, min, max, step = 1, suffix }) => (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-semibold text-white/70">{label}</label>
        <span className="text-sm font-black text-white">{value.toLocaleString()}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(clamp(e.target.value, min, max))}
        className="w-full accent-fuchsia-500" />
    </div>
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="text-xl font-black text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-fuchsia-400" /> Not sure which plan?
        </h3>
        {(role || output) && (
          <button onClick={reset} className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1.5 shrink-0">
            <RotateCcw className="w-3 h-3" /> Start over
          </button>
        )}
      </div>
      <p className="text-sm text-white/40 mb-6">
        Answer two questions and set your rough monthly volume. We&rsquo;ll size it against the
        same units your invoice uses — no sales call needed.
      </p>

      {/* Q1 */}
      <p className="text-[11px] font-bold tracking-widest text-white/30 uppercase mb-2">1 · Who are you?</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
        {ROLES.map((r) => (
          <Chip key={r.id} active={role === r.id} onClick={() => setRole(r.id)} label={r.label} hint={r.hint} />
        ))}
      </div>

      {/* Q2 */}
      {role && (
        <>
          <p className="text-[11px] font-bold tracking-widest text-white/30 uppercase mb-2">2 · What will you mostly make?</p>
          <div className="grid sm:grid-cols-2 gap-2 mb-6">
            {OUTPUTS.map((o) => (
              <Chip key={o.id} active={output === o.id} onClick={() => setOutput(o.id)} label={o.label} hint={o.hint} />
            ))}
          </div>
        </>
      )}

      {/* Q3 — only the sliders that matter for the chosen answers */}
      {role && output && (
        <>
          <p className="text-[11px] font-bold tracking-widest text-white/30 uppercase mb-3">3 · Roughly how much, per month?</p>
          <div className="grid sm:grid-cols-2 gap-5 mb-6">
            <Slider label="AI images / graphics" value={images} set={setImages} min={0} max={4000} step={10} />
            {(role === "agency" || role === "studio" || role === "dubbing") && (
              <Slider label="Brands or clients" value={brands} set={setBrands} min={1} max={20} />
            )}
            {output === "aivideo" && (
              <Slider label="AI video scenes (5s each)" value={scenes} set={setScenes} min={0} max={1200} step={5} />
            )}
            {needsDubbing && (
              <>
                <Slider label="Minutes of source video" value={dubMinutes} set={setDubMinutes} min={0} max={1200} step={10} suffix=" min" />
                <Slider label="Target languages" value={languages} set={setLanguages} min={1} max={22} />
              </>
            )}
          </div>
          {needsDubbing && (
            <label className="flex items-center gap-2 mb-6 text-xs text-white/60 cursor-pointer">
              <input type="checkbox" checked={lipSync} onChange={(e) => setLipSync(e.target.checked)} className="accent-fuchsia-500" />
              Also lip-sync the dubbed footage
              <span className="text-white/30">(costs {RENDER_MINUTE_WEIGHTS.lipsync_minute}× a dubbed minute)</span>
            </label>
          )}
        </>
      )}

      {/* Recommendation */}
      {result && (
        <div className="rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-purple-500/5 p-5">
          <p className="text-[11px] font-bold tracking-widest text-fuchsia-300/80 uppercase mb-1">
            {result.fits ? "Recommended" : "Closest fit"}
          </p>
          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <span className="text-2xl font-black text-white">{result.pick.name}</span>
            <span className="text-white/50 text-sm">${result.pick.price_monthly.toLocaleString()}/mo + tax</span>
          </div>

          <p className="text-sm text-white/60 mb-3">
            That volume works out to about{" "}
            <strong className="text-white">{Math.ceil(result.rm).toLocaleString()} Render Minutes</strong> and{" "}
            <strong className="text-white">{Math.ceil(result.credits).toLocaleString()} AI credits</strong> a month.
            {" "}
            {result.pick.name} includes{" "}
            {result.pick.allowance.render_minutes > 0 && <>{result.pick.allowance.render_minutes.toLocaleString()} Render Minutes and </>}
            {result.pick.allowance.ai_credits.toLocaleString()} credits.
          </p>

          {!result.fits && (
            <p className="text-xs text-amber-300/90 mb-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                That is more than any self-serve plan includes. {result.pick.name} would still run it,
                billing roughly <strong>${result.overageUsd.toLocaleString()}/mo</strong> in overage on top —
                at this volume a custom Enterprise agreement is normally cheaper. Talk to us before committing.
              </span>
            </p>
          )}

          {result.fits && result.overageUsd > 0 && (
            <p className="text-xs text-amber-300/90 mb-3">
              Heads up: you&rsquo;d be right at the edge — about ${result.overageUsd.toLocaleString()}/mo in overage.
              {result.stepUp && <> {result.stepUp.name} at ${result.stepUp.price_monthly.toLocaleString()}/mo would absorb it.</>}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => onChoose?.(result.pick)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2">
              Get {result.pick.name} <ArrowRight className="w-4 h-4" />
            </button>
            {!result.fits && (
              <a href="mailto:care@digitalstudios.app?subject=Enterprise%20volume%20pricing"
                className="px-5 py-2.5 rounded-xl border border-white/20 text-white/80 text-sm font-bold hover:bg-white/5 transition-all">
                Talk to sales
              </a>
            )}
          </div>

          <p className="text-[11px] text-white/30 mt-3">
            Every plan starts with {FREE_TRIAL_GENERATIONS} free AI generations, no card required —
            and you can change plan at any time.
          </p>
        </div>
      )}
    </div>
  );
}
