import { base44 } from '@/api/base44Client';
import { drawFrame } from '@/components/media-editor/drawFrame';
import { makeMediaElement } from '@/components/media-editor/renderProject';

const errorOf = e => e?.response?.data?.error || e?.message || 'AI request failed.';

export async function proofreadText(text) {
  try {
    const { data } = await base44.functions.invoke('generateBase44Studio', { action: 'proofread', prompt: text });
    return (data?.text || text).trim() || text;
  } catch (e) { throw new Error(errorOf(e)); }
}

export async function suggestCopy(brief, size) {
  return base44.integrations.Core.InvokeLLM({
    prompt: `Write short on-screen text for a ${size.w}x${size.h} social video or image. Correct spelling, keep every name and fact from the brief, add no new claims. Each line must be under 60 characters.\n<brief>${brief.slice(0, 800)}</brief>`,
    response_json_schema: { type: 'object', properties: { headline: { type: 'string' }, tagline: { type: 'string' }, cta: { type: 'string' } } },
  });
}

// Grabs a clean frame of a single clip, uploads it, and returns a signed URL
// the AI can read with file_urls. Shared by scanClipFrame and
// writeScriptFromVideo below.
async function captureClipFrame(clip, size) {
  const media = await makeMediaElement(clip.kind, clip.src);
  if (clip.kind === 'video') await new Promise(r => { media.onseeked = r; media.currentTime = clip.trimStart + (clip.trimEnd - clip.trimStart) / 2; setTimeout(r, 800); });
  const canvas = document.createElement('canvas'); canvas.width = size.w; canvas.height = size.h;
  drawFrame(canvas.getContext('2d'), size.w, size.h, { clip, media, layers: [], assets: {} });
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: new File([blob], 'frame.jpg', { type: 'image/jpeg' }) });
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
  return signed_url;
}

// "Describe my video" voice-over mode: actually looks at the uploaded/attached
// footage — samples frames spread across the whole clip order (not just one
// clip) — and asks the AI to write narration that matches what's on screen,
// sized to the timeline's length, instead of guessing from a typed topic.
export async function writeScriptFromVideo(clips, size, seconds) {
  const MAX_FRAMES = 6;
  const indices = clips.length <= MAX_FRAMES
    ? clips.map((_, i) => i)
    : Array.from({ length: MAX_FRAMES }, (_, i) => Math.round(i * (clips.length - 1) / (MAX_FRAMES - 1)));
  const urls = [];
  for (const i of [...new Set(indices)]) {
    try { urls.push(await captureClipFrame(clips[i], size)); }
    catch { /* a frame that fails to capture is skipped — the rest still give useful context */ }
  }
  if (!urls.length) throw new Error('Could not read any frames from your video to describe.');
  const result = await base44.integrations.Core.InvokeLLM({
    file_urls: urls,
    prompt: `These images are frames sampled in order from a video, start to finish. Write natural spoken narration (no scene labels, no stage directions, no quotation marks) describing what is actually happening and shown across these frames, as a voice-over for this video. It should take about ${Math.max(5, Math.round(seconds))} seconds to read aloud at a natural pace. Return only the narration text.`,
    response_json_schema: { type: 'object', properties: { narration: { type: 'string' } } },
  });
  const narration = (result?.narration || '').trim();
  if (!narration) throw new Error('No narration could be written from this video.');
  return narration;
}

// Grabs one clean frame of the clip (no layers) and asks the AI where text or logos look broken.
export async function scanClipFrame(clip, size) {
  const media = await makeMediaElement(clip.kind, clip.src);
  if (clip.kind === 'video') await new Promise(r => { media.onseeked = r; media.currentTime = clip.trimStart + (clip.trimEnd - clip.trimStart) / 2; setTimeout(r, 800); });
  const canvas = document.createElement('canvas'); canvas.width = size.w; canvas.height = size.h;
  drawFrame(canvas.getContext('2d'), size.w, size.h, { clip, media, layers: [], assets: {} });
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: new File([blob], 'frame.jpg', { type: 'image/jpeg' }) });
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
  return base44.integrations.Core.InvokeLLM({
    file_urls: [signed_url],
    prompt: `You are checking a frame from an AI-generated video. Find any lettering, captions, signs, logos or watermarks that look garbled, misspelled, distorted or unwanted. For each, give a region as fractions of the frame (0 to 1): x and y are the CENTER of the region, w and h are its width and height. Also list 2 to 4 short, practical editing tips for this frame (for example where clean text would fit without covering faces). If nothing looks wrong, return an empty regions list.`,
    response_json_schema: { type: 'object', properties: {
      summary: { type: 'string' },
      regions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } } },
      tips: { type: 'array', items: { type: 'string' } },
    } },
  });
}