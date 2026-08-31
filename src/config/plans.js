/**
 * CANONICAL PLAN CATALOG — the single source of truth for every price,
 * allowance and entitlement in the product.
 *
 * Before this file existed the plan list was hardcoded three separate times
 * (Pricing.jsx, Billing.jsx, stripeCheckoutCREAM's PLANS map) and they had
 * silently drifted: Billing.jsx offered 3 plans while Pricing.jsx advertised
 * 9, and Enterprise appeared on the marketing page with no way to buy or
 * provision it. Every surface now renders from this file.
 *
 * The Deno function deployments (base44/functions/*) cannot import a
 * frontend module, so stripeCheckoutCREAM and recordCommission keep their
 * own copies of the price map. Those copies are no longer kept in sync by
 * comment discipline — `npm run check:plans` parses them out and fails if
 * they disagree with this file. Run it in CI.
 *
 * NOTHING SECRET BELONGS IN THIS FILE. It ships in the browser bundle.
 * The platform margin, raw provider costs and the credit cost table live
 * server-side only, in base44/PRICING_INTERNAL.md and inlined into the
 * submit functions. See BILLING_MODEL below for what users are allowed to
 * see.
 */

// ---------------------------------------------------------------------------
// Metering units
// ---------------------------------------------------------------------------

/**
 * AI Credit — the Lane 1 (Business) unit. 1 credit = 1 AI image, 1 short
 * Lane-1 video scene, or 1 voiceover up to 1,500 characters.
 */
export const AI_CREDIT_RETAIL_USD = 0.06;

/**
 * Render Minute (RM) — the Lane 2 (Studio & Dubbing) unit, defined as one
 * minute of dubbed output. Heavier operations cost proportionally more:
 * lip-sync is 6 RM/min, one 5-second AI video scene is 1 RM, one generated
 * music track is 0.25 RM. Users see the weights (they are a product
 * feature); they never see the provider costs behind them.
 */
export const RENDER_MINUTE_RETAIL_USD = 0.95;

export const RENDER_MINUTE_WEIGHTS = {
  dubbing_minute: 1,
  lipsync_minute: 6,
  ai_video_scene: 1,
  music_track: 0.25,
};

/** Free trial, pre-subscription. Mirrors generateImage's server-side gate. */
export const FREE_TRIAL_GENERATIONS = 25;

/** Minimum pay-as-you-go top-up. Mirrors buyCredits' MIN_PURCHASE_USD. */
export const MIN_CREDIT_PURCHASE_USD = 10;

// ---------------------------------------------------------------------------
// Lane 1 — Business
// ---------------------------------------------------------------------------
// Pooled AI credits for marketing content: images, short video, voiceover,
// scripts, campaigns. Never touches a paid external render provider.

const LANE1 = [
  {
    key: "creator",
    name: "Creator",
    lane: 1,
    tier: 1,
    price_monthly: 19,
    price_yearly: 182,
    tagline: "For solo creators finding their footing.",
    allowance: { ai_credits: 150, render_minutes: 0 },
    limits: { brands: 1, seats: 1, bulk_messages: 250 },
    features: [
      "150 AI credits/month (images, short video, voiceover)",
      "1 brand / client account",
      "250 bulk messages/month",
      "AI script & campaign copy",
      "Media library + basic editor",
      "Email support",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    lane: 1,
    tier: 1,
    price_monthly: 49,
    price_yearly: 470,
    tagline: "For a growing business running its own marketing.",
    allowance: { ai_credits: 400, render_minutes: 0 },
    limits: { brands: 1, seats: 2, bulk_messages: 1000 },
    features: [
      "400 AI credits/month",
      "1 brand / client account · 2 seats",
      "1,000 bulk messages/month",
      "Social scheduling & publishing",
      "Funnel builder + lead capture",
      "Email support",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    lane: 1,
    tier: 2,
    price_monthly: 149,
    price_yearly: 1430,
    popular: true,
    tagline: "For teams running multiple brands at once.",
    allowance: { ai_credits: 1250, render_minutes: 0 },
    limits: { brands: 5, seats: 5, bulk_messages: 10000 },
    features: [
      "1,250 AI credits/month",
      "5 brands / client accounts · 5 seats",
      "10,000 bulk messages/month",
      "Analytics & campaign attribution",
      "Website scanner + auto demo videos",
      "Priority email support",
    ],
  },
  {
    key: "agency",
    name: "Agency",
    lane: 1,
    tier: 3,
    price_monthly: 399,
    price_yearly: 3830,
    tagline: "For agencies delivering for many clients.",
    allowance: { ai_credits: 3500, render_minutes: 0 },
    limits: { brands: 10, seats: 15, bulk_messages: 50000 },
    features: [
      "3,500 AI credits/month",
      "10 brands / unlimited clients · 15 seats",
      "50,000 bulk messages/month",
      "White-label client portals",
      "Affiliate & reseller program access",
      "Bring your own SendGrid / Twilio / Meta BSP — zero platform fee",
      "Priority support",
    ],
  },
];

// ---------------------------------------------------------------------------
// Lane 2 — Studio & Dubbing
// ---------------------------------------------------------------------------
// The only lane that spends real per-minute money with external providers
// (Replicate, ElevenLabs). Metered in Render Minutes. Every tier is a
// finite, transparent pool with published overage — never "unlimited".

const LANE2 = [
  {
    key: "indie",
    name: "Indie",
    lane: 2,
    tier: 4,
    price_monthly: 99,
    price_yearly: 950,
    tagline: "Per-scene AI video for independent creators.",
    allowance: { ai_credits: 250, render_minutes: 60 },
    limits: { brands: 2, seats: 2, bulk_messages: 1000 },
    features: [
      "60 Render Minutes/month",
      "250 AI credits/month included",
      "Per-scene AI video (Kling / MiniMax)",
      "AI music generation",
      "Movie Maker timeline & scene editor",
      "1080p export",
    ],
    excludes: ["Dubbing workspace", "Lip-sync"],
  },
  {
    key: "studio",
    name: "Studio",
    lane: 2,
    tier: 4,
    price_monthly: 399,
    price_yearly: 3830,
    popular: true,
    tagline: "Full production studio with dubbing.",
    allowance: { ai_credits: 1000, render_minutes: 250 },
    limits: { brands: 5, seats: 5, bulk_messages: 10000 },
    features: [
      "250 Render Minutes/month",
      "1,000 AI credits/month included",
      "Commercial dubbing workspace — 22 languages",
      "Voice-preserving dubbing (tone, timbre, background music retained)",
      "Lip-sync pack",
      "Bring your own provider keys — included free",
      "4K export · priority render queue",
    ],
  },
  {
    key: "dubbing_house",
    name: "Dubbing House",
    lane: 2,
    tier: 4,
    price_monthly: 499,
    price_yearly: 4790,
    tagline: "Built for localisation studios shipping features.",
    allowance: { ai_credits: 1000, render_minutes: 400 },
    limits: { brands: 10, seats: 10, bulk_messages: 10000 },
    features: [
      "400 Render Minutes/month",
      "1,000 AI credits/month included",
      "Full-length feature dubbing (multi-hour source files)",
      "Batch multi-language output in one pass",
      "Glossary & speaker-mapping controls",
      "Lip-sync pack · SRT transcript export",
      "Bring your own provider keys — included free",
      "Priority render queue",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    lane: 2,
    tier: 4,
    price_monthly: 1499,
    price_yearly: 14390,
    sales_assisted: true,
    tagline: "Volume localisation with contracted capacity.",
    allowance: { ai_credits: 4000, render_minutes: 1200 },
    limits: { brands: -1, seats: -1, bulk_messages: -1 },
    features: [
      "1,200 Render Minutes/month — custom volume available",
      "4,000 AI credits/month included",
      "Unlimited brands, seats and clients",
      "Dedicated render worker capacity",
      "Bring your own provider keys — included free",
      "SSO / SAML · audit log export",
      "Custom affiliate commission terms",
      "Invoicing & PO billing · signed DPA",
      "Named account manager · 99.9% uptime SLA",
    ],
  },
];

// ---------------------------------------------------------------------------
// Add-on
// ---------------------------------------------------------------------------

export const BYOK_PLAN = {
  key: "byok",
  name: "BYO Providers",
  lane: 0,
  tier: 4,
  price_monthly: 49,
  price_yearly: 470,
  addon: true,
  tagline: "Use your own Replicate, ElevenLabs and LLM accounts.",
  allowance: { ai_credits: 0, render_minutes: 0 },
  limits: { brands: 1, seats: 1, bulk_messages: 0 },
  features: [
    "Connect your own Replicate / ElevenLabs / LLM keys",
    "Render jobs run on your keys — your provider bills you directly",
    "No Render Minutes consumed on your own keys",
    "Unlocks the dubbing workspace and per-scene AI video",
    "Platform access fee only — no usage markup",
  ],
};

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export const LANE1_PLANS = LANE1;
export const LANE2_PLANS = LANE2;

/** Every purchasable plan, add-on included. */
export const ALL_PLANS = [...LANE1, ...LANE2, BYOK_PLAN];

/** key -> plan */
export const PLAN_BY_KEY = Object.fromEntries(ALL_PLANS.map((p) => [p.key, p]));

/**
 * Tiers that include BYO providers at no extra charge. Anyone else needs
 * the $49 add-on. Mirrored server-side in every submit function's
 * BYOK_ENTITLED_TIERS.
 */
export const BYOK_INCLUDED_TIERS = ["studio", "dubbing_house", "enterprise"];

/** Tiers that unlock the commercial dubbing workspace. */
export const DUBBING_TIERS = ["studio", "dubbing_house", "enterprise", "byok"];

/** Tiers that unlock paid per-scene AI video and AI music. */
export const RENDER_TIERS = ["agency", "indie", "studio", "dubbing_house", "enterprise", "byok"];

export function planFor(subscription) {
  if (!subscription || !["active", "trialing"].includes(subscription.status)) return null;
  return PLAN_BY_KEY[subscription.plan_tier] || null;
}

export function allowanceFor(subscription) {
  const plan = planFor(subscription);
  return plan ? plan.allowance : { ai_credits: 0, render_minutes: 0 };
}

export function yearlySavingsPct(plan) {
  if (!plan?.price_yearly || !plan?.price_monthly) return 0;
  return Math.round(((plan.price_monthly * 12 - plan.price_yearly) / (plan.price_monthly * 12)) * 100);
}

/**
 * What the pricing page is allowed to say about how usage is billed. Kept
 * here so marketing copy and the billing UI cannot describe the model
 * differently. Deliberately describes the units, not the provider costs
 * behind them.
 */
export const BILLING_MODEL = {
  ai_credit: "1 AI credit = 1 AI image, 1 short video scene, or 1 voiceover up to 1,500 characters.",
  render_minute:
    "1 Render Minute = 1 minute of dubbed output. Lip-sync costs 6 Render Minutes per minute, one 5-second AI video scene costs 1, and one generated music track costs 0.25.",
  overage: `Past your monthly allowance, usage bills automatically at $${AI_CREDIT_RETAIL_USD.toFixed(2)} per AI credit and $${RENDER_MINUTE_RETAIL_USD.toFixed(2)} per Render Minute. Nothing hard-stops mid-project.`,
  byok: "Connect your own provider keys and jobs run on your account — those jobs consume no Render Minutes and your provider bills you directly.",
};
