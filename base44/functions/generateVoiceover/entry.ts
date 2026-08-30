import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * generateVoiceover — server-side TTS proxy.
 *
 * This handler preserves the existing frontend contract while switching the
 * audio generation backend to ElevenLabs. It accepts a JSON body with text,
 * lang, and an optional voiceId, then renders the narration in ~2500-character
 * chunks so longer scenes can be converted without the earlier Google TTS
 * limits.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_CHARS = 20000;
const CHUNK_CHARS = 2500;
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
// eleven_turbo_v2_5 reads more naturally (better prosody) and generates
// faster than eleven_multilingual_v2, at a small quality tradeoff on some
// non-English languages — still overridable via ELEVENLABS_MODEL_ID.
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';
// Baseline voice delivery. Lower stability + a non-zero `style` value lets
// the model vary intonation instead of reading in a flat monotone; raised
// similarity_boost keeps it close to the source voice despite that added
// expressiveness. `stability` and `style` can be overridden per request
// (see voiceSettings below); similarity_boost/use_speaker_boost are not
// exposed per-call since they rarely need tuning per narration.
const DEFAULT_VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };
// Note: ElevenLabs has no direct `speaking_rate`/speed parameter on this
// endpoint today — pacing is controlled by `stability`/`style` and by the
// text itself (punctuation, sentence length). If ElevenLabs adds a speed
// control to the TTS API later, it would go here alongside voice_settings.

function chunkText(text: string, maxLen = CHUNK_CHARS): string[] {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) return [];

  const sentences = normalizedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence) continue;

    if (sentence.length > maxLen) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }

      const words = sentence.split(/\s+/);
      let longChunk = '';
      for (const word of words) {
        const candidate = longChunk ? `${longChunk} ${word}` : word;
        if (candidate.length > maxLen && longChunk) {
          chunks.push(longChunk.trim());
          longChunk = word;
        } else {
          longChunk = candidate;
        }
      }
      if (longChunk.trim()) {
        current = longChunk.trim();
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// COST GATE. ElevenLabs TTS bills per character against the platform key. Every paid plan lists voiceover, so this allows any active subscription and blocks only tier-less/free accounts.
// Added because this endpoint authenticated the caller but never checked what
// their plan actually included — any signed-in user could bill the platform.
const VOICEOVER_ENTITLED_TIERS = ["creator","starter","growth","agency","indie","studio","dubbing_house","enterprise","byok"];
async function assertEntitled(base44: any, user: any): Promise<Response | null> {
  if (user.role === 'admin') return null;
  const subs = await base44.asServiceRole.entities.Subscription.filter({ owner_email: user.email }).catch(() => []);
  const sub = subs?.[0];
  const ok = !!sub && ['active', 'trialing'].includes(sub.status) && VOICEOVER_ENTITLED_TIERS.includes(sub.plan_tier);
  if (ok) return null;
  return Response.json(
    { error: 'Your plan does not include AI voiceover.', code: 'upgrade_required', required_tiers: VOICEOVER_ENTITLED_TIERS },
    { status: 403, headers: CORS },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const denied = await assertEntitled(base44, user);
    if (denied) return denied;

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey?.trim()) {
      return Response.json({ error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 500, headers: CORS });
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      lang?: string;
      voiceId?: string;
      stability?: number;
      style?: number;
    };
    const text = body.text?.trim() ?? '';
    if (!text) return Response.json({ error: 'text is required' }, { status: 400, headers: CORS });

    const limitedText = text.slice(0, MAX_CHARS);
    // Chunks are requested one at a time below, each a separate ElevenLabs
    // call — the brief gap between chunk boundaries already reads as a
    // natural pause once concatenated, so no extra silence needs to be
    // inserted between them at the audio level.
    const chunks = chunkText(limitedText, CHUNK_CHARS);
    if (!chunks.length) return Response.json({ error: 'No speakable text.' }, { status: 400, headers: CORS });

    const voiceId = body.voiceId?.trim() || Deno.env.get('ELEVENLABS_DEFAULT_VOICE_ID')?.trim() || DEFAULT_VOICE_ID;
    const modelId = Deno.env.get('ELEVENLABS_MODEL_ID')?.trim() || DEFAULT_MODEL_ID;
    const voiceSettings = {
      ...DEFAULT_VOICE_SETTINGS,
      stability: typeof body.stability === 'number' ? body.stability : DEFAULT_VOICE_SETTINGS.stability,
      style: typeof body.style === 'number' ? body.style : DEFAULT_VOICE_SETTINGS.style,
    };

    const parts: Uint8Array[] = [];
    for (const chunk of chunks) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: chunk,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      });

      if (!response.ok) {
        let detail = `${response.status} ${response.statusText}`;
        try {
          const errorText = await response.text();
          if (errorText) detail = errorText;
        } catch {
          // Fall back to the status line if the error body cannot be read.
        }
        throw new Error(`ElevenLabs TTS failed for a chunk: ${detail}`);
      }

      const audioBytes = new Uint8Array(await response.arrayBuffer());
      if (audioBytes.byteLength) parts.push(audioBytes);
    }

    const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    return Response.json(
      { success: true, audio_base64: toBase64(merged), mime: 'audio/mpeg' },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
