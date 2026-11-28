import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { writeMedia } from '../../shared/googleVideoStorage.ts';

export default async function(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  try {
    const user = await createClientFromRequest(req).auth.me().catch(e => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Please sign in to upload video media.' }, { status: 401 });
    const max = 48 * 1024 * 1024;
    if (Number(req.headers.get('content-length')) > max + 65536) return Response.json({ error: 'Choose a file smaller than 48 MB.' }, { status: 413 });
    const file = (await req.formData().catch(() => null))?.get('file');
    const frame = file instanceof File && ['image/jpeg', 'image/png'].includes(file.type) && /\.(png|jpe?g)$/i.test(file.name);
    const media = file instanceof File && /^(audio\/[\w.+-]+|video\/(mp4|webm))$/.test(file.type);
    if ((!frame && !media) || !file.size || file.size > (frame ? 10 * 1024 * 1024 : max)) return Response.json({ error: 'Choose a valid PNG/JPEG frame, audio track, or MP4/WebM video within the file limit.' }, { status: 400 });
    return Response.json({ url: await writeMedia(req, file, frame ? 'inputs' : 'exports') });
  } catch (e) {
    return Response.json({ error: e.message || 'Could not upload video media.' }, { status: 502 });
  }
}