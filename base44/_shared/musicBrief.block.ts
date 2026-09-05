/* ── Music brief: Base44 InvokeLLM (default) -> OpenAI -> verbatim ─────
 *
 * The provider chain for the AUDIO itself is ElevenLabs/Suno/Replicate —
 * those are the only ones that can render audio at all. Base44's InvokeLLM
 * and OpenAI's chat models produce text, so they cannot be music providers;
 * what they can do, and what this does, is turn the caller's thin request
 * ("Thriller film score, cinematic, matching: <story>") into a specific
 * musical brief — instrumentation, tempo, key, arrangement, production
 * feel — which is exactly the kind of prompt a renderer turns into good
 * audio and the kind a UI form cannot produce on its own.
 *
 * So the music generation path holds, with each stage doing the part it is
 * actually capable of:
 *   1. Base44 InvokeLLM  — the default producer, and what AI Credits buy.
 *   2. OpenAI            — secondary fallback when Base44's AI is unavailable.
 *   3. ElevenLabs/Replicate — renders the brief into audio (see the worker).
 *
 * Deliberately best-effort and NOT separately metered: it is one small
 * prompt-shaping call folded into a music run the caller is already charged
 * for, and double-charging one user action would be worse than absorbing
 * it. Any failure — quota, outage, a malformed response — returns null and
 * the caller's own prompt is used verbatim, so this can only ever improve a
 * generation, never block one. Set MUSIC_BRIEF_LLM=off to skip it entirely.
 *
 * CANONICAL COPY-PASTE BLOCK (same convention as metering.block.ts):
 * keep this byte-identical with the copy embedded in
 * base44/functions/submitMusic/entry.ts and
 * base44/functions/generateMusic/entry.ts. A Base44 function deployment
 * cannot import from another file, so the block is pasted into each entry
 * point — test/musicBrief.test.js loads the submitMusic copy from source
 * and pins this behavior down.
 * ──────────────────────────────────────────────────────────────────── */

const BRIEF_MAX_CHARS = 600;

function buildBriefInstruction(spec: any): string {
  const facets = [
    spec?.genre ? `Genre: ${spec.genre}` : null,
    spec?.mood ? `Mood: ${spec.mood}` : null,
    spec?.durationSeconds ? `Length: about ${spec.durationSeconds} seconds` : null,
    spec?.instrumental === false ? 'This is a sung song with vocals.' : 'Instrumental only — no vocals.',
  ].filter(Boolean).join('\n');

  return [
    'You are writing a prompt for a text-to-music model. Turn the request below into ONE vivid,',
    'concrete paragraph describing the music: instrumentation, tempo/BPM, key or tonality,',
    'arrangement and how it develops, and production feel.',
    '',
    'Rules:',
    `- Under ${BRIEF_MAX_CHARS} characters. Plain prose, no headings, no lists, no preamble.`,
    '- Describe only the music. Do not write lyrics, and do not restate these instructions.',
    '- Never name a real artist, band, or song — text-to-music models reject prompts that do.',
    '',
    facets,
    '',
    `Request: ${spec?.prompt || 'background music'}`,
  ].join('\n');
}

function sanitizeBrief(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < 20) return null; // an empty or one-word reply is not a brief
  return text.replace(/\s+/g, ' ').slice(0, BRIEF_MAX_CHARS);
}

async function composeMusicBrief(base44: any, spec: any): Promise<string | null> {
  if (Deno.env.get('MUSIC_BRIEF_LLM')?.trim().toLowerCase() === 'off') return null;
  if (!spec?.prompt?.trim()) return null;

  const instruction = buildBriefInstruction(spec);

  // 1. Base44 InvokeLLM — the default producer.
  try {
    const result = await base44.integrations.Core.InvokeLLM({ prompt: instruction });
    const brief = sanitizeBrief(result);
    if (brief) return brief;
  } catch (_baseError) { /* fall through to OpenAI */ }

  // 2. OpenAI — secondary fallback when Base44's built-in AI is unavailable.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: instruction }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return sanitizeBrief(data?.choices?.[0]?.message?.content);
  } catch (_openaiError) {
    // 3. Neither LLM answered — the renderer runs the caller's own prompt.
    return null;
  }
}