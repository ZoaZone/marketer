/**
 * Pricing FAQ content, shared by the visible accordion (PricingFAQ.jsx) and
 * the FAQPage structured data (lib/seo.js).
 *
 * These MUST be the same text. Google's FAQPage guidelines require the
 * marked-up content to match what the user actually sees on the page;
 * markup that says something the page does not is a manual-action risk, not
 * a clever SEO trick. Sharing one source is the only way to guarantee that
 * as the copy changes.
 *
 * Every figure is interpolated from the canonical catalog, so an answer here
 * cannot contradict the plan cards.
 */
import {
  AI_CREDIT_RETAIL_USD, RENDER_MINUTE_RETAIL_USD, RENDER_MINUTE_WEIGHTS,
  FREE_TRIAL_GENERATIONS, MIN_CREDIT_PURCHASE_USD, BYOK_INCLUDED_TIERS, PLAN_BY_KEY,
} from "@/config/plans";

const byokIncluded = BYOK_INCLUDED_TIERS.map((k) => PLAN_BY_KEY[k]?.name).filter(Boolean).join(", ");

export const PRICING_FAQ = [
  {
    q: "What exactly is an AI credit?",
    a: `One credit buys one AI image, one short video scene, or one voiceover of up to 1,500 characters. Every plan includes a monthly pool, and you can top up any time from $${MIN_CREDIT_PURCHASE_USD} — bought credits never expire.`,
  },
  {
    q: "And a Render Minute?",
    a: `A Render Minute is one minute of finished dubbed output. Heavier work costs proportionally more, because it genuinely takes more to produce: lip-sync is ${RENDER_MINUTE_WEIGHTS.lipsync_minute} Render Minutes per minute, one 5-second AI video scene is ${RENDER_MINUTE_WEIGHTS.ai_video_scene}, and one generated music track is ${RENDER_MINUTE_WEIGHTS.music_track}. Dubbing a 90-minute film into three languages is 270 Render Minutes.`,
  },
  {
    q: "Why are there two different units?",
    a: "Because the two halves of the platform cost very different things to run. Marketing content runs on pooled AI capacity and is effectively flat-rate, so credits are simple and generous. Dubbing, lip-sync and per-scene AI video call external providers that bill by the minute, so they are metered honestly rather than hidden behind an 'unlimited' claim we would have to walk back.",
  },
  {
    q: "What happens when I use up my monthly allowance?",
    a: `Nothing stops mid-project. Usage past your allowance bills automatically at $${AI_CREDIT_RETAIL_USD.toFixed(2)} per AI credit and $${RENDER_MINUTE_RETAIL_USD.toFixed(2)} per Render Minute. Overage is priced above the in-plan rate on purpose — if you are regularly running over, moving up a plan is cheaper, and we would rather tell you that than quietly bill you for it. Enterprise accounts can have overage switched off entirely so jobs are refused at the cap instead.`,
  },
  {
    q: "Do unused credits roll over?",
    a: "Plan allowances reset each month and do not roll over. Pay-as-you-go credits you have purchased separately never expire, and are used only after the monthly allowance is spent.",
  },
  {
    q: "Can I use my own Replicate or ElevenLabs account?",
    a: `Yes — that is the BYO Providers add-on. Connect your keys from Integrations and jobs run on your account, so your provider bills you directly and those jobs consume none of your Render Minutes. It is $${PLAN_BY_KEY.byok.price_monthly}/mo standalone and included free with ${byokIncluded}. Useful if you already have negotiated provider rates or your own compliance requirements.`,
  },
  {
    q: "What do I get before paying anything?",
    a: `${FREE_TRIAL_GENERATIONS} AI generations, no credit card. That covers images and voiceover, which is enough to take a short narrated video end to end. Per-scene AI video, AI music and dubbing need a paid plan, because those spend real per-minute money with external providers the moment they run.`,
  },
  {
    q: "Which plans include commercial dubbing?",
    a: "Studio, Dubbing House and Enterprise — plus anyone on the BYO Providers add-on using their own keys. Dubbing preserves the original speaker's voice, tone and background score, handles multi-hour source files, and can output many languages from a single pass with glossary and speaker-mapping control.",
  },
  {
    q: "Can I change plans or cancel?",
    a: "Any time, from the Billing page. Upgrades take effect immediately; cancellation stops the next renewal. Fees already paid are non-refundable except where the law requires otherwise, and AI, render and dubbing usage that has already been consumed is never refundable — the provider cost for it has been incurred and cannot be recovered.",
  },
  {
    q: "Do I own what I make, and can I sell it?",
    a: "Yes — output you generate is yours to use commercially. You are responsible for holding the rights to anything you upload or clone, and voice cloning requires documented consent from the performer, with written releases mandatory for celebrities and recording artists. The full terms are on our Terms of Service page.",
  },
  {
    q: "Are the prices inclusive of tax?",
    a: "No. Every price shown excludes tax, which is calculated at checkout from your billing address.",
  },
];
