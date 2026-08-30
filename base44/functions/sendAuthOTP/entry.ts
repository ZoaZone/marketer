import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendAuthOTP
 * Generates a 6-digit OTP, stores it with expiry in a temp record,
 * sends it via email (Resend → SendGrid → Base44 fallback).
 * Also handles OTP verification.
 */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 45 * 1000; // minimum gap between codes for one email
const MAX_VERIFY_ATTEMPTS = 5;        // wrong guesses before the code is burned

function generateOTP() {
  // crypto.getRandomValues, not Math.random: Math.random is not a CSPRNG, and
  // this value is a login credential. 100000-999999 keeps the 6-digit shape.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

// SECURITY: the OTP is stored on BetaRequest.invite_token, and BetaOnboarding
// reads BetaRequest from the browser BEFORE login (it looks an invite up by
// token and by email). Anything written there must be assumed readable by an
// unauthenticated visitor — so the code is never stored in the clear. We keep
// a salted SHA-256 digest instead: useless to a reader, still verifiable here.
async function hashOTP(salt: string, otp: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${otp}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newSalt(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Length-independent comparison so a timing signal can't leak the digest.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// note field doubles as the OTP's metadata store: "otp_purpose:login|attempts:2"
function buildNote(purpose: string, attempts: number): string {
  return `otp_purpose:${purpose}|attempts:${attempts}`;
}

function readAttempts(note: string): number {
  const m = /attempts:(\d+)/.exec(note || '');
  return m ? Number(m[1]) : 0;
}

// BetaRequest is shared between two unrelated things: genuine beta invites
// (invite_token = a 30-day token from sendBetaInvite) and this handler's OTP
// scratch space. Previously both wrote to records[0] of a filter-by-email, so
// requesting a sign-in code overwrote a pending invite's token and silently
// broke that person's invite link — and verify could read the wrong record.
// These two helpers keep the roles apart on a shared entity. The real fix is a
// dedicated OTP entity; until then, never write an OTP over a live invite.
const isOtpRecord = (r: any) =>
  String(r?.invite_token || '').startsWith('OTPH:') ||
  String(r?.note || '').startsWith('otp_purpose:');

const holdsLiveInvite = (r: any) => {
  const t = String(r?.invite_token || '');
  if (!t || isOtpRecord(r)) return false;
  const exp = r?.invite_expires_at ? new Date(r.invite_expires_at).getTime() : 0;
  return exp === 0 || exp > Date.now();
};

function buildEmailHtml(otp, purpose) {
  const title = purpose === 'signup' ? 'Verify your email' : purpose === 'reset' ? 'Reset your password' : 'Your sign-in code';
  const body = purpose === 'signup'
    ? 'Use the code below to verify your email and complete your digitalstudios.app registration.'
    : purpose === 'reset'
    ? 'Use the code below to reset your password. If you didn\'t request this, ignore this email.'
    : 'Use the code below to sign in to your digitalstudios.app account.';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#0a0a0a;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:20px;border:1px solid #1f1f2e;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7,#ec4899);padding:28px 36px;text-align:center;">
    <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">digitalstudios.app</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:3px;">AI Marketing & Media Platform · digitalstudios.app</div>
  </td></tr>
  <tr><td style="padding:36px;">
    <h2 style="color:#fff;font-size:20px;font-weight:800;margin:0 0 10px;">${title}</h2>
    <p style="color:#999;font-size:14px;line-height:1.7;margin:0 0 28px;">${body}</p>
    <div style="background:#0a0a0a;border:1px solid #2a2a3e;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
      <div style="font-size:42px;font-weight:900;color:#a855f7;letter-spacing:10px;font-family:monospace;">${otp}</div>
      <p style="color:#555;font-size:11px;margin:12px 0 0;">Valid for 10 minutes</p>
    </div>
    <p style="color:#444;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
  </td></tr>
  <tr><td style="background:#0d0d14;padding:16px 36px;border-top:1px solid #1f1f2e;text-align:center;">
    <p style="color:#444;font-size:11px;margin:0;">© 2026 digitalstudios.app · <a href="https://digitalstudios.app" style="color:#555;text-decoration:none;">digitalstudios.app</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const headers = { 'Access-Control-Allow-Origin': '*' };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const { action, email: rawEmail, otp: submittedOTP, purpose = 'login' } = payload;
    const email = String(rawEmail || '').trim().toLowerCase();

    if (!email) {
      return Response.json({ error: 'email is required' }, { status: 400, headers });
    }

    // ── SEND OTP ──────────────────────────────────────────────────────────────
    if (action === 'send') {
      const all = await base44.asServiceRole.entities.BetaRequest.filter({ email });
      const records = Array.isArray(all) ? all : [];

      // Target an existing OTP record if there is one; otherwise any record
      // that is NOT holding a live invite; otherwise nothing (we create a
      // dedicated OTP record below rather than clobber the invite).
      const target =
        records.find(isOtpRecord) ||
        records.find((r) => !holdsLiveInvite(r)) ||
        null;

      // Throttle resends. Without this, one unauthenticated caller can loop this
      // endpoint and mail-bomb any address from the app's sending domain (and
      // burn the email provider quota). issuedAt is derived from the stored
      // expiry, so no extra field is needed.
      if (target && String(target.invite_token || '').startsWith('OTPH:')) {
        const prevExpiry = target.invite_expires_at ? new Date(target.invite_expires_at).getTime() : 0;
        const issuedAt = prevExpiry - OTP_TTL_MS;
        if (issuedAt > 0 && Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
          return Response.json(
            { error: 'A code was just sent. Please wait a moment before requesting another.' },
            { status: 429, headers },
          );
        }
      }

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

      // Store only a salted digest of the code — see hashOTP above for why the
      // plaintext must never land in this field.
      const salt = newSalt();
      const digest = await hashOTP(salt, otp);
      const otpData = {
        invite_token: `OTPH:${salt}:${digest}`,
        invite_expires_at: expiresAt,
        note: buildNote(purpose, 0),
      };

      if (target) {
        await base44.asServiceRole.entities.BetaRequest.update(target.id, otpData);
      } else {
        await base44.asServiceRole.entities.BetaRequest.create({
          email,
          full_name: email.split('@')[0],
          status: 'pending',
          ...otpData,
        });
      }

      // Send email
      const subjects = { login: 'Your digitalstudios.app sign-in code', signup: 'Verify your digitalstudios.app email', reset: 'Reset your digitalstudios.app password' };
      const subject = subjects[purpose] || 'Your digitalstudios.app verification code';
      const html = buildEmailHtml(otp, purpose);
      const text = `Your ${purpose === 'reset' ? 'password reset' : 'verification'} code for digitalstudios.app is: ${otp}\n\nValid for 10 minutes.\n\n— The digitalstudios.app Team\nhttps://digitalstudios.app`;

      // Each provider attempt is independently try/caught — a thrown
      // network error from Resend must not skip trying SendGrid/Base44
      // next, the same way a non-ok response already falls through. Every
      // failure is logged with its actual status/body so a "code never
      // arrived" report can be diagnosed from Railway/Base44 logs instead
      // of guessing.
      let provider = 'none';
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        try {
          const fromEmail = (Deno.env.get('RESEND_FROM_EMAIL') || 'hello@digitalstudios.app').trim();
          const fromField = fromEmail.includes('<') ? fromEmail : `digitalstudios.app <${fromEmail}>`;
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromField, to: [email], subject, text, html }),
          });
          if (res.ok) provider = 'resend';
          else console.warn(`sendAuthOTP: Resend send failed (${res.status}): ${await res.text().catch(() => '')}`);
        } catch (e) {
          console.warn('sendAuthOTP: Resend send threw:', e.message);
        }
      }

      if (provider === 'none') {
        const sgKey = Deno.env.get('SENDGRID_API_KEY');
        if (sgKey) {
          try {
            const sgFrom = Deno.env.get('SENDGRID_FROM_EMAIL') || 'care@digitalstudios.app';
            const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
              method: 'POST',
              headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                personalizations: [{ to: [{ email }] }],
                from: { email: sgFrom, name: 'digitalstudios.app' },
                subject,
                content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
              }),
            });
            if (sgRes.ok) provider = 'sendgrid';
            else console.warn(`sendAuthOTP: SendGrid send failed (${sgRes.status}): ${await sgRes.text().catch(() => '')}`);
          } catch (e) {
            console.warn('sendAuthOTP: SendGrid send threw:', e.message);
          }
        }
      }

      if (provider === 'none') {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject, body: text });
          provider = 'base44';
        } catch (e) {
          console.warn('sendAuthOTP: Base44 email failed:', e.message);
        }
      }

      // Never claim success when nothing actually went out — the caller
      // (Auth.jsx) would otherwise advance straight to "enter the code we
      // emailed you" for a code that was never sent. A real error status
      // here makes base44.functions.invoke reject, so the existing catch
      // block in Auth.jsx surfaces it instead of silently proceeding.
      if (provider === 'none') {
        return Response.json(
          { error: 'Could not send the verification email right now. Please try again shortly.' },
          { status: 502, headers }
        );
      }

      return Response.json({ success: true, provider }, { headers });
    }

    // ── VERIFY OTP ────────────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!submittedOTP) {
        return Response.json({ error: 'otp is required' }, { status: 400, headers });
      }

      const all = await base44.asServiceRole.entities.BetaRequest.filter({ email });
      const rows = Array.isArray(all) ? all : [];
      // Select the OTP record specifically. Taking rows[0] could land on a beta
      // invite record for the same address and reject a perfectly good code.
      const record = rows.find((r) => String(r.invite_token || '').startsWith('OTPH:')) || null;
      if (!record) {
        return Response.json({ error: 'No OTP found for this email. Please request a new code.' }, { status: 400, headers });
      }

      const storedToken = record.invite_token || '';
      // Legacy plaintext "OTP:" records are deliberately rejected rather than
      // accepted for compatibility — honouring them would keep the readable-code
      // path alive. Codes live 10 minutes, so the worst case is one resend.
      if (!storedToken.startsWith('OTPH:')) {
        return Response.json({ error: 'No active OTP found. Please request a new code.' }, { status: 400, headers });
      }

      const expiresAt = record.invite_expires_at ? new Date(record.invite_expires_at) : null;
      if (expiresAt && Date.now() > expiresAt.getTime()) {
        return Response.json({ error: 'Code has expired. Please request a new one.' }, { status: 400, headers });
      }

      // A 6-digit code with unlimited guesses is brute-forceable inside its own
      // 10-minute window. Burn the code after a handful of wrong answers so the
      // attacker has to request a new one (which the resend cooldown throttles).
      const attempts = readAttempts(record.note);
      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        await base44.asServiceRole.entities.BetaRequest.update(record.id, { invite_token: '' });
        return Response.json(
          { error: 'Too many incorrect attempts. Please request a new code.' },
          { status: 429, headers },
        );
      }

      const [, salt, storedDigest] = storedToken.split(':');
      const submittedDigest = await hashOTP(salt || '', String(submittedOTP).trim());

      if (!timingSafeEqual(storedDigest || '', submittedDigest)) {
        await base44.asServiceRole.entities.BetaRequest.update(record.id, {
          note: buildNote(purpose, attempts + 1),
        });
        return Response.json({ error: 'Incorrect code. Please try again.' }, { status: 400, headers });
      }

      // Clear OTP after successful verification
      await base44.asServiceRole.entities.BetaRequest.update(record.id, {
        invite_token: '',
        note: `verified:${purpose}`,
        status: 'approved',
        invite_sent: true,
      });

      return Response.json({ success: true, verified: true }, { headers });
    }

    return Response.json({ error: 'Invalid action. Use "send" or "verify".' }, { status: 400, headers });

  } catch (error) {
    console.error('sendAuthOTP error:', error);
    return Response.json({ error: error.message }, { status: 500, headers });
  }
});