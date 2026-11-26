// replicateImage.block.ts — owner's-own-key (Replicate) text-to-image
// generation, as a BYOK alternative to Base44's built-in Core.GenerateImage.
//
// Why this exists
// ---------------
// Base44's native image generation (Core.GenerateImage) draws from the
// workspace's shared "integration credits" pool. When that pool is
// exhausted, every image-generation feature in the app fails at once. The
// platform owner already pays for a Replicate account (used for AI video via
// submitVideo and AI music via generateMusic/submitMusic) — this lets image
// generation draw on that same key instead of depending solely on Base44's
// credits.
//
// Text-to-image only: Flux schnell (the default model) has no reference-
// image / identity-preservation input the way Base44's existing_image_urls
// does, so callers with reference images should skip this helper and call
// Base44's Core.GenerateImage directly.
//
// Lives at base44/shared/ (no underscore) — see byokLlm.block.ts in this
// same directory for why that matters for Base44 Edge Functions.

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollReplicateImagePrediction(prediction: any, token: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let current = prediction;
  while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled') {
    if (Date.now() > deadline) throw new Error('Timed out waiting for Replicate image generation to finish.');
    await sleep(POLL_INTERVAL_MS);
    const pollUrl = current.urls?.get || `https://api.replicate.com/v1/predictions/${current.id}`;
    const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) {
      throw new Error(`Replicate polling failed: ${await pollRes.text().catch(() => pollRes.statusText)}`);
    }
    current = await pollRes.json();
  }
  if (current.status !== 'succeeded') {
    throw new Error(`Replicate generation ${current.status}: ${current.error ? String(current.error) : 'no further detail from the provider'}`);
  }
  return current;
}

/**
 * Generates one image with the owner's own Replicate key and returns its
 * URL. Throws if REPLICATE_API_TOKEN isn't configured or the call fails —
 * callers should catch and fall back to Base44's Core.GenerateImage.
 *
 * REPLICATE_IMAGE_MODEL overrides the model (default: Flux schnell, fast and
 * cheap). Accepts either "owner/model" (resolved via the models endpoint) or
 * "owner/model:versionhash" (resolved via the generic predictions endpoint).
 */
export async function generateImageWithReplicate(prompt: string): Promise<string> {
  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token?.trim()) throw new Error('REPLICATE_API_TOKEN is not configured.');
  const model = Deno.env.get('REPLICATE_IMAGE_MODEL')?.trim() || 'black-forest-labs/flux-schnell';

  const versionHashIndex = model.indexOf(':');
  const hasVersionHash = versionHashIndex !== -1;
  const url = hasVersionHash
    ? 'https://api.replicate.com/v1/predictions'
    : `https://api.replicate.com/v1/models/${model}/predictions`;
  const input = { prompt, output_format: 'png' };
  const body = hasVersionHash ? { version: model.slice(versionHashIndex + 1), input } : { input };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Replicate prediction creation failed: ${await res.text().catch(() => res.statusText)}`);
  }
  const created = await res.json();
  const finished = await pollReplicateImagePrediction(created, token);
  const output = finished.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl || typeof imageUrl !== 'string') throw new Error('Replicate returned no image URL.');
  return imageUrl;
}
