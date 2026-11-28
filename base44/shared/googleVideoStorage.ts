import { secrets } from 'base44:runtime';

const encoder = new TextEncoder();
const tokenUrl = 'https://oauth2.googleapis.com/token';
const prefix = 'digital-studio/';
export const encode64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const url64 = (bytes) => encode64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode64 = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
let cachedToken;

export function googleConfig() {
  const project = secrets.get('GCP_PROJECT_ID')?.trim();
  const bucket = secrets.get('GCS_BUCKET_NAME')?.trim();
  let account;
  try { account = JSON.parse(secrets.get('GCP_SERVICE_ACCOUNT_KEY') || ''); } catch { /* invalid key */ }
  if (!/^[a-z0-9-]+$/.test(project || '') || !/^[a-z0-9._-]+$/.test(bucket || '') || !account?.client_email || !account?.private_key) {
    throw new Error('Google Cloud video storage is not configured correctly.');
  }
  return { project, bucket, account };
}

export async function googleToken() {
  const { account } = googleConfig();
  if (cachedToken?.email === account.client_email && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const key = await crypto.subtle.importKey('pkcs8', decode64(account.private_key.replace(/-----[^-]+-----|\s+/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: tokenUrl, iat: now, exp: now + 3600 };
  const jwt = `${url64(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${url64(encoder.encode(JSON.stringify(claims)))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(jwt));
  const res = await fetch(tokenUrl, { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${jwt}.${url64(new Uint8Array(signature))}` }), signal: AbortSignal.timeout(12000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('Google Cloud could not authenticate the service account.');
  cachedToken = { email: account.client_email, value: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

const validObject = (name) => /^digital-studio\/(?:veo|exports|inputs)\/[a-zA-Z0-9._/-]{1,400}$/.test(name) && !name.split('/').some(p => !p || p === '.' || p === '..');
const signingKey = () => {
  const secret = secrets.get('RENDER_SHARED_SECRET')?.trim();
  if (!secret) throw new Error('Media link signing is not configured.');
  return crypto.subtle.importKey('raw', encoder.encode(`gcs-media:v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
};

export async function mediaUrl(req, object) {
  if (!validObject(object)) throw new Error('Google returned an unexpected video path.');
  const token = url64(encoder.encode(object));
  const mac = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(token));
  const origin = req.headers.get('X-Base44-App-Url') || 'https://agentmarketer.base44.app';
  const url = new URL('/functions/gcsVideoMedia', origin);
  url.searchParams.set('t', `${token}.${url64(new Uint8Array(mac))}`);
  return url.href;
}

export async function mediaObject(token) {
  if (typeof token !== 'string' || !/^[\w-]{1,640}\.[\w-]{43}$/.test(token)) return null;
  const [body, sig] = token.split('.');
  try {
    if (!await crypto.subtle.verify('HMAC', await signingKey(), decode64(sig), encoder.encode(body))) return null;
    const object = new TextDecoder().decode(decode64(body));
    return validObject(object) ? object : null;
  } catch { return null; }
}

export async function writeMedia(req, file, folder) {
  const { bucket } = googleConfig();
  const ext = file.name?.match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin';
  const name = `${prefix}${folder}/${crypto.randomUUID()}.${ext}`;
  const params = new URLSearchParams({ uploadType: 'media', name, ifGenerationMatch: '0' });
  const res = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?${params}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': file.type || 'application/octet-stream' }, body: file, signal: AbortSignal.timeout(120000),
  });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`Google Cloud could not store the media (${res.status}).`);
  return mediaUrl(req, name);
}