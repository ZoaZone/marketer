import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
// Must import from base44/shared/ (no underscore): base44/_shared/ silently
// fails to bundle on this platform and the function keeps running stale code.
import { llmText, parseLooseJson } from '../../shared/byokLlm.block.ts';

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(x, 80)).filter(Boolean).slice(0, 15) : []);

/**
 * generatePitchDeck — writes the slide outline + narrative for a pitch deck.
 *
 * Body: { url, description?, services?, keywords?, competitors?, tone?,
 *         audience?, count?, brandBrief? }  (the same input Create Demo uses)
 * Returns: { deckTitle, slides: [{ title, bullets: string[] }] }
 *
 * Text generation goes through the BYOK-first helper (Anthropic, then OpenAI,
 * Base44 InvokeLLM only as a last resort). The .pptx / PDF files themselves
 * are assembled in the browser from the returned slides.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const url = clip(body.url, 500);
    if (!url) return Response.json({ error: 'url is required' }, { status: 400 });

    const count = Math.min(15, Math.max(5, Number(body.count) || 10));
    const audience = clip(body.audience, 40) || 'Investors';

    const prompt = `Create a ${count}-slide pitch deck for ${audience.toLowerCase()}.
Website: ${url}
Business summary: """${clip(body.description, 3000) || 'N/A'}"""
Services: ${list(body.services).join(', ') || 'N/A'}
Keywords: ${list(body.keywords).join(', ') || 'N/A'}
Competitors: ${list(body.competitors).join(', ') || 'N/A'}
Tone: ${clip(body.tone, 60) || 'Professional'}
${body.brandBrief ? `Brand: ${clip(body.brandBrief, 800)}` : ''}

Slide 1 is the title slide: title = company or deck name, bullets = [one-line tagline].
Then cover: problem, solution, product, market size, business model, traction, competition, go-to-market, team, financial ask/closing — adapted to the audience and trimmed or merged to fit exactly ${count} slides.
Each non-title slide: a short title and 3-4 concise bullets (max 14 words each). Do not invent specific numbers; use clearly marked placeholders like [X%] when data is unknown.

Reply with ONLY JSON, no commentary: {"deckTitle": string, "slides": [{"title": string, "bullets": [string]}]}`;

    const text = await llmText(base44, prompt, { tag: 'generatePitchDeck', maxTokens: 3500 });
    const parsed = parseLooseJson(text);

    const slides = (Array.isArray(parsed?.slides) ? parsed.slides : [])
      .map((s: any) => ({
        title: clip(s?.title, 120),
        bullets: (Array.isArray(s?.bullets) ? s.bullets : []).map((b: unknown) => clip(b, 200)).filter(Boolean).slice(0, 6),
      }))
      .filter((s: any) => s.title)
      .slice(0, count);

    if (!slides.length) return Response.json({ error: 'No slides were produced' }, { status: 502 });

    return Response.json({ deckTitle: clip(parsed?.deckTitle, 120) || slides[0].title, slides });
  } catch (error) {
    console.error('[generatePitchDeck] failed:', (error as Error)?.message || error);
    return Response.json({ error: 'Deck generation failed' }, { status: 500 });
  }
}