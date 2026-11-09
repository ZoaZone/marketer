// assembly.js — the shared FFmpeg-assembly boundary between Lane 1 and
// Lane 2 (see src/utils/lane1.js and src/utils/lane2.js).
//
// Two backend services host "zero marginal provider cost, just CPU"
// routes that both lanes are allowed to reach:
//   1. The render worker (server-render/, Railway) — pure FFmpeg assembly/
//      encoding: mux, concat, caption burn-in, loudnorm, faststart
//      (/lane1-video, /render). Base44's Deno function runtime has no
//      ffmpeg binary, so this has to live on the worker for BOTH lanes —
//      that's by design, not a lane leak.
//   2. The capture worker (server-capture/, Railway, its own deployment/
//      secret) — POST /capture: headless Chromium recording a walkthrough
//      of a caller-supplied URL and uploading it. Same "just CPU" category
//      as (1) even though it's a different service — no paid Replicate/
//      ElevenLabs call happens for a plain /capture job. (The capture
//      worker's separate /app-demo route *does* call those providers for
//      its own narration/music pipeline — that's not exposed here or to
//      Lane 1 at all, only submitCapture/getCaptureStatus are.)
//
// Paid generation — Replicate (Kling/MiniMax, lip-sync) and ElevenLabs (music, dubbing) and
// ElevenLabs (dubbing) — has real per-scene/per-minute cost and is Lane 2
// only; see lane2.js, never re-exported here.
//
// Both lane1.js and lane2.js import from here for these shared calls;
// neither imports the other lane's module.
//
// Deliberately `import` + `export {}` rather than `export { x } from "..."`
// — the latter is a re-export declaration, which eslint.config.js's
// no-restricted-imports lane guard (an ImportDeclaration-only rule) can't
// see through. This file itself isn't guarded (it's the shared, allowed
// middle layer), but lane1.js/lane2.js follow the same pattern so their
// guard actually has something to check.
import {
  submitLane1Video,
  getLane1VideoStatus,
  assembleLane1Video,
  submitRender,
  getRenderStatus,
  submitCapture,
  getCaptureStatus,
} from "./aiClient.js";

export {
  submitLane1Video, getLane1VideoStatus, assembleLane1Video,
  submitRender, getRenderStatus,
  submitCapture, getCaptureStatus,
};
