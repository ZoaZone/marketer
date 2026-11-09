import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, platform, dimensions, client_id, reference_image_urls } = await req.json();
    if (!prompt) {
      return Response.json({ error: 'prompt is required' }, { status: 400 });
    }

    const enhancedPrompt = `${prompt}${platform ? ` Optimized for ${platform}.` : ''}${dimensions ? ` Dimensions: ${dimensions}.` : ''} High quality, professional marketing image.`;

    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: enhancedPrompt,
      existing_image_urls: reference_image_urls && reference_image_urls.length ? reference_image_urls : undefined,
    });

    // Save to MediaLibraryItem
    const item = await base44.entities.MediaLibraryItem.create({
      client_id: client_id || '',
      title: prompt.slice(0, 60),
      file_url: url,
      file_type: 'image',
      dimensions: dimensions || '',
      ai_generated: true,
    });

    return Response.json({ success: true, file_url: url, item_id: item.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});