import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---------------------------------------------------------------------------
// Inlined from base44/_shared/byokLlm.block.ts — Base44 Edge Functions can't
// import relative modules from outside their own directory, so this is
// hand-copied here (same convention as rateLimit.block.ts elsewhere in
// base44/functions). Keep in sync by hand if the shared version changes.
//
// The PlatformAiConfig admin-override step (aiBackend.block.ts's
// tryPlatformBackend) that used to sit between steps 1 and 3 below has been
// removed rather than inlined: it required an explicit admin-created
// PlatformAiConfig row that was never set up, so it always resolved to
// "platform" (a no-op) anyway, and it had the same cross-directory import bug.
// If per-section backend overrides are wanted later, reinstate it as its own
// hand-copied block.
// ---------------------------------------------------------------------------
const BYOK_ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const BYOK_OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

async function byokCallAnthropic(prompt: string, key: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: BYOK_ANTHROPIC_DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.content || []).map((c: any) => c?.text || "").join("").trim();
  if (!text) throw new Error("anthropic returned empty content");
  return text;
}

async function byokCallOpenAi(prompt: string, key: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: BYOK_OPENAI_DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openai ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("openai returned empty content");
  return text;
}

/**
 * Owner's own ANTHROPIC_API_KEY / OPENAI_API_KEY env keys, tried in that
 * order, falling back to Base44's built-in AI (InvokeLLM) only if neither
 * key is set or both calls fail.
 */
async function llmText(db: any, prompt: string, o: { tag?: string; maxTokens?: number } = {}): Promise<string> {
  const tag = o.tag || "llm";
  const maxTokens = o.maxTokens ?? 2048;

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    try {
      return await byokCallAnthropic(prompt, anthropicKey, maxTokens);
    } catch (err) {
      console.error(`[${tag}] anthropic BYOK failed, trying next provider:`, (err as Error)?.message);
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try {
      return await byokCallOpenAi(prompt, openaiKey, maxTokens);
    } catch (err) {
      console.error(`[${tag}] openai BYOK failed, falling back to built-in AI:`, (err as Error)?.message);
    }
  }

  return await db.integrations.Core.InvokeLLM({ prompt });
}

// BYOK (Work Package F): user.settings.api_keys.llm is stored encrypted
// (AES-256-GCM) — this decrypts it in-memory just long enough to make the
// one request below. The plaintext key is never logged, persisted, or
// echoed back to the caller.
async function decryptSecret(stored: { ciphertext: string; iv: string }, keyB64: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const iv = Uint8Array.from(atob(stored.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(stored.ciphertext), (c) => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

/**
 * Calls a user-supplied "bring your own LLM" key (Growth/Agency plans —
 * configured in Account > Integrations). Supports OpenAI, Anthropic, and any
 * OpenAI-compatible custom endpoint. Throws on failure so the caller can fall
 * back to the platform's default providers.
 */
async function callUserLLM(llmRecord: any, prompt: string, encryptionKey: string): Promise<string> {
  const llmProvider = llmRecord.llmProvider || 'anthropic';
  const llmModel = llmRecord.llmModel;
  const llmBaseUrl = llmRecord.llmBaseUrl;
  const llmApiKey = await decryptSecret(llmRecord, encryptionKey);

  if (llmProvider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': llmApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: llmModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic request failed: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  // OpenAI, or any OpenAI-compatible "custom" endpoint
  const baseUrl = llmProvider === 'custom' && llmBaseUrl
    ? llmBaseUrl.replace(/\/$/, '')
    : 'https://api.openai.com/v1';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmApiKey}` },
    body: JSON.stringify({
      model: llmModel || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

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

    const { type, platform, tone, prompt, client_id, website_scan_id, model, section } = await req.json();
    if (!type || !prompt) {
      return Response.json({ error: 'type and prompt are required' }, { status: 400 });
    }

    // Optional website scan context
    let context = '';
    if (website_scan_id) {
      try {
        const scans = await base44.entities.WebsiteScan.filter({ id: website_scan_id, created_by: user.email });
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

    const legacyPrompts = {
  video_script: `Write a professional video script for ${p}. Topic: ${prompt}. Tone: ${t}.
  IMPORTANT:
  1. Correct spelling is mandatory.
  2. Format: [Timecode] [Scene Description] [On-Screen Text Overlay].
  3. Brand Style: ${t}.`,

  video_storyboard: `Create a storyboard for a ${p} video about: ${prompt}.
  IMPORTANT:
  1. BRANDING: Every shot MUST include: "PLACE LOGO IN BOTTOM RIGHT".
  2. TEXT: Verify spelling. DO NOT guess text.
  3. Format: SHOT N, VISUAL, AUDIO, TEXT OVERLAY (verified spelling), LOGO PLACEMENT.`,
  // ... keep the rest of your existing entries
};

    // Use the incoming prompt if it's already detailed (frontend-built), else use legacy
    const finalPrompt = isRichPrompt ? prompt : (legacyPrompts[type] || legacyPrompts.caption);

    // Define the guardrail and apply it to the prompt
    const spellingGuardrail = "\n\nCRITICAL: Double-check all spellings. If you are unsure of the spelling of a word, do not include it. Provide content in a clear, professional brand voice.";
    const finalPromptWithGuardrail = finalPrompt + spellingGuardrail;

    // LLM provider chain:
    //  1. Bring-your-own LLM (Growth/Agency plans, or admin) — if configured in Settings > AI Provider
    //  2. The owner's own ANTHROPIC_API_KEY / OPENAI_API_KEY env keys (llmText,
    //     above) — tried BEFORE Base44's built-in AI so this feature keeps
    //     working the moment the Base44 integration-credit pool runs dry. The
    //     previous chain only had a hardcoded OpenAI-only last resort *after*
    //     Base44's AI (so it never even ran until that call failed) and no
    //     Anthropic fallback at all.
    //  3. Base44's built-in AI (InvokeLLM) — true last resort, spends
    //     integration credits (reached only if no env key is configured).
    let result: string | undefined;

    const apiKeys = user.settings?.api_keys || {};
    const llmRecord = apiKeys.llm; // BYOK (Work Package F): { ciphertext, iv, llmProvider, llmModel?, llmBaseUrl? }
    let planTier = 'starter';
    try {
      const subs = await base44.entities.Subscription.filter({ owner_email: user.email }, '-created_date', 1);
      if (subs[0]?.plan_tier) planTier = subs[0].plan_tier;
    } catch (_) { /* default to starter */ }

    const canUseOwnLLM = (planTier === 'growth' || planTier === 'agency' || user.role === 'admin')
      && !!llmRecord?.ciphertext;

    if (canUseOwnLLM) {
      const encryptionKey = Deno.env.get('BYOK_ENCRYPTION_KEY');
      if (encryptionKey) {
        try {
          result = await callUserLLM(llmRecord, finalPromptWithGuardrail, encryptionKey);
        } catch (_ownLlmError) {
          result = undefined; // fall through to platform defaults
        }
      }
    }

    // If the caller asked for a specific model (account-wide default from
    // Settings, or a per-generation override), honor it via Base44's own
    // model selection first — that's a Base44-specific feature the env-key
    // providers below can't fulfill. `modelFallback` tells the frontend when
    // the requested model wasn't used, so it can show a notice instead of
    // silently swapping models on the user.
    let modelFallback = false;
    if (!result && model) {
      try {
        result = await base44.integrations.Core.InvokeLLM({ prompt: finalPromptWithGuardrail, model });
      } catch (_modelError) {
        result = undefined;
        modelFallback = true;
      }
    }

    // Provider-key chain (Anthropic → OpenAI → Base44 built-in AI). Runs
    // whenever nothing above produced a result — including the common case
    // where no specific model was requested at all, so an env key is tried
    // before Base44's built-in AI rather than only after it fails.
    if (!result) {
      try {
        result = await llmText(base44, finalPromptWithGuardrail, {
          tag: 'generateMediaContent',
          maxTokens: 2048,
        });
      } catch (_e) {
        result = undefined;
      }
    }

    if (!result) {
      throw new Error("Base44 built-in AI is unavailable and no fallback is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to keep this feature running during a credit outage.");
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
      { success: true, asset_id: asset?.id, content: result, text: result, model_fallback: modelFallback },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});