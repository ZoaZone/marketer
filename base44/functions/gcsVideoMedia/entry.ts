import { googleConfig, googleToken, mediaObject } from '../../shared/googleVideoStorage.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges' };

export default async function(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!['GET', 'HEAD'].includes(req.method)) return new Response(null, { status: 405, headers: cors });
  const object = await mediaObject(new URL(req.url).searchParams.get('t'));
  if (!object) return new Response('Media not found.', { status: 404, headers: cors });
  try {
    const range = req.headers.get('Range');
    if (range && !/^bytes=\d*-\d*$/.test(range)) return new Response(null, { status: 416, headers: cors });
    const { bucket } = googleConfig();
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`, {
      method: req.method, headers: { Authorization: `Bearer ${await googleToken()}`, ...(range ? { Range: range } : {}) }, signal: AbortSignal.timeout(180000),
    });
    const headers = new Headers(cors);
    for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      if (res.headers.has(name)) headers.set(name, res.headers.get(name));
    }
    if (res.status === 416) { await res.body?.cancel(); headers.delete('Content-Length'); return new Response(null, { status: 416, headers }); }
    if (!res.ok) { await res.body?.cancel(); return new Response(null, { status: res.status === 404 ? 404 : 502, headers: cors }); }
    const mime = res.headers.get('Content-Type') || '';
    headers.set('Content-Type', /^(video|audio)\//.test(mime) || /^image\/(png|jpeg|webp)$/.test(mime) ? mime : 'application/octet-stream');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, max-age=3600');
    return new Response(res.body, { status: res.status, headers });
  } catch { return new Response('Video storage is temporarily unavailable.', { status: 502, headers: cors }); }
}