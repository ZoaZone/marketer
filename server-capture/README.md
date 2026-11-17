# studio-capture-worker

Standalone Node + Playwright service that records a video walkthrough of a
public website and uploads it as an MP4, for use as a video source in Movie
Maker. Completely independent of the main Vite app and of `server-render/` —
deployed separately, as its own service.

**Phase 1: public pages, no login.** Every navigation is confined to the
target URL's origin, forms are never submitted, downloads are always
cancelled, cookie banners are only ever declined (never accepted), and any
page that appears to require a login aborts the whole capture with a
`login_required` status.

**Phase 2 (optional): authenticated capture.** A caller may supply
credentials for the worker to log in with before the walkthrough — see
"Authenticated capture (Phase 2)" below for the full security model
(encryption, network sandboxing, rate limiting, generic failure messages).
This is strictly opt-in per request; a request with no `credentials` behaves
exactly as Phase 1 always has.

## Deploying on Railway

1. Create a new Railway service from this repo.
2. Set the service's **root directory** to `server-capture`. Railway will
   detect the `Dockerfile` there and build it directly — Chromium and ffmpeg
   are both installed in the image, no separate buildpack config needed.
3. Set the required environment variables (below) in the Railway service's
   **Variables** tab. Don't commit any of these — they're secrets.
4. Once deployed, confirm it's up with `GET /health` → `{ "ok": true }`.

## Required environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on. Railway sets this automatically; defaults to `8080` if unset. |
| `CAPTURE_SHARED_SECRET` | Required. Every `/capture` and `/captures/:id` request must send this in the `x-capture-secret` header, or it's rejected. The service refuses to start at all if this isn't set. |
| `TARGET_BASE_URL` | Optional, defaults to `https://digitalstudios.app`. Fallback capture target when a `/capture` request omits `url` — real callers (Movie Maker's "Auto Demo from URL") always send an explicit `url`, so this only matters for a bare/health-check-style call. |
| `BASE44_UPLOAD_URL` | The Base44 `uploadRenderResult` function's URL — the same one `server-render/` posts finished MP4s to. This worker reuses it as-is rather than a capture-specific upload function; it just forwards a `file` field. |
| `BASE44_UPLOAD_TOKEN` | Sent as `Authorization: Bearer <token>` on that upload request. **Must be set to the same value as `server-render`'s Base44-side `RENDER_SHARED_SECRET`** — `uploadRenderResult` checks the bearer token against that specific env var name (it has no capture-specific equivalent), so this isn't a secret you invent fresh for this service; it's whatever's already configured as `RENDER_SHARED_SECRET` on the Base44 side. |
| `CAPTURE_MAX_SECONDS` | Optional, defaults to `60`. Hard cap on a single capture's total walkthrough time — once reached, the worker stops executing further plan steps and finalizes whatever was recorded so far (a shorter, still-valid video), rather than running indefinitely. |
| `CAPTURE_CREDENTIAL_ENCRYPTION_KEY` | Required only for Phase 2 (authenticated capture). A 32-byte AES-256 key, base64-encoded (e.g. `openssl rand -base64 32`). Without it, any `/capture` request that includes `credentials` is rejected with `503` — the worker never falls back to holding credentials unencrypted. See "Authenticated capture (Phase 2)" below. |
| `CAPTURE_RATE_LIMIT_PER_MINUTE` | Optional, defaults to `5`. Max `/capture` requests accepted per user id per rolling 60s window (applies to every capture, authenticated or not); further requests get `429`. |
| `CAPTURE_MAX_CONCURRENT_PER_USER` | Optional, defaults to `1`. Max queued+processing captures a single user id may have at once; a request over the cap gets `429`. |
| `CAPTURE_LIVE_SESSION_MAX_SECONDS` | Optional, defaults to `360` (6 minutes). How long a Phase 3 live-login session (see below) may stay open before it's force-closed and its concurrency slot freed, in case the caller abandons it mid-login. |

### Voiceover / music generation env vars

`POST /capture` still only records and uploads a silent walkthrough video —
Auto Demo from URL's voiceover/music steps still run client-side through
`server-render/` (`src/hooks/use-auto-demo-from-url.js`), unchanged.

`POST /app-demo` (the scripted digitalstudios.app walkthrough — see
`capture.js`'s `runAppDemoWalkthrough`) is different: it generates its own
per-step narration and background music and muxes them onto the recording
before uploading, reusing `server-render`'s exact provider integrations —
same env var names, not capture-specific duplicates:

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Required for `/app-demo`. Same key `server-render` uses for dubbing; here it drives plain text-to-speech for each step's narration. |
| `ELEVENLABS_VOICE_ID` | Optional, defaults to ElevenLabs' "Rachel" sample voice (`21m00Tcm4TlvDq8ikWAM`). |
| `REPLICATE_API_TOKEN` | Required for `/app-demo`'s background music. Same token `server-render`'s `/music` route uses. |
| `REPLICATE_MUSIC_MODEL` | Optional, defaults to `meta/musicgen`, same as `server-render`. |

If `/app-demo`'s music generation fails, the job still finishes with
voiceover-only audio (best-effort) rather than failing outright — voiceover
itself is required, since a narrated demo with no narration defeats the
point. No text overlay is burned into the video by any of this.

## API

- `GET /health` — `{ ok: true }`. No auth required.
- `POST /capture` — body `{ url, plan?, credentials?, userId? }`. Requires `x-capture-secret`.
  - `url` (required): the page to capture. Must be an absolute `http(s)` URL.
  - `userId` (optional but expected in practice): an opaque identifier used only for the rate limit and concurrency cap below (see "Authenticated capture (Phase 2)" for what sets this in practice). Requests with no `userId` share a single `"anonymous"` bucket.
  - `plan` (optional): an ordered array of steps, each
    `{ action: "goto" | "scroll" | "click" | "wait", selector?, ms?, url? }`.
    - `goto` — navigates to `url` if given, otherwise back to the original
      target URL (used for "return to home" steps). Refused if `url` isn't
      on the same origin as the capture.
    - `click` — clicks `selector`. Refused (silently skipped, not fatal) if
      the element resolves to an off-origin link or a form-submit control.
    - `scroll` — scrolls down by one viewport height.
    - `wait` — pauses for `ms` (clamped to 5000ms max per step).
    - If `plan` is omitted, a simple walkthrough is auto-generated: goto the
      URL, wait for load, scroll through the page in 5 increments, then
      visit up to 3 same-origin top-nav links (discovered from `header a`,
      `nav a`, `[role="navigation"] a`), returning to the original URL
      between each.
  - `credentials` (optional, Phase 2): `{ loginUrl?, usernameField?, passwordField?, submitSelector?, successSelector?, username, password }` — see "Authenticated capture (Phase 2)" below. `password` is required if `credentials` is present at all.
  - Returns `202 { captureId }` immediately; the capture runs asynchronously,
    one job at a time (headless Chromium + video recording is heavy — this
    worker never runs two captures concurrently).
  - `429` if the caller's `userId` has hit `CAPTURE_RATE_LIMIT_PER_MINUTE` or already has `CAPTURE_MAX_CONCURRENT_PER_USER` captures queued/processing. `503` if `credentials` was given but `CAPTURE_CREDENTIAL_ENCRYPTION_KEY` isn't configured.
- `GET /captures/:id` — requires `x-capture-secret`. Returns:
  ```json
  {
    "captureId": "...",
    "status": "queued | processing | done | error | login_required | login_failed",
    "stepIndex": 3,
    "stepTotal": 9,
    "percent": 45,
    "videoUrl": null,
    "durationSeconds": null,
    "pageInfo": null,
    "hasCredentials": false,
    "error": null,
    "createdAt": 1731000000000
  }
  ```
  `videoUrl`, `durationSeconds` (the finished MP4's actual length, via
  ffprobe), and `pageInfo` (`{ title, description, headings: string[] }`,
  extracted from the live page right after the initial navigation — meant
  for a caller that wants to auto-write a narration script from the
  captured page without loading it a second time) are all populated once
  `status` is `"done"`. `stepIndex`/`stepTotal` track progress through the
  resolved plan (custom or auto-generated) and are `null` until the job
  starts executing steps. `hasCredentials` is a safe boolean (never the
  credentials themselves) reflecting whether this job used Phase 2 login.
  `status: "login_required"` means the target page needed a login and none
  was given; `status: "login_failed"` means credentials were given but
  didn't work (generic — never says which field or why, never echoes
  anything from `credentials`). Either way no video is produced or
  uploaded for that job. Finished job records (`done`/`error`/
  `login_required`/`login_failed`) are deleted an hour after completion —
  this includes `encryptedCredentials`, which is deleted from the job the
  instant the job finishes processing, not just at the 1-hour cleanup (see
  below); it's also never present in this response to begin with, response
  fields are listed explicitly rather than built by spreading the job
  record, specifically so a field like that can't leak into it by accident.

The Base44 proxy functions in front of this worker are `submitCapture` and
`getCaptureStatus` (`base44/functions/submitCapture/entry.ts`,
`base44/functions/getCaptureStatus/entry.ts`) — they mirror
`submitVideo`/`getRenderStatus`'s shape and are what the frontend actually
calls; `submitCapture` also stamps the caller's server-verified Base44 user
id onto the request as `userId`, so the rate limit/concurrency cap above are
keyed by a real identity rather than anything a client could spoof.

## Phase 3: live login capture (no credentials collected at all)

An alternative to Phase 2 for sites that use OTP/magic-link/SSO auth (where
`performLogin` can't work at all) or where the caller would rather not type
a password into this app's UI even when it could. The caller drives a real,
server-hosted browser themselves — seeing it as polled JPEG frames and
controlling it via relayed clicks/keystrokes/scroll — to log into their own
site exactly as they would in their own browser tab. No username, password,
or other credential is ever typed into, sent to, or stored by this app at
any point in this flow; the worker only relays *where* the caller's own
input lands on the real page.

- `POST /live/start` — requires `x-capture-secret` (server-to-server only,
  called by the Base44 `startLiveCapture` proxy). Body `{ url, userId? }`.
  Launches a plain (unrecorded) headless browser context, navigates to
  `url`, and returns `201 { sessionId, token, expiresInSeconds }`. Subject
  to the same `checkRateLimit`/`claimConcurrencySlot` as `/capture` — a
  live session spends the same per-user concurrency budget a queued capture
  would, for as long as it's open.
- `GET /live/:id/frame?token=...` — no shared secret; instead requires the
  session's own `token` (minted fresh per session, never CAPTURE_SHARED_SECRET
  itself) as a query param, `x-live-token` header, or body field. Returns a
  single JPEG screenshot of the live page's current state. Meant to be
  polled directly from the browser (a few times a second) and shown as a
  plain `<img>` — no WebSocket or extra client library needed.
- `POST /live/:id/input` — same token auth as `/frame`. Body
  `{ type: "click"|"dblclick"|"move"|"scroll"|"type"|"key"|"goto"|"back"|"forward", ... }`
  — translated 1:1 into the equivalent Playwright action on the live page
  (`capture.js`'s `sendLiveInput`). Deliberately **not** origin-restricted
  the way Phase 2 is: the caller is driving their own normal browsing,
  which may legitimately cross into an SSO/IdP origin (e.g. "Sign in with
  Google"), and nothing here ever reads a field's value back, so there's no
  credential-interception surface to sandbox against.
- `POST /live/:id/cancel` — either `x-capture-secret` or the session's
  `token` closes the session early (abandoned tab, explicit Cancel click),
  freeing its browser and concurrency slot immediately instead of waiting
  out `CAPTURE_LIVE_SESSION_MAX_SECONDS`.
- `POST /live/:id/finish` — requires `x-capture-secret` (the Base44
  `finishLiveCapture` proxy) **and** the session's `token`. Body
  `{ token, plan? }`. Exports the now-authenticated session's
  `storageState` (cookies + localStorage — never a password, since none was
  ever collected), closes the live browser, and queues a `"liveHandoff"`
  job on the *same* job store/queue/`GET /captures/:id` contract every
  other capture uses (`capture.js`'s `runLiveHandoffCapture`: a fresh,
  **recorded** browser context seeded with that `storageState`, running the
  normal walkthrough/record/upload pipeline). Returns `202 { captureId }`
  — the frontend's existing `getCaptureStatus` polling loop works against
  it completely unchanged. If the carried-over session doesn't actually
  look logged in on the fresh context (an essential cookie didn't survive,
  or the session had since expired), the job reports `status:
  "login_required"` rather than `"login_failed"` — there was no password to
  get wrong, so "failed login" would be the wrong word for it.

The Base44 proxy functions for this flow are `startLiveCapture`,
`finishLiveCapture`, and `cancelLiveCapture`
(`base44/functions/{start,finish,cancel}LiveCapture/entry.ts`).
`startLiveCapture` is the only one that hands the frontend anything to call
directly (without going back through a Base44 function first): it returns
`frameUrl`/`inputUrl`/`cancelUrl` with the session's own `token` already
built in, so the high-frequency frame-polling and input calls hit this
worker's public URL directly — `CAPTURE_SHARED_SECRET` itself never leaves
the Base44 function layer.

## Authenticated capture (Phase 2)

Optional, off by default, and only ever used for one job at a time.

**Data flow.** The client collects `credentials` behind an explicit consent
checkbox (see `src/pages/MovieMaker.jsx`'s "Auto Demo from URL" card and
`src/hooks/use-auto-demo-from-url.js`, which enforces the same gate again
independently of the UI) and sends it once, over HTTPS, through the
`submitCapture` Base44 function (which does not log or store it) to this
worker's `POST /capture`. The instant the worker receives it
(`index.js`'s `/capture` handler), it's encrypted with AES-256-GCM
(`credentials.js`) and only the ciphertext envelope
(`{ iv, authTag, ciphertext }`) is kept on the queued job record — the
plaintext reference is dropped right there. If the job has to wait its turn
in the queue, only that ciphertext sits in memory. Immediately before the
login step runs (`index.js`'s `processQueue`, just before calling
`runCapture`), the envelope is decrypted into a local variable, passed to
`runCapture`/`performLogin` (`capture.js`) by value, and — in a `finally`
block that runs whether the job succeeded, failed, or threw — the decrypted
object's fields are overwritten in place and the job's
`encryptedCredentials` is deleted, so it can never be decrypted a second
time. Note on "zeroing": Node/V8 gives no hard guarantee that a JS string's
backing memory gets overwritten (unlike a `Buffer`, where `.fill(0)`
genuinely does) — the zeroing here closes the window during which the
plaintext is reachable from code, which is the realistic, best-effort
version of this guarantee in a JS runtime, not a claim that no trace could
ever exist anywhere in the process's memory at any instant.

**Login execution & verification.** `performLogin` in `capture.js`
navigates to `credentials.loginUrl` (or the target URL if omitted), fills
`passwordField` (default `input[type="password"]`) and, if present,
`usernameField` (default: the first visible email/username-shaped input),
then either clicks `submitSelector` or presses Enter in the password field.
Success is verified via `successSelector` if given, otherwise by checking
the page no longer looks like a login page (no visible password field, no
login-shaped URL — the same heuristic Phase 1 uses to detect a login wall
in the first place, just inverted). On any failure — wrong credentials, a
selector that doesn't match, a timeout — the worker returns a generic
`login_failed` status; it never surfaces which step failed or anything
from `credentials`.

**Network sandboxing.** Only while `credentials` were supplied, the
browser context's egress is restricted (via Playwright request
interception, `context.route`) to exactly the target's origin plus the
login page's origin (if different) — every other request (CDNs, fonts,
analytics, ad scripts, anything) is aborted outright. This is specifically
to limit where a real password could end up being exposed to; it is not
applied to ordinary Phase 1 captures, and it can make a real site render
with missing assets — an accepted tradeoff, since this only activates for
an explicit, consented, credentialed capture.

**Rate limiting & concurrency.** See `CAPTURE_RATE_LIMIT_PER_MINUTE` and
`CAPTURE_MAX_CONCURRENT_PER_USER` above — applied to every capture
(authenticated or not), keyed by the Base44-verified `userId` the
`submitCapture` proxy stamps onto the request.

**Tests.** `server-capture/test/` (`npm test`, Node's built-in
`node:test`) covers the encryption round-trip, GCM tamper-detection,
zeroing, and — the property this whole design exists for — that neither a
`GET /captures/:id`-shaped response nor a `console.log` line built the way
this worker actually builds them can ever contain a plaintext credential
value.

## Recording details

- Chromium is launched headless via Playwright, with a 1920x1080 viewport
  and context-level video recording (`recordVideo`) at the same resolution.
- The recorded `.webm` is converted to MP4 (`libx264`, `yuv420p`, `+faststart`)
  via ffmpeg before upload — Movie Maker expects MP4 sources.
- Logs never include full page content, and any URL logged has its query
  string and hash stripped first (`redactUrl` in `capture.js`) — including
  URLs that show up embedded inside Playwright error messages. This applies
  to *logs* only; the structured job/API data returned from `/captures/:id`
  (e.g. a custom plan's own `url` fields) is not redacted.
