# Internal cost model — SERVER SIDE ONLY

**Do not import, copy, restate or paraphrase anything in this file into
`src/`.** Everything under `src/` is compiled into the public browser
bundle and can be read by any user with devtools. The platform margin and
the raw provider costs below are commercially confidential.

Users see two units — **AI Credits** and **Render Minutes** — and the
published weights between them (`src/config/plans.js`). They never see the
dollar cost behind a unit, and they never see the markup.

---

## Platform margin

```
PLATFORM_MARGIN_PCT = 0.25
```

Every job that runs on a **platform-owned** provider key is charged to the
customer at `raw_provider_cost × 1.25`. The 25% is the platform fee /
margin. It is folded into the credit weights below before the number ever
leaves the server, so no response body, error message, log line or UI
string exposes it.

Jobs that run on a **customer-owned (BYOK)** key are charged **zero**
credits — the customer's own provider account bills them directly, and the
platform monetises those users through the BYO Providers access fee
($49/mo, or bundled free into Studio / Dubbing House / Enterprise).

---

## Raw provider costs

Every figure below carries its provenance. Two are unverified and are
deliberately set conservative (high) so the margin cannot go negative if
the real price is worse than assumed. All are overridable by env var so
they can be corrected without a code change.

| Operation | Raw cost | Env override | Provenance |
|---|---|---|---|
| ElevenLabs dubbing, no watermark | **$0.50 / min** | `DUBBING_RATE_USD_PER_MINUTE` | VERIFIED — elevenlabs.io/pricing/api, 2026-08-31. (Watermarked is $0.33/min; we ship unwatermarked for commercial use.) |
| ElevenLabs TTS `eleven_turbo_v2_5` | **$0.05 / 1K chars** | `TTS_RATE_USD_PER_1K_CHARS` | VERIFIED — elevenlabs.io/pricing/api, 2026-08-31 |
| Instrumental music, one run (`music_track`) | **$0.10 / run** | `MUSIC_RATE_USD_PER_RUN` | ESTIMATE for the default provider. VERIFIED $0.10/run for the Replicate `meta/musicgen` fallback (replicate.com/meta/musicgen, 2026-08-31); the ElevenLabs Music default now serves this kind at the same assumed rate. ElevenLabs bills music by generated *length*, not per run, so a flat per-run figure only holds while clips stay short — submitMusic caps one run at 600s. **Confirm the per-minute rate from elevenlabs.io/pricing/api and reweight if a full-length score costs materially more than $0.10.** |
| Vocal song, one run (`music_vocal_track`) | **$0.30 / run** | `MUSIC_VOCAL_RATE_USD_PER_RUN` | UNVERIFIED. Charged for any run that actually produces vocals — ElevenLabs Music with `force_instrumental: false` (the default vocal path), or the opt-in third-party Suno path. Set conservative (high) so the margin cannot go negative on either. **Confirm ElevenLabs' music rate from elevenlabs.io/pricing/api, and — if `SUNO_API_KEY` is ever provisioned — your Suno reseller's per-generation price.** |
| `sync/lipsync-2` | **$3.00 / min** | `LIPSYNC_RATE_USD_PER_MINUTE` | ESTIMATE — sync.so list price is $2.40–3.00/min; Replicate's resale price is not published and could not be read unauthenticated. Set to the top of the range. **Confirm from the Replicate billing dashboard.** |
| Replicate `kwaivgi/kling-v1.6-standard`, 5s clip | **$0.35 / scene** | `VIDEO_RATE_USD_PER_SCENE` | ESTIMATE — Replicate's own comparison blog quoted $0.25–0.90 in Jul-2025; the live model page renders price client-side and is unreadable unauthenticated. **Confirm from the Replicate billing dashboard.** |
| Base44 pooled credit (1 image / short scene) | **$0.04** | `AI_GENERATION_COST_USD` | UNVERIFIED — inherited codebase assumption. Base44 does not publish a per-credit unit cost; its plans bundle message + integration credits into one fee. **Confirm from your own Base44 billing.** |

### The two numbers to confirm

If either estimate is badly wrong the tier margins move materially:

- **Kling per-scene.** At $0.35 the Lane 2 margins below hold. At the top of
  the quoted range ($0.90) an AI video scene costs more than a dubbing
  minute and `ai_video_scene` should be reweighted from 1 RM to 2 RM.
- **Base44 credit cost.** Every Lane 1 margin is computed against $0.04. At
  $0.08 the Lane 1 ladder halves to ~33% gross.

---

## Unit definitions

```
1 Render Minute (RM) ≡ 1 minute of ElevenLabs dubbing
                     = $0.50 raw = $0.625 platform-priced
1 AI Credit          ≡ 1 image / short scene / ≤1500-char voiceover
                     = $0.04 raw = $0.05 platform-priced
```

Weights are `raw_cost / 0.50`, rounded up to absorb price uncertainty:

| Operation | True ratio | Shipped weight |
|---|---|---|
| Dubbing, per minute | 1.00 | **1 RM** |
| Lip-sync, per minute | 6.00 | **6 RM** |
| AI video scene (5s) | 0.70 | **1 RM** (rounded up — absorbs the Kling uncertainty) |
| Music track (instrumental) | 0.20 | **0.25 RM** |
| Music track (vocal song, Suno) | 0.60 | **1 RM** (rounded up — absorbs the unverified Suno rate) |

---

## Retail floors

Overage must never sell below platform-priced cost:

| Unit | Platform-priced cost | Retail | Gross on overage |
|---|---|---|---|
| AI Credit | $0.05 | $0.06 | 17% |
| Render Minute | $0.625 | $0.95 | 34% |

Overage is priced above the effective in-plan rate on purpose — it should
be cheaper to upgrade than to overrun. That is the intended upgrade
pressure, not a penalty, and Terms §7 already covers that consumed usage
is non-refundable.

---

## Tier margins at 100% allowance utilisation

Real-world utilisation runs well below 100%, so these are floor figures.

### Lane 1 (cost = credits × $0.04)

| Plan | Price | Credits | COGS | Gross |
|---|---|---|---|---|
| Creator | $19 | 150 | $6 | **68%** |
| Starter | $49 | 400 | $16 | **67%** |
| Growth | $149 | 1,250 | $50 | **66%** |
| Agency | $399 | 3,500 | $140 | **65%** |

### Lane 2 (cost = RM × $0.50 + credits × $0.04)

| Plan | Price | RM | Credits | COGS | Gross |
|---|---|---|---|---|---|
| Indie | $99 | 60 | 250 | $40 | **60%** |
| Studio | $399 | 250 | 1,000 | $165 | **59%** |
| Dubbing House | $499 | 400 | 1,000 | $240 | **52%** |
| Enterprise | $1,499 | 1,200 | 4,000 | $760 | **49%** |

### What the previous pricing did

For the record, because it is why this was rebuilt. The superseded
allowances were never enforced anywhere in the codebase — no endpoint
consumed credits — so a $19/mo Creator subscriber and a $499/mo Dubbing
House subscriber had identical unlimited access. Had they been enforced,
the ladder inverted: Growth was 19% gross and Agency **10%** gross, i.e.
the more a customer paid, the worse the unit economics got.

---

## Where this is enforced

Credits are debited at **submit** time, from the requested duration or
scene count, before any provider call is made. Charging at submit is what
makes the allowance a real spend ceiling; charging on completion would let
a single multi-hour job run unbounded before anyone counted it.

The cost table is duplicated into each submit function because Base44
function deployments cannot share a local module. That duplication is
verified mechanically by `npm run check:plans`, which fails the build if
any copy drifts — the previous "kept in sync by comment discipline"
approach is what allowed the three price maps to diverge in the first
place.
