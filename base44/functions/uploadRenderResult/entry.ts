import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * uploadRenderResult — receives the finished MP4 from the standalone render
 * worker (server-render/, deployed separately, e.g. on Railway) and stores
 * it in Base44 storage, returning a persistent { file_url }.
 *
 * Unlike every other function in this project, the caller here is NOT a
 * logged-in app user — it's the render worker itself, a machine-to-machine
 * caller with no Base44 user session at all. So this does not (and cannot)
 * call base44.auth.me() the way generateVoiceover/etc. do. Instead, access
 * is gated by the shared secret in the Authorization header — the same
 * RENDER_SHARED_SECRET the worker uses to authenticate *its* callers
 * (see server-render/index.js's x-render-secret check) is reused here as
 * the token this endpoint expects back, so there's exactly one secret to
 * configure on both sides.
 *
 * With no end-user session, the per-user-scoped client path
 * (base44.auth.me() then base44.integrations.Core.UploadFile) isn't
 * available — base44.asServiceRole.integrations.Core.* is the same
 * escape hatch already used elsewhere in this codebase (sendEmailFallback,
 * sendBulkMessage, sendAuthOTP) for operations that must run without a
 * calling user's own token.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const sharedSecret = Deno.env.get('RENDER_SHARED_SECRET')?.trim();
    if (!sharedSecret) {
      return Response.json({ error: 'RENDER_SHARED_SECRET is not configured.' }, { status: 500, headers: CORS });
    }

    const authHeader = req.headers.get('authorization') || '';
    const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!providedToken || providedToken !== sharedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'A "file" field is required (multipart/form-data).' }, { status: 400, headers: CORS });
    }

    const base44 = createClientFromRequest(req);
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    const file_url = result?.file_url ?? result?.url;
    if (!file_url) {
      return Response.json({ error: 'Upload succeeded but no file_url was returned.' }, { status: 502, headers: CORS });
    }

    return Response.json({ file_url }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
