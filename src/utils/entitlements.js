// Tiers that entitle a user to bring their own Replicate/ElevenLabs/LLM key
// for Lane-2 jobs: the dedicated BYOK add-on, or any Lane-2 (Movie Maker
// Pro) subscription tier. Lane 1 (Business) tiers never touch a paid
// external provider, so they don't need this. Mirrors the Deno-side copy of
// this same list duplicated in submitVideo/submitMusic/submitDubAudio/
// submitDubVideo's entry.ts (function deployments can't share a frontend
// module, so those stay in sync by comment discipline).
export const BYOK_ENTITLED_TIERS = ["byok", "indie", "studio", "dubbing_house", "enterprise"];

// Same "real, active subscription" test as Billing.jsx's isPaidPlan, plus
// the BYOK-specific tier check.
export function isByokEntitled(subscription) {
  return !!subscription
    && ["active", "trialing"].includes(subscription.status)
    && BYOK_ENTITLED_TIERS.includes(subscription.plan_tier);
}

// Real (Lane 2) motion video for the AI Walkthrough is a paid feature.
// Higher tiers get true generated video; free / low tiers fall back to
// the standard Lane 1 still-image (Ken Burns) walkthrough. Same "real,
// active subscription" test as Billing.jsx's isPaidPlan (any non-free
// tier with an active or trialing subscription).
//
// `isAdmin` is checked FIRST and independently of the subscription, the
// same way every page-level gate and every server-side assertEntitled in
// this codebase treats an admin. The owner's own account has no
// Subscription row at all, so a subscription-only test silently answered
// "not entitled" for them — the admin got the still-image slideshow from
// the Demo Video maker while every other surface correctly gave them full
// access.
export function isRealVideoEntitled(subscription, isAdmin = false) {
  if (isAdmin) return true;
  return !!subscription
  && ["active", "trialing"].includes(subscription.status)
  && subscription.plan_tier
  && subscription.plan_tier !== "free";
}
