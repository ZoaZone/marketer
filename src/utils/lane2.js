// lane2.js — the Lane 2 (Movie Maker Pro) service boundary.
//
// Lane 2 may use everything Lane 1 can (Base44-native generation, the
// shared FFmpeg-assembly + capture worker routes — see assembly.js) plus
// the paid Replicate/ElevenLabs generation endpoints: per-scene
// Kling/MiniMax video, MusicGen background music, and ElevenLabs dubbing
// (audio/video, including lip-sync). Lane 1 (lane1.js) must never import
// any of the paid-generation exports below — see lane1.js's header
// comment and eslint.config.js's no-restricted-imports guard.
//
// submitCapture/getCaptureStatus moved to assembly.js (shared) — a plain
// /capture job on the capture worker has no paid-provider cost, same
// "just CPU" category as the render worker's FFmpeg routes. Movie Maker's
// "Auto Demo from URL" (which needs this alongside Lane-2-exclusive
// submitRender/generateMusic) still gets them via that import below.
import {
  generateText,
  generateImage,
  uploadFile,
  proxyImageAsObjectUrl,
  generateVoiceover,
  shortenCaption,
  splitScriptIntoScenes,
  probeMediaDuration,
} from "./aiClient.js";

import {
  submitRender,
  getRenderStatus,
  submitCapture,
  getCaptureStatus,
} from "./assembly.js";

// Paid generation — Replicate (Kling/MiniMax video, MusicGen) and
// ElevenLabs (dubbing/lip-sync). Lane 2 only.
import {
  submitVideo,
  getVideoStatus,
  generateSceneVideo,
  submitMusic,
  getMusicStatus,
  generateMusic,
  submitDubAudio,
  submitDubVideo,
  getDubStatus,
  dubAudioFile,
  dubVideoFile,
  probeMediaDuration,
} from "./aiClient.js";

export {
  generateText,
  generateImage,
  uploadFile,
  proxyImageAsObjectUrl,
  generateVoiceover,
  shortenCaption,
  splitScriptIntoScenes,
  submitRender,
  getRenderStatus,
  submitCapture,
  getCaptureStatus,
  submitVideo,
  getVideoStatus,
  generateSceneVideo,
  submitMusic,
  getMusicStatus,
  generateMusic,
  submitDubAudio,
  submitDubVideo,
  getDubStatus,
  dubAudioFile,
  dubVideoFile,
};
