// lane1.js — the Lane 1 (Business/Marketing) service boundary: Quick
// Create, Campaign Studio, Demo Video Maker.
//
// Lane 1 may use Base44-native generation (text, images, voiceover) and
// the shared FFmpeg-assembly + capture worker routes (see assembly.js,
// including submitCapture/getCaptureStatus for Demo Video Maker's
// walkthrough-recording flow) — it must NEVER invoke a paid Replicate or
// ElevenLabs generation endpoint
// (Kling/MiniMax video, ElevenLabs music/dubbing/lip-sync — that's
// Lane 2, see lane2.js). This is enforced two ways:
//   1. This file simply doesn't import those functions from aiClient.js —
//      grep aiClient.js's paid-generation exports (submitVideo,
//      getVideoStatus, generateSceneVideo, submitMusic, getMusicStatus,
//      generateMusic, submitDubAudio, submitDubVideo, getDubStatus,
//      dubAudioFile, dubVideoFile) if you're ever tempted to add one here
//      — don't; add it to lane2.js instead.
//   2. eslint.config.js has a no-restricted-imports rule scoped to this
//      file (and to QuickCreate.jsx/CampaignStudio.jsx/DemoVideoMaker.jsx)
//      that fails the build if any of those names, or "@/utils/lane2"
//      itself, are imported.
import {
  generateText,
  generateImage,
  uploadFile,
  proxyImageAsObjectUrl,
  generateVoiceover,
  shortenCaption,
  splitScriptIntoScenes,
} from "./aiClient.js";

import {
  submitLane1Video,
  getLane1VideoStatus,
  assembleLane1Video,
  submitCapture,
  getCaptureStatus,
} from "./assembly.js";

export {
  generateText,
  generateImage,
  uploadFile,
  proxyImageAsObjectUrl,
  generateVoiceover,
  shortenCaption,
  splitScriptIntoScenes,
  submitLane1Video,
  getLane1VideoStatus,
  assembleLane1Video,
  submitCapture,
  getCaptureStatus,
};
