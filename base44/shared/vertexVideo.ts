import { encode64, googleConfig, googleToken, mediaObject, mediaUrl } from './googleVideoStorage.ts';

export const VERTEX_PREFIX = 'vertex:';
const REGION = 'us-central1'; // Veo inference region; independent of the GCS bucket location.
const MODEL = 'veo-3.1-lite-generate-001';
const modelPath = (project) => `projects/${project}/locations/${REGION}/publishers/google/models/${MODEL}`;
const isOperation = (name, project) => {
  const match = typeof name === 'string' && name.match(new RegExp(`^projects/([a-z0-9-]+)/locations/${REGION}/publishers/google/models/${MODEL}/operations/[a-zA-Z0-9_-]+$`));
  return !!match && (match[1] === project || /^\d+$/.test(match[1]));
};
export const vertexSeconds = (seconds) => Number(seconds) <= 4 ? 4 : Number(seconds) <= 6 ? 6 : 8;

async function vertexRequest(method, body) {
  const { project } = googleConfig();
  const res = await fetch(`https://${REGION}-aiplatform.googleapis.com/v1/${modelPath(project)}:${method}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn(`Vertex Veo ${method} returned ${res.status} ${String(data.error?.status || '').slice(0, 40)}`);
    const reason = ({ 400: 'Google rejected the video settings or input image.', 401: 'Google could not authenticate the video request.', 403: 'Check that Vertex AI is enabled and the service account has access to Veo and the storage bucket.', 404: 'Veo 3.1 Lite is not available to this project in the configured region.', 429: 'Google’s video quota is busy. Try again shortly.' })[res.status];
    throw new Error(reason || 'Google’s video service is temporarily unavailable. Please try again.');
  }
  return data;
}

async function openingFrame(value) {
  if (!value) return undefined;
  let url;
  try { url = new URL(value); } catch { throw new Error('Choose a PNG or JPEG opening frame from the app’s media library or upload one.'); }
  if (url.pathname === '/functions/gcsVideoMedia') {
    const object = await mediaObject(url.searchParams.get('t'));
    const mimeType = object?.match(/\.png$/i) ? 'image/png' : object?.match(/\.jpe?g$/i) ? 'image/jpeg' : null;
    if (object?.startsWith('digital-studio/inputs/') && mimeType) return { gcsUri: `gs://${googleConfig().bucket}/${object}`, mimeType };
  }
  const trusted = (url.hostname === 'media.base44.com' && url.pathname.startsWith('/images/public/')) ||
    (url.hostname === 'base44.app' && /^\/api\/apps\/[a-f0-9]+\/files\//.test(url.pathname)) ||
    (url.hostname === 'replicate.delivery' || url.hostname === 'pbxt.replicate.delivery');
  if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error('Veo needs a PNG or JPEG opening frame hosted in the app’s media storage.');
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
  const mimeType = res.headers.get('Content-Type')?.split(';')[0];
  if (!res.ok || !['image/png', 'image/jpeg'].includes(mimeType) || !res.body) {
    await res.body?.cancel();
    throw new Error('Veo could not read the opening frame. Use a PNG or JPEG image.');
  }
  const limit = 10 * 1024 * 1024;
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value: part } = await reader.read();
    if (done) break;
    total += part.length;
    if (total > limit) { await reader.cancel(); throw new Error('Use an opening frame smaller than 10 MB.'); }
    chunks.push(part);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  return { bytesBase64Encoded: encode64(bytes), mimeType };
}

export async function startVertexVideo(base44, user, spec) {
  const { bucket, project } = googleConfig();
  const image = await openingFrame(spec.imageUrl);
  const output = `digital-studio/veo/${crypto.randomUUID()}/`;
  const result = await vertexRequest('predictLongRunning', {
    instances: [{ prompt: spec.prompt.trim().slice(0, 8000), ...(image ? { image } : {}) }],
    parameters: { storageUri: `gs://${bucket}/${output}`, sampleCount: 1, durationSeconds: vertexSeconds(spec.durationSeconds), aspectRatio: spec.aspectRatio === '9:16' ? '9:16' : '16:9', resolution: '720p', generateAudio: false },
  });
  if (!isOperation(result.name, project)) throw new Error('Google did not return a video job.');
  return base44.asServiceRole.entities.StudioVideoJob.create({ owner_id: user.id, video_id: `${VERTEX_PREFIX}${result.name}`, status: 'queued' });
}

export async function vertexVideoStatus(req, job) {
  const { project, bucket } = googleConfig();
  const operationName = job.video_id.slice(VERTEX_PREFIX.length);
  if (!isOperation(operationName, project)) return { status: 'failed', error: { message: 'Video job not found.' } };
  const result = await vertexRequest('fetchPredictOperation', { operationName });
  if (!result.done) return { status: 'in_progress' };
  const uri = result.response?.videos?.[0]?.gcsUri;
  const prefix = `gs://${bucket}/digital-studio/veo/`;
  if (result.error || typeof uri !== 'string' || !uri.startsWith(prefix)) {
    return { status: 'failed', error: { message: (result.response?.raiMediaFilteredCount || result.error?.code === 3) ? 'Google could not generate this clip from the supplied prompt or image. Try a different prompt or frame.' : 'Google did not return a playable video.' } };
  }
  return { status: 'completed', url: await mediaUrl(req, uri.slice(`gs://${bucket}/`.length)) };
}