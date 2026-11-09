// capture.js — the Playwright automation + recording pipeline for a single
// capture job.
//
// Phase 1 scope: PUBLIC pages only, no login. Safety rules enforced here,
// unconditionally, regardless of what plan (custom or auto-generated) is
// running:
//  - Same-origin only: every navigation (goto or click) is checked against
//    the target URL's origin before it happens; anything else is refused.
//  - No form submissions: a context-level init script blocks the `submit`
//    event and neuters HTMLFormElement.prototype.submit outright, and
//    submit-type controls are never clicked in the first place.
//  - No downloads: acceptDownloads is off, and any 'download' event that
//    still fires is cancelled immediately.
//  - Cookie banners are only ever declined (reject/necessary-only wording),
//    never accepted — if no reject-worded control is found, the banner is
//    left alone rather than clicking an "Accept" default.
//  - Login required = abort: a visible password field, or a URL that looks
//    like an auth flow, aborts the whole capture with status
//    "login_required" and discards whatever was recorded — that page isn't
//    captured at all in Phase 1.

import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  generateStepVoiceovers, buildAlignedVoiceoverTrack,
  buildBackgroundMusicTrack, muxWalkthroughAudio, muxVoiceoverOnly,
} from "./audio.js";

const VIEWPORT = { width: 1920, height: 1080 };
const CAPTURE_MAX_SECONDS = Number(process.env.CAPTURE_MAX_SECONDS) || 60;

const DEFAULT_SCROLL_STEPS = 5;
const DEFAULT_NAV_LINK_COUNT = 3;
const SCROLL_SETTLE_MS = 900;
const NAV_CLICK_SETTLE_MS = 1500;
const GOTO_TIMEOUT_MS = 20000;
// Clamps any single custom-plan wait step so one step can't itself consume
// most of the duration cap.
const MAX_STEP_WAIT_MS = 5000;
// A custom plan is arbitrary caller input — bounded so a pathological plan
// can't queue an unbounded amount of work onto this worker's one-job-at-a-
// time queue.
const MAX_PLAN_STEPS = 50;

const VALID_ACTIONS = new Set(["goto", "scroll", "click", "wait"]);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function probeDuration(filePath) {
  const stdout = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

// Extracted once, right after the initial navigation clears the
// login-required check — feeds the downstream narration-script writer
// (title/headings/meta, not full page content, per the "never log full
// page content" rule extended here to what's returned at all). Best-effort:
// any extraction failure yields empty fields rather than failing the whole
// capture, since the video is the primary deliverable.
async function extractPageInfo(page) {
  return page.evaluate(() => {
    const title = (document.title || "").trim();
    const description = (
      document.querySelector('meta[name="description"]')?.content
      || document.querySelector('meta[property="og:description"]')?.content
      || ""
    ).trim();
    const seen = new Set();
    const headings = [];
    for (const el of document.querySelectorAll("h1, h2, h3")) {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (!text || seen.has(text)) continue;
      seen.add(text);
      headings.push(text);
      if (headings.length >= 12) break;
    }
    return { title, description, headings };
  }).catch(() => ({ title: "", description: "", headings: [] }));
}

// Strips the query string and hash from a URL before it's ever logged — a
// captured site's URLs can carry session tokens, tracking ids, or other
// sensitive values in either part. Exported so index.js can use it too when
// logging a job's target URL.
export function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[unparseable url]";
  }
}

// Playwright error messages sometimes embed the page URL verbatim (e.g. a
// navigation timeout) — redact any URL found inside a message before it's
// logged, same rule as redactUrl applied to free text.
function redactErrorMessage(message) {
  return String(message || "").replace(/https?:\/\/[^\s'")]+/g, (match) => redactUrl(match));
}

function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}

function normalizeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

// A context-wide guard, installed before any page navigates: blocks the
// `submit` event outright and neuters the imperative form.submit() escape
// hatch, so no click (or script on the page) can ever cause a form post —
// this is enforced independently of, and in addition to, the pre-click
// safety check in isClickSafe below.
async function installSafetyGuards(context) {
  await context.addInitScript(() => {
    document.addEventListener("submit", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    HTMLFormElement.prototype.submit = function () { /* no-op: capture must never submit forms */ };
  });
}

const COOKIE_REJECT_PATTERNS = [
  /reject all/i, /decline all/i, /^reject$/i, /^decline$/i,
  /only necessary/i, /necessary only/i, /essential only/i, /disagree/i,
];

// Tries a short list of common "reject/necessary-only" button wordings used
// by major consent-management platforms. Clicks the first match found. If
// none is found within the short per-pattern timeout, the banner is left
// alone — accepting-by-default would defeat the point, and there's no
// universal "decline" affordance to fall back to.
async function declineCookieBanner(page) {
  for (const pattern of COOKIE_REJECT_PATTERNS) {
    try {
      const btn = page.getByRole("button", { name: pattern }).first();
      if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => { });
        return true;
      }
    } catch {
      // try the next wording
    }
  }
  return false;
}

async function isLoginRequired(page) {
  const passwordInputs = page.locator('input[type="password"]');
  const count = await passwordInputs.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    if (await passwordInputs.nth(i).isVisible().catch(() => false)) return true;
  }
  try {
    const { hostname, pathname } = new URL(page.url());
    if (/(^|\/)(login|signin|sign-in|log-in|sso|account\/login)(\/|$)/i.test(pathname)) return true;
    if (/(^|\.)(accounts\.google|login\.microsoftonline|okta|auth0)\.com$/i.test(hostname)) return true;
  } catch {
    // current URL didn't parse — treat as not a login page
  }
  return false;
}

// Phase 2 (authenticated capture) only — restricts every outbound request
// this context makes to exactly the given set of origins (the target's,
// plus the login page's if it's on a different origin) and aborts
// everything else: third-party CDNs, fonts, analytics, ad scripts, all of
// it. This is strictly for the added-risk case of typing a real password
// into a captured page; Phase 1's unauthenticated captures are not
// sandboxed this way and can render normally. The real cost: a real site's
// page may render visibly broken (missing fonts/images/styles served from
// a different origin) — an accepted tradeoff for this being an explicit,
// consented, credentialed flow rather than a general default.
async function installNetworkSandbox(context, allowedOrigins) {
  await context.route("**/*", (route) => {
    let origin;
    try {
      origin = new URL(route.request().url()).origin;
    } catch {
      route.abort();
      return;
    }
    const allowedHosts = new Set([...allowedOrigins].map((o) => { try { return new URL(o).hostname; } catch { return ""; } }));
    let host = ""; try { host = new URL(origin).hostname; } catch { host = ""; }
    let ok = allowedOrigins.has(origin);
    if (!ok && host) { for (const h of allowedHosts) { if (h && (host === h || host.endsWith("." + h))) { ok = true; break; } } }
    if (ok) route.continue();
    else {
      if (!globalThis.__blk) globalThis.__blk = new Set();
      if (!globalThis.__blk.has(origin)) { globalThis.__blk.add(origin); console.log("[capture] sandbox blocked origin " + redactUrl(origin)); }
      route.abort();
    }
  });
}

// Injects a pre-existing Base44 access token into the browser context's
// localStorage via addInitScript, so the app sees an already-authenticated
// session without going through a login form. This is the OTP-compatible
// alternative to performLogin: the user already authenticated (via OTP,
// password, or whatever their app uses), and we're transferring that session
// to the headless browser rather than trying to re-create it with
// credentials a headless bot can't use (e.g. an OTP code sent by email).
// addInitScript runs before any page script on every navigation, so the
// token is in localStorage before the app's auth check runs.
async function injectSessionToken(context, authToken) {
  await context.addInitScript((token) => {
    try { localStorage.setItem("base44_access_token", token); } catch (_e) { }
  }, authToken);
}

const LOGIN_SETTLE_MS = 2500;
// Bounded wait for network activity to quiet down after a submit — a
// redirect or SPA re-render needs this to actually finish before the
// success check runs, but a page with persistent background polling/
// analytics could otherwise never go idle, so this is capped rather than
// awaited unconditionally.
const LOGIN_NETWORKIDLE_TIMEOUT_MS = 8000;
// Up to 2 retries beyond the first attempt — some flows redirect back to
// the login form (with an error) on the first submit and need a second
// click to actually go through; capped so a form that's genuinely wrong
// can't loop indefinitely.
const LOGIN_MAX_ATTEMPTS = 3;
const SUBMIT_BUTTON_NAME_PATTERN = /sign ?in|log ?in|continue|submit/i;
// After the login form is accepted, wait up to this long for the SPA to
// exchange the session for its auth token (in localStorage) and hydrate the
// user, so gated pages render unlocked rather than as a half-authenticated
// shell. Then a short settle so the authenticated shell finishes painting.
const AUTH_TOKEN_TIMEOUT_MS = 15000;
const AUTH_HYDRATE_SETTLE_MS = 1500;

// Waits for the page to settle after a submit: networkidle first (bounded,
// so it can't hang on a page that never fully quiets down), then a short
// fixed dwell as a floor/fallback. Used after every submit attempt,
// including retries, so a redirect-triggered re-render has time to finish
// before the next check runs.
async function settleAfterSubmit(page) {
  await page.waitForLoadState("networkidle", { timeout: LOGIN_NETWORKIDLE_TIMEOUT_MS }).catch(() => { });
  await page.waitForTimeout(LOGIN_SETTLE_MS);
}

// Tries a real submit control before ever falling back to Enter — some
// multi-step login forms only advance on an actual button click. Returns
// true if a button was found and clicked.
async function clickLikelySubmitButton(page) {
  const typeSubmit = page.locator('button[type="submit"], input[type="submit"]').first();
  if (await typeSubmit.isVisible({ timeout: 1500 }).catch(() => false)) {
    await typeSubmit.click({ timeout: 5000 }).catch(() => { });
    return true;
  }
  const byName = page.getByRole("button", { name: SUBMIT_BUTTON_NAME_PATTERN }).first();
  if (await byName.isVisible({ timeout: 1500 }).catch(() => false)) {
    await byName.click({ timeout: 5000 }).catch(() => { });
    return true;
  }
  return false;
}

// Submit precedence: an explicit credentials.submitSelector always wins;
// otherwise try to find a real submit-shaped button before ever falling
// back to pressing Enter in the password field (still the final fallback
// — it submits the large majority of real login forms with no selector
// needed at all).
async function submitLoginForm(page, credentials, passwordLocator) {
  if (credentials.submitSelector) {
    await page.click(credentials.submitSelector, { timeout: 5000 }).catch(() => { });
    return;
  }
  if (await clickLikelySubmitButton(page)) return;
  await passwordLocator.press("Enter").catch(() => { });
}

// The success check itself, factored out so it can be run twice: once
// right after the retry loop, and once more (PA-7.4's "grace re-check")
// if the first attempt says login hasn't succeeded yet — the redirect
// chain (login -> set-cookie -> app) can take a beat longer than
// settleAfterSubmit already waited for.
async function checkLoginSuccess(page, credentials) {
  const check = () => credentials.successSelector
    ? page.locator(credentials.successSelector).first().isVisible({ timeout: 5000 }).catch(() => false)
    : isLoginRequired(page).then((required) => !required);

  if (await check()) return true;
  await page.waitForLoadState("networkidle", { timeout: LOGIN_NETWORKIDLE_TIMEOUT_MS }).catch(() => { });
  await page.waitForTimeout(LOGIN_SETTLE_MS);
  return check();
}

// Attempts an auto-login using the caller-supplied selectors, falling back
// to reasonable defaults for any that are omitted. Returns only a boolean
// — never logs, throws, or returns anything containing the credential
// values themselves, so a caught error or a "why did this fail" question
// can never leak them. credentials is used by value here and nowhere
// retained; the caller (runCapture/runAppDemoWalkthrough) holds the only
// reference and it goes out of scope once this call returns.
//
// Retries the fill+submit up to LOGIN_MAX_ATTEMPTS times if the page is
// still login-shaped afterward — a redirect back to the login form
// (typically with an error) that needs a second submit to actually go
// through — before falling through to the tolerant, grace-rechecked
// success determination.
// Sets a value on a (possibly React-controlled) input so its onChange fires and
// // component state updates — otherwise a `disabled={!email||!password}` submit
// button stays disabled and the click is a no-op. Falls back to fill() on error.
async function reactSafeFill(locator, value) {
  const v = String(value ?? "");
  await locator.fill(v).catch(() => {});
  await locator.evaluate((el, val) => {
    const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, v).catch(() => {});
}

async function performLogin(page, credentials, targetOrigin) {
  const loginUrl = normalizeUrl(credentials.loginUrl) || targetOrigin;
  await page.goto(loginUrl, { waitUntil: "networkidle", timeout: GOTO_TIMEOUT_MS });
  page.on("response", (resp) => { try { const st = resp.status(); if (st >= 400) console.log("[capture] auth-resp " + st + " " + redactUrl(resp.url())); } catch (e) {} });
  await declineCookieBanner(page);

  const passwordSelector = credentials.passwordField || 'input[type="password"]';
  const passwordLocator = page.locator(passwordSelector).first();
  await passwordLocator.waitFor({ state: "visible", timeout: 30000 }).catch(() => { });
  if (!(await passwordLocator.isVisible({ timeout: 20000 }).catch(() => false))) {
    const diag = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return {
        inputs: Array.from(document.querySelectorAll("input")).map((el) => norm((el.type || "") + "#" + (el.name || "") + "." + (el.id || ""))).slice(0, 12),
        buttons: Array.from(document.querySelectorAll("button, [role=button]")).map((el) => norm(el.textContent)).filter(Boolean).slice(0, 8),
      };
    }).catch(() => ({}));
    console.log("[capture] login: password field not found on " + redactUrl(page.url()) + " using selector " + JSON.stringify(passwordSelector) + ". inputs=" + JSON.stringify(diag.inputs || []) + " buttons=" + JSON.stringify(diag.buttons || []));
    return false;
  }
  
  const usernameSelector = credentials.usernameField
    || 'input[type="email"], input[type="text"][name*="user" i], input[type="text"][name*="email" i], input[name*="email" i], input[name*="user" i]';

  for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
    const usernameLocator = page.locator(usernameSelector).first();
    if (await usernameLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reactSafeFill(usernameLocator, credentials.username || "");
    }
    await reactSafeFill(passwordLocator, credentials.password || "");
    await passwordLocator.evaluate((el) => el.blur()).catch(() => {});
    await page.waitForTimeout(400);

    await submitLoginForm(page, credentials, passwordLocator);
    await settleAfterSubmit(page);
    await declineCookieBanner(page);

    const stillOnLoginPage = await isLoginRequired(page);
    if (!stillOnLoginPage) break;

    const passwordStillVisible = await passwordLocator.isVisible().catch(() => false);
    if (attempt < LOGIN_MAX_ATTEMPTS && passwordStillVisible) {
      console.log(`[capture] login attempt ${attempt}: still on login page, retrying.`);
      continue;
    }
    break; // out of attempts, or no password field left to retry with
  }

  const success = await checkLoginSuccess(page, credentials);
  if (!success) {
    // Diagnostics only — never the credentials themselves. redactUrl
    // strips query/hash, same rule every other logged URL in this file
    // follows.
    const passwordStillVisible = await passwordLocator.isVisible().catch(() => false);
    console.log(`[capture] login did not succeed — final url: ${redactUrl(page.url())}, password field still visible: ${passwordStillVisible}.`);
    const diag = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const err = document.querySelector('[role="alert"], .text-red-500, .text-red-400, .text-rose-500, .error, [class*="error"]');
      const email = document.querySelector('input[type="email"]');
      const pwd = document.querySelector('input[type="password"]');
      const btn = document.querySelector('form button[type="submit"]');
      return {
        errorText: norm(err && err.textContent),
        emailLen: email ? String(email.value || "").length : -1,
        pwdLen: pwd ? String(pwd.value || "").length : -1,
        btnDisabled: btn ? !!btn.disabled : null,
        btnText: norm(btn && btn.textContent),
      };
    }).catch(() => null);
    console.log(`[capture] login diag: ${diag ? JSON.stringify(diag) : "n/a"}`);
  }

    
  
  // Login form accepted, but the SPA still needs a beat to exchange the
  // session for its auth token and hydrate the user before any gated page
  // (Movie Maker, Song Creator, etc.) will render unlocked. Without this the
  // walkthrough races ahead and records a half-authenticated shell: an "M"
  // avatar placeholder, Upgrade-to-Enterprise padlocks, and drift back to the
  // logged-out landing page. Wait for the token to actually land (best effort
  // — never throws, never logs the token, only whether it appeared).
  if (success) {
    const authed = await page
    .waitForFunction(() => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || "";
          if (/base44|access_token|auth/i.test(k) && localStorage.getItem(k)) return true;
        }
      } catch (_e) {}
      return false;
    }, { timeout: AUTH_TOKEN_TIMEOUT_MS, polling: 250 })
    .then(() => true)
    .catch(() => false);
    if (authed) {
      await page.waitForLoadState("networkidle", { timeout: LOGIN_NETWORKIDLE_TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(AUTH_HYDRATE_SETTLE_MS);
      log("auth token present — authenticated session hydrated, starting walkthrough.");
    } else {
      log("login succeeded but no auth token detected before timeout — continuing anyway.");
    }
  }
  return success;
}

// Pre-click check: refuses an off-origin link (checked from its href
// attribute, without ever navigating there) and refuses any control that
// looks like a form-submit trigger. Runs inside the page via $eval so the
// DOM inspection happens in-browser, not round-tripped element-by-element.
function isClickSafe(page, selector, targetOrigin) {
  return page.$eval(selector, (el, origin) => {
    const tag = el.tagName;
    if (tag === "A") {
      const href = el.getAttribute("href") || "";
      if (/^(javascript:|mailto:|tel:)/i.test(href.trim())) return false;
      try {
        const resolved = new URL(href, window.location.href);
        if (resolved.origin !== origin) return false;
      } catch {
        // empty/relative href resolves against the current page — fine
      }
    }
    if (el.closest("form")) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      const isSubmitControl = tag === "BUTTON"
        ? type !== "button" && type !== "reset"
        : tag === "INPUT" && (type === "submit" || type === "image");
      if (isSubmitControl) return false;
    }
    return true;
  }, targetOrigin).catch(() => false);
}

function clampWaitMs(value, fallback) {
  return Math.min(Math.max(0, Number(value) || fallback), MAX_STEP_WAIT_MS);
}

async function executeStep(page, step, targetUrl, targetOrigin, log) {
  if (step.action === "goto") {
    const dest = step.url || targetUrl;
    if (!sameOrigin(dest, targetOrigin)) {
      log(`skipped a goto step targeting a different origin than the capture.`);
      return;
    }
    await page.goto(dest, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await declineCookieBanner(page);
  } else if (step.action === "wait") {
    await page.waitForTimeout(clampWaitMs(step.ms, 0));
  } else if (step.action === "scroll") {
    await page.evaluate((h) => window.scrollBy(0, h), VIEWPORT.height);
    await page.waitForTimeout(clampWaitMs(step.ms, SCROLL_SETTLE_MS));
  } else if (step.action === "click") {
    const safe = await isClickSafe(page, step.selector, targetOrigin);
    if (!safe) {
      log(`skipped an unsafe click (${step.selector}) — off-origin link or form-submit control.`);
      return;
    }
    await page.click(step.selector, { timeout: 5000 }).catch((e) => {
      log(`click failed, continuing: ${redactErrorMessage(e.message)}`);
    });
    await page.waitForTimeout(clampWaitMs(step.ms, NAV_CLICK_SETTLE_MS));
    await declineCookieBanner(page);
  }
}

function normalizePlan(plan) {
  const steps = plan.slice(0, MAX_PLAN_STEPS).map((s) => {
    if (!s || typeof s !== "object" || !VALID_ACTIONS.has(s.action)) {
      throw new Error(`Invalid plan step: ${JSON.stringify(s)?.slice(0, 100)}`);
    }
    if (s.action === "click" && !s.selector) {
      throw new Error("A 'click' step requires a selector.");
    }
    return { action: s.action, selector: s.selector, ms: s.ms, url: s.url };
  });
  if (!steps.length) throw new Error("plan must contain at least one step.");
  return steps;
}

// Finds up to `count` distinct, same-origin, non-fragment links inside the
// page's header/nav landmarks, in document order — the "top-nav links" the
// auto-generated plan clicks through. Deliberately expressed as resolved
// goto targets (an extension of the goto step's shape with a `url` field)
// rather than re-resolved DOM selectors: the same absolute URL is safe to
// navigate to on every return-to-home cycle, where a live selector could
// drift if the page's markup shifts between loads.
async function discoverTopNavLinks(page, targetOrigin, count) {
  const hrefs = await page.$$eval(
    'header a, nav a, [role="navigation"] a',
    (els) => els.map((el) => el.getAttribute("href") || "")
  ).catch(() => []);

  const seen = new Set();
  const urls = [];
  for (const href of hrefs) {
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href.trim())) continue;
    let resolved;
    try { resolved = new URL(href, targetOrigin).href; } catch { continue; }
    if (new URL(resolved).origin !== targetOrigin) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    urls.push(resolved);
    if (urls.length >= count) break;
  }
  return urls;
}

// Builds the concrete step list for "no plan given": wait for the page to
// settle, scroll through it in increments, then visit up to
// DEFAULT_NAV_LINK_COUNT top-nav links, returning to the target URL between
// each. Called after the initial goto (so nav links can be discovered from
// the live DOM) and after login-detection has already cleared that page.
async function buildAutoPlan(page, targetUrl, targetOrigin) {
  const steps = [{ action: "wait", ms: 1500 }];
  for (let i = 0; i < DEFAULT_SCROLL_STEPS; i++) {
    steps.push({ action: "scroll", ms: SCROLL_SETTLE_MS });
  }

  const navLinks = await discoverTopNavLinks(page, targetOrigin, DEFAULT_NAV_LINK_COUNT);
  for (const url of navLinks) {
    steps.push({ action: "goto", url, ms: NAV_CLICK_SETTLE_MS });
    steps.push({ action: "goto", url: targetUrl }); // return to home between nav links
  }
  return steps;
}

async function uploadResult(filePath) {
  const uploadUrl = process.env.BASE44_UPLOAD_URL;
  const uploadToken = process.env.BASE44_UPLOAD_TOKEN;
  if (!uploadUrl) throw new Error("BASE44_UPLOAD_URL is not configured.");

  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "video/mp4" }), path.basename(filePath));

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${uploadToken}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(`Upload to Base44 failed: ${detail}`);
  }
  const data = await res.json();
  if (!data?.file_url) throw new Error("Upload succeeded but the response had no file_url.");
  return data.file_url;
}

/**
 * runCapture({ url, plan }, onProgress, credentials) — launches headless
 * Chromium, records a video of an automated walkthrough (custom plan or
 * auto-generated), converts it to MP4, uploads it, and returns
 * { status: "done", videoUrl, durationSeconds, pageInfo: { title,
 * description, headings[] } }, { status: "login_required" } (no
 * credentials given and the page needs them), or { status: "login_failed" }
 * (credentials given but didn't work). pageInfo is extracted once, right
 * after the initial navigation clears the login-required check, for a
 * caller (e.g. an auto-narration script writer) that wants the page's own
 * title/headings/meta without having to load the page itself. Always
 * cleans up its own temp directory and browser process, whether it
 * succeeds, aborts on login, or throws.
 *
 * `credentials`, if given ({ loginUrl?, usernameField?, passwordField?,
 * submitSelector?, successSelector?, username, password }), is used by
 * value for exactly this one call — nothing here stores it, and the
 * caller (index.js) is responsible for having already decrypted it
 * just-in-time and for zeroing/discarding it once this call returns. When
 * credentials are supplied, this context's network egress is sandboxed to
 * the target's and login page's origins only, for the duration of the
 * whole capture (see installNetworkSandbox) — a Phase 2-only restriction.
 */

// Origins the sandbox must allow beyond the site itself: an app's login
// and API calls frequently target a different backend host than the page
// (e.g. a Base44 app served at digitalstudios.app authenticates against
// base44.app). Returns the target's registrable domain and any subdomain
// of it, plus the login origin and known platform backends. Kept generic
// so this works for any app/platform, not just this one.
function backendOriginsFor(targetOrigin, loginUrl) {
  const origins = new Set();
  const add = (u) => { try { origins.add(new URL(u).origin); } catch { } };
  add(targetOrigin);
  if (loginUrl) add(loginUrl);
  // Known creative-platform backends that host auth/API for their apps.
  const PLATFORM_BACKENDS = [
    "https://base44.app",
    "https://app.base44.com",
    "https://base44.com",
  ];
  for (const b of PLATFORM_BACKENDS) origins.add(b);
  return origins;
}

export async function runCapture(spec, onProgress = () => { }, credentials = null, authToken = null) {
  const targetUrl = normalizeUrl(spec?.url);
  if (!targetUrl) throw new Error("A valid http(s) url is required.");
  const targetOrigin = new URL(targetUrl).origin;
  const log = (msg) => console.log(`[capture] ${msg}`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "capture-"));
  let browser = null;
  try {
    onProgress({ fraction: 0 });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: workDir, size: VIEWPORT },
      acceptDownloads: false,
    });
    const page = await context.newPage();
    page.on("download", (d) => { d.cancel().catch(() => { }); });

    const deadline = Date.now() + CAPTURE_MAX_SECONDS * 1000;

    if (authToken) {
      // Session-token injection: the user is already authenticated, so
      // inject their access token into localStorage and skip the login
      // form entirely. Same network sandbox as credentials mode — the
      // target's API calls still need to be allowed through.
      const allowedOrigins = new Set([targetOrigin]);
      for (const o of backendOriginsFor(targetOrigin, null)) allowedOrigins.add(o);
      await installNetworkSandbox(context, allowedOrigins);
      await injectSessionToken(context, authToken);
      log("injected session token — skipping login form.");
    } else if (credentials) {
      const allowedOrigins = new Set([targetOrigin]);
      // The app's own auth/API backend runs on a different origin than the site
      // itself (e.g. a Base44 app at digitalstudios.app calls base44.app to log
      // in). The network sandbox must allow those, or the login fetch is aborted
      // and surfaces as a "Network Error". Allow the target's own registrable
      // domain + subdomains, plus known platform backends, generically.
      for (const o of backendOriginsFor(targetOrigin, credentials.loginUrl)) allowedOrigins.add(o);
      const loginUrl = normalizeUrl(credentials.loginUrl);
      if (loginUrl) allowedOrigins.add(new URL(loginUrl).origin);
      await installNetworkSandbox(context, allowedOrigins);

      log("attempting authenticated login before the walkthrough.");
      const loginOk = await performLogin(page, credentials, targetOrigin).catch((e) => { log("performLogin error: " + redactUrl(String((e && e.message) || e || "unknown"))); return false; });
      if (!loginOk) {
        log("login failed — aborting capture, discarding recording.");
        await context.close();
        return { status: "login_failed" };
      }
      log("login succeeded — proceeding with the walkthrough.");
    }

    // Forms must never be submitted from here on (the walkthrough proper)
    // — installed *after* any login step above, which legitimately needs
    // to submit one. addInitScript only affects navigations that happen
    // after it's registered, so the login's own submission is unaffected
    // and every navigation from this point forward is protected.
    await installSafetyGuards(context);

    log(`navigating to ${redactUrl(targetUrl)}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await declineCookieBanner(page);

    if (await isLoginRequired(page)) {
      log("login required — aborting capture, discarding recording.");
      await context.close();
      return { status: "login_required" };
    }

    const pageInfo = await extractPageInfo(page);

    const steps = Array.isArray(spec.plan) && spec.plan.length
      ? normalizePlan(spec.plan)
      : await buildAutoPlan(page, targetUrl, targetOrigin);

    onProgress({ fraction: 0.1, stepIndex: 0, stepTotal: steps.length });

    let loginRequired = false;
    let stoppedEarly = false;
    for (let i = 0; i < steps.length; i++) {
      if (Date.now() >= deadline) {
        log(`duration cap (${CAPTURE_MAX_SECONDS}s) reached — stopping early at step ${i}/${steps.length}.`);
        stoppedEarly = true;
        break;
      }
      onProgress({ fraction: 0.1 + (i / steps.length) * 0.6, stepIndex: i, stepTotal: steps.length });
      await executeStep(page, steps[i], targetUrl, targetOrigin, log);
      if (await isLoginRequired(page)) { loginRequired = true; break; }
    }
    void stoppedEarly; // recorded in logs only — the video is still finalized with whatever was captured

    const video = page.video();
    await context.close(); // finalizes the .webm to disk
    await browser.close();
    browser = null;

    if (loginRequired) {
      log("login required mid-walkthrough — aborting capture, discarding recording.");
      return { status: "login_required" };
    }

    const { videoUrl, durationSeconds } = await finalizeRecording(video, workDir, onProgress);
    return { status: "done", videoUrl, durationSeconds, pageInfo };
  } finally {
    if (browser) await browser.close().catch(() => { });
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}

// Converts a recorded .webm to MP4 (libx264/yuv420p/+faststart) and probes
// its real duration. Shared by finalizeRecording (runCapture's raw,
// upload-immediately path) and runAppDemoWalkthrough (which needs the mp4
// path *before* uploading, to mux narration/music onto it first).
async function convertToMp4(video, workDir) {
  const videoPath = video ? await video.path() : null;
  if (!videoPath) throw new Error("Recording produced no video file.");

  const mp4Path = path.join(workDir, "capture.mp4");
  await run("ffmpeg", [
    "-y", "-i", videoPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
    "-movflags", "+faststart",
    mp4Path,
  ]);

  const durationSeconds = await probeDuration(mp4Path).catch(() => 0);
  return { mp4Path, durationSeconds };
}

/**
 * finalizeRecording(video, workDir, onProgress) — shared tail end for
 * runCapture (arbitrary-URL walkthroughs): converts, then uploads via
 * uploadResult. Returns { videoUrl, durationSeconds } — this is the *raw*
 * screen recording, with no narration audio mixed in. Not used by
 * runAppDemoWalkthrough (see its own doc comment) — that path calls
 * convertToMp4 directly so it can mux audio in before uploading.
 */
async function finalizeRecording(video, workDir, onProgress) {
  onProgress({ fraction: 0.75 });
  const { mp4Path, durationSeconds } = await convertToMp4(video, workDir);

  onProgress({ fraction: 0.9 });
  const videoUrl = await uploadResult(mp4Path);
  onProgress({ fraction: 1 });
  return { videoUrl, durationSeconds };
}

// ── Scripted "app demo" walkthrough (digitalstudios.app) ───────────────
//
// Unlike runCapture (an arbitrary caller-supplied URL, auto-generated or
// custom plan), this is a fixed, hand-authored walkthrough of this app's
// own public marketing surfaces — Home, Pricing, and the in-page
// "Watch Demo" product-preview modal that renders for a logged-out
// visitor without requiring sign-up. Grounded in the actual markup in
// src/pages/Home.jsx and src/pages/Pricing.jsx at the time this was
// written (BRAND.name/copy/selectors come from there, not guessed) — if
// those pages' copy or structure changes, this step list needs updating
// to match.

const DEFAULT_DWELL_MS = 4500;
// Global multiplier applied to every beat's dwell so the recording lingers
// long enough on each screen to be readable (raised after early cuts felt
// too fast to follow).
const DWELL_SCALE = 1.4;
// Interpolation steps for page.mouse.move — enough for a smooth, visible
// glide between targets in the recording rather than a snap-cut jump.
const CURSOR_MOVE_STEPS = 30;

/**
 * Each step's `actions[].selector` is a plain Playwright locator string:
 * either a CSS attribute selector (`[data-testid="..."]` — none exist in
 * this codebase yet, so role+name is used throughout instead) or
 * Playwright's own `role=<role>[name="<accessible name>"]` engine syntax.
 * Never a pixel coordinate: resolveTargetPoint (below) only ever *reads*
 * coordinates from an already-resolved selector's real bounding box, to
 * drive the mouse cursor there for the recording — nothing here targets a
 * click/hover by a hardcoded (x, y).
 */
export const DIGITAL_STUDIOS_DEMO_STEPS = [
  {
    path: "/",
    label: "Home — Hero",
    narration: "Digital Studio is the all-in-one AI platform for creating feature-length movies, songs, images, and marketing content — all without leaving one app.",
    dwellMs: 3000,
    actions: [
      { type: "hover", selector: 'role=link[name="Start Free Trial"]' },
    ],
  },
  {
    path: "/",
    label: "Home — Feature grid",
    narration: "Every tool a creative team needs lives in one studio — Movie Maker, Song Creator, AI Media Editor, Ad Creator, and more, all built in.",
    dwellMs: 3500,
    actions: [
      { type: "scroll", selector: "#features" },
      { type: "hover", selector: 'role=heading[name="Movie Maker"]' },
    ],
  },
  {
    path: "/",
    label: "Home — Watch Demo modal",
    narration: "A quick in-app preview shows exactly what you can create, right from the homepage — no sign-up required to look around.",
    dwellMs: 3000,
    actions: [
      { type: "scroll", selector: 'role=button[name="Watch Demo"]' },
      { type: "click", selector: 'role=button[name="Watch Demo"]' },
    ],
  },
  {
    path: "/",
    label: "Home — Pricing teaser",
    narration: "Pricing scales with what you need — from a single-creator plan up through full agency and studio tiers.",
    dwellMs: 3000,
    actions: [
      { type: "scroll", selector: "#pricing" },
    ],
  },
  {
    path: "/pricing",
    label: "Pricing — Plan comparison",
    narration: "The full pricing page breaks every tier down in detail, from the Business suite through Movie Maker Pro and Bring Your Own Key.",
    dwellMs: 3500,
    actions: [
      { type: "scroll", selector: 'role=heading[name="Business"]' },
      { type: "hover", selector: 'role=heading[name="Movie Maker Pro"]' },
    ],
  },
  {
    path: "/pricing",
    label: "Pricing — Get Started CTA",
    narration: "Every plan starts with a single click — pick a tier and go straight into the studio, no lengthy setup required.",
    dwellMs: 3000,
    actions: [
      { type: "scroll", selector: 'role=button[name="Get Started"]' },
      { type: "hover", selector: 'role=button[name="Get Started"]' },
    ],
  },
];

/**
 * The logged-in-tools tour — Dashboard, Quick Create, Ad Creator, Song
 * Creator, Movie Maker Pro, Media Library — only ever run after a
 * successful login (see runAppDemoWalkthrough's `credentials` param).
 * Selectors are grounded in each page's actual heading/CTA (PageHeader's
 * title renders as an <h1> — see src/components/ui/PageHeader.jsx — except
 * Dashboard, whose <h1> is a dynamic "Welcome back, {name}" greeting that
 * isn't a stable match target, so that step targets its static "New
 * Campaign" link instead).
 */
export const DIGITAL_STUDIOS_AUTHENTICATED_DEMO_STEPS = [
  {
    path: "/dashboard",
    label: "Dashboard",
    narration: "Welcome to Digital Studio — the all-in-one AI platform where one login gives creators every tool they need. This is your dashboard, the launch point for movies, songs, ads, and more.",
    dwellMs: 4000,
    actions: [
      { type: "hover", selector: 'role=link[name="New Campaign"]' },
      { type: "scroll", selector: "footer" },
    ],
  },
  {
    path: "/quick-create",
    label: "Quick Create",
    narration: "Quick Create turns a single idea into ready-to-post content. Just describe what you want, and the AI generates images, captions, and video in minutes.",
    dwellMs: 3000,
    actions: [
      { type: "typeText", selector: "textarea", text: "A vibrant product launch post for a new coffee brand, warm morning light" },
      { type: "click", selector: 'role=button[name="Generate"]' },
      { type: "scroll", selector: 'role=heading[name="Preview"]' },
    ],
  },
  {
    path: "/ad-creator",
    label: "Ad Creator",
    narration: "Ad Creator builds on-brand ad copy and matching visuals for every platform. Generate the words and the artwork together, ready to review and publish.",
    dwellMs: 3500,
    actions: [
      { type: "click", selector: 'role=button[name="Generate Ad Copy"]' },
      { type: "hover", selector: 'role=button[name="Generate Ad Visual"]' },
    ],
  },
  {
    path: "/song-creator",
    label: "Song Creator — AI Music",
    narration: "Song Creator is where AI makes music. Pick a theme, genre, and mood, and it writes original lyrics — then renders them as a fully produced, sung song with instrumental backing.",
    dwellMs: 3000,
    actions: [
      { type: "typeText", selector: 'input[placeholder*="Overcoming"]', text: "Rising from failure, chasing a dream" },
      { type: "click", selector: 'role=button[name="Generate Lyrics"]' },
    ],
  },
  {
    path: "/song-creator",
    label: "Song Creator — Full song render",
    narration: "One click on Sung, Full song turns those lyrics into real AI-composed music — melody, vocals, and instrumentation — and it can be dubbed into any language.",
    dwellMs: 5000,
    actions: [
      { type: "click", selector: 'role=button[name="Sung / Full song"]' },
    ],
  },
  {
    path: "/movie-maker",
    label: "Movie Maker Pro — Script",
    narration: "Movie Maker Pro assembles feature-length AI films. Start with a story, and it generates a full script broken into scenes.",
    dwellMs: 3000,
    actions: [
      { type: "typeText", selector: "textarea", text: "A short sci-fi film about a lighthouse keeper who discovers a signal from the sea" },
      { type: "click", selector: 'role=button[name="Generate AI Script"]' },
    ],
  },
  {
    path: "/movie-maker",
    label: "Movie Maker Pro — Music & Dubbing",
    narration: "Every film gets AI music, voiceover, subtitles, and dubbing into any language — all inside one project, with your reference character carried through every scene.",
    dwellMs: 4000,
    actions: [
      { type: "click", selector: 'role=button[name="Music"]' },
      { type: "click", selector: 'role=button[name="Dubbing"]' },
    ],
  },
  {
    path: "/media-library",
    label: "Media Library",
    narration: "Everything you create lands in one Media Library — songs, films, ads, and images — ready to reuse across any project. That's Digital Studio: one platform for all creative people.",
    dwellMs: 3500,
    actions: [
      { type: "scroll", selector: 'role=heading[name="Media Library"]' },
    ],
  },
];

// Resolves a selector to its live element, scrolls it into view, and
// returns the cursor destination point (its bounding box's center) along
// with the Locator itself for the click/hover that follows.
async function resolveTargetPoint(page, selector) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.scrollIntoViewIfNeeded().catch(() => { });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`selector resolved but has no visible bounding box: ${selector}`);
  return { locator, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Playwright's mouse tracks its own current position internally — a plain
// move(x, y, { steps }) always glides from wherever it currently is,
// interpolated over that many steps, rather than snapping straight there.
// That's what makes cursor movement between targets read as smooth motion
// in the recording instead of a jump-cut.
async function moveCursorTo(page, point) {
  await page.mouse.move(point.x, point.y, { steps: CURSOR_MOVE_STEPS });
}

async function executeScriptedAction(page, action) {
  const target = await resolveTargetPoint(page, action.selector);
  await moveCursorTo(page, target);
  if (action.type === "click") {
    await target.locator.click({ timeout: 5000 }).catch(() => { });
  } else if (action.type === "hover") {
    await target.locator.hover({ timeout: 5000 }).catch(() => { });
  } else if (action.type === "typeText") {
    await target.locator.fill(String(action.text ?? ""), { timeout: 5000 }).catch(() => { });
  }
// "scroll" actions are satisfied by resolveTargetPoint's own
  // scrollIntoViewIfNeeded — the cursor has already glided to the
  // now-visible target, nothing further to do.
}

// currentPathRef is a { value } box (not a plain string) so consecutive
// steps that share the same path skip re-navigation entirely — a fresh
// page.goto would reset scroll position and animation state for no
// reason when the next step is just another beat on the same page.
async function runScriptedStep(page, step, baseUrl, currentPathRef) {
  if (step.path !== currentPathRef.value) {
    const dest = new URL(step.path, baseUrl).href;
    await page.goto(dest, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await declineCookieBanner(page);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
    await page.waitForTimeout(1200);
    currentPathRef.value = step.path;
  }
  for (const action of step.actions || []) {
    await executeScriptedAction(page, action).catch((e) => {
      console.log(`[capture] scripted action "${action.type} ${action.selector}" failed, continuing: ${e.message}`);
    });
  }
  const baseDwell = Math.round((step.dwellMs ?? DEFAULT_DWELL_MS) * DWELL_SCALE);
  const narrationText = typeof step.narration === "string" ? step.narration : "";
  const narrationWords = narrationText.trim() ? narrationText.trim().split(/\s+/).length : 0;
  const narrationDwell = narrationWords > 0 ? Math.round((narrationWords / 2.6) * 1000) + 900 : 0;
  await page.waitForTimeout(Math.max(baseDwell, narrationDwell));
}

/**
 * runAppDemoWalkthrough(onProgress, baseUrl, credentials) — records the
 * scripted digitalstudios.app walkthrough. With no `credentials`, this is
 * exactly the public DIGITAL_STUDIOS_DEMO_STEPS tour (Home, Pricing, the
 * in-page product-preview modal) — the default, unchanged from before.
 *
 * With `credentials` ({ loginUrl?, usernameField?, passwordField?,
 * submitSelector?, successSelector?, username, password }), the walkthrough
 * logs in first (reusing performLogin/installNetworkSandbox — the exact
 * same login step, network egress sandboxing, and generic-failure
 * behavior runCapture's Phase 2 authenticated capture already uses — see
 * their doc comments) and then tours ONLY
 * DIGITAL_STUDIOS_AUTHENTICATED_DEMO_STEPS (Dashboard, Quick Create, Ad
 * Creator, Song Creator, Movie Maker Pro, Media Library) instead of the
 * public steps — the two tours are never combined in one recording, since
 * a logged-in session can change how the public marketing pages behave
 * (e.g. redirects) in ways this walkthrough doesn't try to account for.
 * On login failure, returns `{ status: "login_failed" }` (no video
 * produced) — same generic status runCapture uses, and for the same
 * reason: never surface which step failed or anything from `credentials`.
 * `credentials` is used by value for exactly this one call and never
 * stored here; the caller (index.js) owns decrypting it just-in-time and
 * zeroing/discarding it once this call returns, identical to runCapture.
 *
 * Same recording pipeline either way (1920x1080 recordVideo, libx264 MP4
 * via convertToMp4), but the *finished* MP4 is not the raw screen
 * recording: each step's real measured on-screen duration drives a
 * per-step ElevenLabs voiceover of its `narration` text, concatenated
 * into one track aligned to those windows (audio.js's
 * generateStepVoiceovers/buildAlignedVoiceoverTrack); a Replicate
 * MusicGen background bed (2-3 crossfaded segments for anything longer
 * than a single segment, so it's not one clip looping —
 * buildBackgroundMusicTrack) is mixed underneath at a fixed -14dB duck
 * and muxed onto the video (muxWalkthroughAudio) — music is best-effort
 * and falls back to voiceover-only (muxVoiceoverOnly) if it fails, but
 * voiceover itself is required. No text overlay is burned in anywhere in
 * this pipeline. Returns { status: "done", videoUrl, durationSeconds,
 * steps } — `steps` echoes back each step's path/label/narration
 * alongside the video, and `durationSeconds` is the video's own length
 * (audio is trimmed/held to match it, not the other way around). Always
 * cleans up its own temp directory and browser process.
 */
export async function runAppDemoWalkthrough(
  onProgress = () => { },
  baseUrl = process.env.TARGET_BASE_URL || "https://digitalstudios.app",
  credentials = null,
  authToken = null
) {
  const log = (msg) => console.log(`[capture] ${msg}`);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "capture-"));
  let browser = null;
  try {
    onProgress({ fraction: 0 });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: workDir, size: VIEWPORT },
      acceptDownloads: false,
    });
    const page = await context.newPage();
    page.on("download", (d) => { d.cancel().catch(() => { }); });

    if (authToken) {
      const targetOrigin = new URL(baseUrl).origin;
      const allowedOrigins = new Set([targetOrigin]);
      for (const o of backendOriginsFor(targetOrigin, null)) allowedOrigins.add(o);
      await installNetworkSandbox(context, allowedOrigins);
      await injectSessionToken(context, authToken);
      log("injected session token — skipping login form for app-demo walkthrough.");
    } else if (credentials) {
      const targetOrigin = new URL(baseUrl).origin;
      const allowedOrigins = new Set([targetOrigin]);
      const loginUrl = normalizeUrl(credentials.loginUrl);
      if (loginUrl) allowedOrigins.add(new URL(loginUrl).origin);
      await installNetworkSandbox(context, allowedOrigins);

      log("attempting authenticated login before the app-demo walkthrough.");
      const loginOk = await performLogin(page, credentials, targetOrigin).catch(() => false);
      if (!loginOk) {
        log("login failed — aborting app-demo walkthrough, discarding recording.");
        await context.close();
        return { status: "login_failed" };
      }
      log("login succeeded — proceeding with the authenticated walkthrough.");
    }

    // Forms must never be submitted from here on — installed after any
    // login step above, which legitimately needs to submit one (same
    // ordering rationale as runCapture).
    await installSafetyGuards(context);

    const steps = (credentials || authToken) ? DIGITAL_STUDIOS_AUTHENTICATED_DEMO_STEPS : DIGITAL_STUDIOS_DEMO_STEPS;
    const currentPathRef = { value: null };
    // Measured wall-clock time per step (goto + actions + dwell, not just
    // the nominal dwellMs) — this is what the voiceover track actually
    // aligns to, since it's the real on-screen duration for that step in
    // the recorded video.
    const stepDurationsMs = [];
    for (let i = 0; i < steps.length; i++) {
      onProgress({ fraction: (i / steps.length) * 0.5, stepIndex: i, stepTotal: steps.length });
      log(`step ${i + 1}/${steps.length}: ${steps[i].label}`);
      const stepStartedAt = Date.now();
      await runScriptedStep(page, steps[i], baseUrl, currentPathRef);
      stepDurationsMs.push(Date.now() - stepStartedAt);
    }
    onProgress({ fraction: 0.5, stepIndex: steps.length, stepTotal: steps.length });

    const video = page.video();
    await context.close();
    await browser.close();
    browser = null;

    onProgress({ fraction: 0.55 });
    const { mp4Path, durationSeconds } = await convertToMp4(video, workDir);

    // Voiceover is required — a demo with no narration defeats the point,
    // so a failure here fails the whole job rather than degrading quietly.
    onProgress({ fraction: 0.6 });
    log("generating per-step narration voiceover.");
    const voiceClips = await generateStepVoiceovers(steps.map((s) => s.narration), workDir);
    const voiceoverTrackPath = await buildAlignedVoiceoverTrack(
      stepDurationsMs.map((ms) => ms / 1000),
      voiceClips,
      workDir
    );

    // Background music is best-effort: a failure here still produces a
    // finished, narrated demo — just without a music bed — rather than
    // failing the whole recording over music specifically.
    onProgress({ fraction: 0.8 });
    let finalPath;
    try {
      log("generating background music.");
      const musicTrackPath = await buildBackgroundMusicTrack(durationSeconds, workDir);
      onProgress({ fraction: 0.92 });
      finalPath = await muxWalkthroughAudio(mp4Path, voiceoverTrackPath, musicTrackPath, durationSeconds, workDir);
    } catch (e) {
      log(`background music generation/mux failed, muxing voiceover only: ${e.message}`);
      finalPath = await muxVoiceoverOnly(mp4Path, voiceoverTrackPath, durationSeconds, workDir);
    }

    onProgress({ fraction: 0.97 });
    const videoUrl = await uploadResult(finalPath);
    onProgress({ fraction: 1, stepIndex: steps.length, stepTotal: steps.length });
    return {
      status: "done",
      videoUrl,
      durationSeconds,
      steps: steps.map(({ path: p, label, narration }) => ({ path: p, label, narration })),
    };
  } finally {
    if (browser) await browser.close().catch(() => { });
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}