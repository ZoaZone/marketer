# Google OAuth investigation (2026-09-13)

## Question
`GoogleLoginButton.jsx` shipped with `GOOGLE_LOGIN_ENABLED = false` and a comment
citing "a pre-existing Base44 platform incompatibility." Before accepting that,
this was checked against sibling Base44 apps with real, in-production Google
login: `pdfax` and `traditionalmatrimony`.

## What was actually broken
The disabled code was a custom Google Identity Services (GIS) button that:
1. Loads `accounts.google.com/gsi/client` and renders Google's own button.
2. On credential callback, POSTs the Google ID token to
   `https://base44.app/api/auth/google?app_id=<id>` with the token as a bearer
   header, expecting Base44 to validate it and return a session.

Both this app and `traditionalmatrimony` independently built this same
pattern (to get a Google consent screen branded as *this app*, not Base44),
and both hit the same wall on that endpoint:

- `GET  /api/auth/google` -> `401 "No authentication header"`
- `POST /api/auth/google` -> `405 Method Not Allowed`

Two independent apps, two independent implementations, identical failure
mode on the same platform endpoint. That is a Base44 platform gap, not a bug
in either app's request: **`base44.app/api/auth/google` is not a public
Google ID-token exchange endpoint**, despite it existing and returning
auth-shaped errors (401/405) rather than 404.

## What actually works
`pdfax` has real, working, in-production Google login today
(`src/pages/Login.jsx`, `src/pages/Register.jsx`). It does **not** use a
custom GIS button or the `/api/auth/google` endpoint at all — it calls the
Base44 SDK's own redirect flow:

```js
base44.auth.loginWithProvider("google", returnTo);
```

Reading `@base44/sdk`'s `auth.js`, this redirects the browser to
`${appBaseUrl}/api/apps/auth/login?app_id=<id>&from_url=<url>` (Base44's own
hosted Google OAuth), and on success Base44 redirects back to `from_url` with
`?access_token=...` appended. This app's own `src/lib/app-params.js` already
reads and persists that exact `access_token` query param (the same mechanism
the existing email/password login flow relies on), so no new plumbing was
needed to consume it.

The only real tradeoff of `loginWithProvider`: the Google consent screen
reads "to continue to base44.com" rather than this app's own name/branding,
because it uses Base44's shared OAuth client instead of a per-app one. That
is a cosmetic limitation, not a broken login.

## Verdict
**Fixed, not a dead end.** The disabled custom-token-exchange path is a
confirmed, reproducible Base44 platform gap (no supported ID-token exchange
endpoint) — evidenced identically in two independent apps — and is not
something fixable from this app's code. But full Google Login itself is not
broken on Base44: `loginWithProvider("google")` is the platform's supported
path, is already proven working in production on `pdfax`, and has been wired
up here (`src/components/GoogleLoginButton.jsx`), replacing the disabled GIS
button. `GOOGLE_LOGIN_ENABLED` and the GIS/token-exchange code path have been
removed.

If a fully white-labeled Google consent screen (this app's own name instead
of "base44.com") is required later, that is the specific, narrow item to
escalate to Base44 support: either (a) document a supported way to exchange a
per-app Google ID token for a Base44 session, or (b) support a per-app OAuth
client on the existing `loginWithProvider` redirect.
