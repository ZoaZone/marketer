import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * generateMediaContent — AI content generation for all media types
 * Supports: caption, ad_copy, email_template, sms_template, hashtag_set,
 *           video_script, video_storyboard, thumbnail, blog_post, whatsapp,
 *           brand_voice, brand_bio, press_release, script
 */
Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, platform, tone, prompt, client_id, website_scan_id } = await req.json();
    if (!type || !prompt) {
      return Response.json({ error: 'type and prompt are required' }, { status: 400 });
    }

    // Optional website scan context
    let context = '';
    if (website_scan_id) {
      try {
        const scans = await base44.entities.WebsiteScan.filter({ id: website_scan_id });
        if (scans.length > 0) {
          const scan = scans[0];
          context = `\n\nBusiness context:\n- Summary: ${scan.business_summary}\n- Services: ${(scan.services_found || []).join(', ')}\n- Keywords: ${(scan.keywords_found || []).join(', ')}\n- Tone: ${scan.tone}`;
        }
      } catch (_) { /* ignore */ }
    }

    const t = tone || 'Professional';
    const p = platform || 'Social Media';

    // The frontend already sends a fully-built prompt for most types.
    // We use it directly — just fall back to internal prompts for legacy calls.
    const isRichPrompt = prompt.length > 80; // frontend sends detailed prompts

    const legacyPrompts: Record<string, string> = {
      caption:          `Create an engaging ${p} caption. Topic: ${prompt}. Tone: ${t}. Include relevant emojis. Make it attention-grabbing. Max 220 chars.${context}`,
      ad_copy:          `Write compelling ad copy for ${p}. Product/Service: ${prompt}. Tone: ${t}. Format:\nHEADLINE: ...\nBODY: ...\nCTA: ...\nHASHTAGS: ...${context}`,
      email_template:   `Write a professional marketing email. Topic: ${prompt}. Platform: ${p}. Tone: ${t}. Format:\nSUBJECT: ...\nPREHEADER: ...\n\nBODY:\n...\n\nCTA BUTTON: ...${context}`,
      sms_template:     `Write a concise SMS (max 160 chars) with a clear CTA. Topic: ${prompt}. Tone: ${t}.${context}`,
      whatsapp:         `Write a WhatsApp broadcast message. Topic: ${prompt}. Tone: ${t}. Max 300 chars. Include emojis and opt-out line.${context}`,
      hashtag_set:      `Generate 30 relevant hashtags for ${p} about: ${prompt}. Group as: broad, niche, branded.${context}`,
      blog_post:        `Write a complete SEO blog post. Topic: ${prompt}. Tone: ${t}.\nInclude: SEO Title, Meta Description, H1/H2/H3, 700-word body, CTA.${context}`,
      video_script:     `Write a video script for ${p}. Topic: ${prompt}. Tone: ${t}.\nFormat: HOOK (0-3s), INTRO, [scenes with timecodes], OUTRO+CTA, CAPTION TEXT.${context}`,
      video_storyboard: `Create a storyboard for a ${p} video. Topic: ${prompt}.\nFor each shot: SHOT N, VISUAL, AUDIO/VO, TEXT OVERLAY, DURATION. Include 6-10 shots.${context}`,
      thumbnail:        `Provide thumbnail design directions for ${p} video. Topic: ${prompt}.\nInclude: CONCEPT, BACKGROUND, TEXT OVERLAY, COLOR PALETTE, EMOTION, FONT STYLE.${context}`,
      brand_voice:      `Create a brand voice guide for: ${prompt}.\nInclude: Personality, Tone of Voice, Words We Use/Avoid, 5 Taglines, Sample Bio, Sample Caption.${context}`,
      brand_bio:        `Write platform bios for "${prompt}".\nProvide: INSTAGRAM BIO, TWITTER/X BIO, LINKEDIN SUMMARY, TIKTOK BIO, YOUTUBE ABOUT.${context}`,
      press_release:    `Write a press release for "${prompt}". Format: FOR IMMEDIATE RELEASE\nHEADLINE:\nSUBHEADLINE:\nBody (3-4 paragraphs)\nQUOTE:\nABOUT:\nCONTACT:${context}`,
      script:           `Write a video script for ${p}. Topic: ${prompt}. Include scene directions and dialogue.${context}`,
    };

    // Use the incoming prompt if it's already detailed (frontend-built), else use legacy
    const finalPrompt = isRichPrompt ? prompt : (legacyPrompts[type] || legacyPrompts.caption);

    // Try Base44 LLM first, fall back to OpenAI
    let result;
    try {
      result = await base44.integrations.Core.InvokeLLM({ prompt: finalPrompt });
    } catch (llmError) {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) throw llmError;
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: finalPrompt }],
        }),
      });
      if (!openaiRes.ok) throw new Error(`OpenAI fallback failed: ${await openaiRes.text()}`);
      const openaiData = await openaiRes.json();
      result = openaiData.choices[0].message.content;
    }

    // Persist to ContentAsset
    let asset;
    try {
      asset = await base44.entities.ContentAsset.create({
        client_id: client_id || '',
        type,
        title: `${type} - ${String(prompt).slice(0, 50)}`,
        content: result,
        platform: p,
        ai_generated: true,
        prompt_used: String(prompt).slice(0, 500),
        status: 'ready',
      });
    } catch (_) { /* non-fatal */ }

    return Response.json(
      { success: true, asset_id: asset?.id, content: result, text: result },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});