import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Please sign in to generate media.' }, { status: 401 });
    const { action, prompt, aspectRatio = '16:9', duration = 6, audio = false, referenceImageUrls = [] } = await req.json();
    if (!['expand', 'image', 'video'].includes(action) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) {
      return Response.json({ error: 'Choose image or video and enter a description of up to 8,000 characters.' }, { status: 400 });
    }
    if (action === 'expand') {
      const text = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Expand this creative brief into a vivid, specific media generation prompt. Preserve the user's subject and intent. Return only 2–3 sentences, no preamble:\n${prompt.trim()}`,
      });
      return Response.json({ text });
    }
    if (action === 'video' && (!['16:9', '9:16'].includes(aspectRatio) || ![4, 6, 8].includes(duration) || typeof audio !== 'boolean')) {
      return Response.json({ error: 'Base44 video supports 4, 6 or 8 seconds in 16:9 or 9:16.' }, { status: 400 });
    }
    if (action === 'image' && !['1:1', '16:9', '9:16', '4:5'].includes(aspectRatio)) {
      return Response.json({ error: 'Select a supported image format.' }, { status: 400 });
    }
    if (!Array.isArray(referenceImageUrls) || referenceImageUrls.length > 6 || referenceImageUrls.some(url => typeof url !== 'string' || !url.startsWith('https://'))) {
      return Response.json({ error: 'Use up to six HTTPS reference images.' }, { status: 400 });
    }
    // This isolated path uses only managed Core integrations. No BYOK,
    // provider secrets, external render worker, or provider fallback.
    const result = action === 'video'
      ? await base44.asServiceRole.integrations.Core.GenerateVideo({
          prompt: prompt.trim(), duration, aspect_ratio: aspectRatio, generate_audio: audio,
        })
      : await base44.asServiceRole.integrations.Core.GenerateImage({
          prompt: `${prompt.trim()}\nCompose the image for ${aspectRatio} framing.`,
          ...(referenceImageUrls.length ? { existing_image_urls: referenceImageUrls } : {}),
        });
    const url = result?.url || result?.file_url;
    if (!url) throw new Error('Base44 did not return a media file. Please try again.');
    return Response.json({ url, type: action });
  } catch (error) {
    return Response.json({ error: error?.message || 'Base44 generation failed.' }, { status: 500 });
  }
}