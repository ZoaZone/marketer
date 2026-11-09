import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * proxyImage — server-side image fetch, used as a fallback when a
 * cross-origin image (a generated scene image, an uploaded reference image,
 * or a brand logo) fails to load in the browser with `crossOrigin="anonymous"`.
 * Canvas + MediaRecorder (see videoAssembler.js) require cross-origin images
 * to be served with Access-Control-Allow-Origin, or the browser refuses to
 * load them at all — which renders as a black scene or a missing logo in the
 * exported video. Fetching the bytes here, server-side, sidesteps the
 * browser's CORS enforcement entirely (same approach generateVoiceover
 * already uses for TTS audio) and hands the client back base64 it can turn
 * into a same-origin blob: URL.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1']);

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
  }
  return false;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { url } = await req.json().catch(() => ({}));
    if (!url) return Response.json({ error: 'url is required' }, { status: 400, headers: CORS });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400, headers: CORS });
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
      return Response.json({ error: 'URL not allowed' }, { status: 400, headers: CORS });
    }

    const res = await fetch(parsed.toString());
    if (!res.ok) {
      return Response.json({ error: `Source responded with ${res.status}` }, { status: 502, headers: CORS });
    }

    const mime = res.headers.get('content-type') || '';
    if (!mime.startsWith('image/')) {
      return Response.json({ error: 'Source is not an image' }, { status: 415, headers: CORS });
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return Response.json({ error: 'Image too large to proxy' }, { status: 413, headers: CORS });
    }

    return Response.json(
      { success: true, data_base64: toBase64(buf), mime },
      { headers: CORS }
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
