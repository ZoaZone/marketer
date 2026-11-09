#!/usr/bin/env node
/**
 * Tests for the "help me choose" plan advisor.
 *
 * A recommender that quietly points a dubbing customer at Creator — which
 * the server would then refuse with a 403 — or that quotes a volume the
 * plan cannot cover, does more damage than having no recommender. These
 * assert the two properties that matter: it never recommends a plan the
 * backend would reject, and it never recommends a plan whose allowance the
 * stated volume overruns while claiming it fits.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The component is JSX; pull out just the pure function and the imports it
// needs, so this runs under plain node with no build step.
const src = readFileSync("src/components/PlanAdvisor.jsx", "utf8");
const start = src.indexOf("export function recommendPlan");
const end = src.indexOf("export default function PlanAdvisor");
assert.ok(start !== -1 && end > start, "could not locate recommendPlan");
const fn = src.slice(start, end);

const catalogUrl = pathToFileURL("src/config/plans.js").href;
const mod = await import(
  "data:text/javascript," +
  encodeURIComponent(
    `import { ALL_PLANS, PLAN_BY_KEY, RENDER_MINUTE_WEIGHTS, RENDER_MINUTE_RETAIL_USD, AI_CREDIT_RETAIL_USD, DUBBING_TIERS, RENDER_TIERS } from ${JSON.stringify(catalogUrl)};\n` + fn,
  )
);
const { recommendPlan } = mod;
const catalog = await import(catalogUrl);

let passed = 0;
const t = (name, fn2) => {
  try { fn2(); console.log(`  ok    ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1; }
};

console.log("\nplan advisor");

t("a solo creator posting images lands on the cheapest plan that fits", () => {
  const r = recommendPlan({ output: "social", images: 100 });
  assert.equal(r.pick.key, "creator");
  assert.ok(r.fits);
});

t("more images than Creator covers steps up rather than overrunning", () => {
  const r = recommendPlan({ output: "social", images: 900 });
  assert.equal(r.pick.key, "growth", `got ${r.pick.key}`);
  assert.ok(r.fits);
});

t("NEVER recommends a non-dubbing plan for dubbing", () => {
  // The whole point: these tiers would 403 at submitDubbingProject.
  for (const langs of [1, 3, 10]) {
    for (const mins of [10, 120, 600]) {
      const r = recommendPlan({ output: "dubbing", dubMinutes: mins, languages: langs, images: 0 });
      assert.ok(
        catalog.DUBBING_TIERS.includes(r.pick.key),
        `dubbing ${mins}min x${langs} recommended ${r.pick.key}, which cannot dub`,
      );
    }
  }
});

t("NEVER recommends a non-render plan for per-scene AI video", () => {
  for (const scenes of [1, 50, 400]) {
    const r = recommendPlan({ output: "aivideo", scenes, images: 0 });
    assert.ok(
      catalog.RENDER_TIERS.includes(r.pick.key),
      `${scenes} scenes recommended ${r.pick.key}, which cannot render video`,
    );
  }
});

t("light dubbing gets Studio, not the pricier Dubbing House", () => {
  // 60 min x 1 language = 60 RM; Studio's 250 covers it and is cheaper.
  const r = recommendPlan({ output: "dubbing", dubMinutes: 60, languages: 1, images: 0 });
  assert.equal(r.pick.key, "studio", `got ${r.pick.key}`);
  assert.ok(r.fits);
});

t("a feature dubbed into 3 languages steps up to Dubbing House", () => {
  // 90 x 3 = 270 RM, past Studio's 250.
  const r = recommendPlan({ output: "dubbing", dubMinutes: 90, languages: 3, images: 0 });
  assert.equal(r.rm, 270);
  assert.equal(r.pick.key, "dubbing_house", `got ${r.pick.key}`);
  assert.ok(r.fits);
});

t("lip-sync is charged at 6x and moves the recommendation", () => {
  const without = recommendPlan({ output: "dubbing", dubMinutes: 60, languages: 1, images: 0 });
  const with_ = recommendPlan({ output: "dubbing", dubMinutes: 60, languages: 1, lipSync: true, images: 0 });
  assert.equal(with_.rm, without.rm * 7, "1x dub + 6x lipsync");
  assert.ok(with_.pick.price_monthly > without.pick.price_monthly, "should step up");
});

t("volume beyond every plan is flagged honestly, not sold a plan that overruns", () => {
  const r = recommendPlan({ output: "dubbing", dubMinutes: 1200, languages: 10, images: 0 });
  assert.equal(r.fits, false, "must not claim it fits");
  assert.ok(r.overageUsd > 0, "must quote the overage");
  assert.equal(r.pick.key, "enterprise", "should land on the largest plan");
});

t("whatever it recommends as fitting genuinely covers the volume", () => {
  // Property test across the grid: if fits === true, the allowance must
  // actually cover both meters. This is the claim that would embarrass us.
  for (const output of ["social", "shortvid", "aivideo", "dubbing"]) {
    for (const images of [0, 200, 1200, 3600]) {
      for (const scenes of [0, 40, 300]) {
        for (const dubMinutes of [0, 60, 400]) {
          for (const languages of [1, 4]) {
            const r = recommendPlan({ output, images, scenes, dubMinutes, languages });
            if (!r.fits) continue;
            assert.ok(
              r.pick.allowance.render_minutes >= r.rm,
              `${r.pick.key} claims to fit ${r.rm} RM but includes ${r.pick.allowance.render_minutes}`,
            );
            assert.ok(
              r.pick.allowance.ai_credits >= r.credits,
              `${r.pick.key} claims to fit ${r.credits} credits but includes ${r.pick.allowance.ai_credits}`,
            );
          }
        }
      }
    }
  }
});

t("it recommends the CHEAPEST plan that fits, never an upsell", () => {
  for (const output of ["social", "aivideo", "dubbing"]) {
    for (const images of [0, 500]) {
      for (const dubMinutes of [0, 120]) {
        const r = recommendPlan({ output, images, dubMinutes, scenes: 30, languages: 2 });
        if (!r.fits) continue;
        const cheaper = r.eligible.filter(
          (p) => p.price_monthly < r.pick.price_monthly
            && p.allowance.render_minutes >= r.rm
            && p.allowance.ai_credits >= r.credits,
        );
        assert.equal(cheaper.length, 0, `${r.pick.key} chosen over cheaper ${cheaper.map(c => c.key)}`);
      }
    }
  }
});

t("an agency with many brands is not sent to a single-brand plan", () => {
  const r = recommendPlan({ output: "social", images: 200, brands: 8 });
  assert.ok(r.pick.limits.brands === -1 || r.pick.limits.brands >= 8, `got ${r.pick.key}`);
});

console.log(`\n${passed} advisor checks passed.\n`);
