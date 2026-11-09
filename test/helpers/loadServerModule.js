// loadServerModule.js — loads a slice of a real base44/functions/*/entry.ts
// (Deno/TypeScript) file into a runnable JS module, for testing production
// gating logic directly instead of a reimplementation of it.
//
// Base44 function deployments run on Deno and cannot be imported by a
// Node/Vitest test process directly, so this extracts a named region of the
// real source between two exact marker strings and lightly transliterates
// it: TS-only syntax (parameter/return type annotations) is stripped, and a
// stub `Deno.env` plus `Response.json` are provided since the tests
// construct their own fake `base44` client rather than hitting a real one.
//
// This is the same approach scripts/test-metering.mjs already uses for the
// metering block (see base44/_shared/metering.block.ts) — narrow, targeted
// regex stripping rather than a general TS transpiler, so a change that
// doesn't match the expected shape fails loudly (a thrown error or a syntax
// error) instead of silently testing the wrong thing.
import { readFileSync } from "node:fs";

/**
 * @param {string} filePath - path to the entry.ts file, repo-root-relative.
 * @param {string} beginMarker - exact string the extracted region starts at.
 * @param {string} endMarker - exact string the extracted region ends at
 *   (the region includes everything up to, not including, this marker).
 * @param {string[]} exportNames - names to `export` from the transliterated
 *   module, so the test can `import` them.
 */
export async function loadServerModule(filePath, beginMarker, endMarker, exportNames) {
  const src = readFileSync(filePath, "utf8");
  const start = src.indexOf(beginMarker);
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`loadServerModule: marker not found in ${filePath} (begin=${start}, end=${end})`);
  }
  let body = src.slice(start, end);

  // TS -> JS. Deliberately narrow (exact substrings, not a generic parser)
  // so a mistranslation surfaces as a syntax error rather than silently
  // changing behaviour — same philosophy as scripts/test-metering.mjs.
  body = body
    .replace(/base44: any, user: any/g, "base44, user")
    .replace(/: Promise<Response \| null>/g, "")
    .replace(/: Promise<boolean>/g, "")
    .replace(/: Promise<Record<string, string>>/g, "")
    .replace(/: Promise<string>/g, "")
    .replace(/apiKeys: any, fields: Array<[^>]*>/g, "apiKeys, fields")
    .replace(/stored: \{ ciphertext: string; iv: string \}, keyB64: string/g, "stored, keyB64")
    .replace(/const byok: Record<string, string> = \{\}/g, "const byok = {}")
    .replace(/spec: any, byok: Record<string, string>\): string/g, "spec, byok)")
    // submitMusic's music-brief chain (Base44 InvokeLLM -> OpenAI).
    .replace(/\(spec: any\): string/g, "(spec)")
    .replace(/\(raw: unknown\): string \| null/g, "(raw)")
    .replace(/\(base44: any, spec: any\): Promise<string \| null>/g, "(base44, spec)")
    // The canonical metering block (base44/_shared/metering.block.ts) —
    // same replacements scripts/test-metering.mjs already uses to run it
    // under plain Node, reused here so both files load the same way.
    .replace(/const num = \(v: string \| undefined, fallback: number\)/, "const num = (v, fallback)")
    .replace(/const WEIGHTS: Record<string, \{ rm: number; ac: number \}>/, "const WEIGHTS")
    .replace(/const ALLOWANCE: Record<string, \{ ac: number; rm: number \}>/, "const ALLOWANCE")
    .replace(/RAW\[kind as keyof typeof RAW\]/g, "RAW[kind]")
    .replace(/\(n: number, e: any\)/g, "(n, e)")
    // Must run before the generic ": Promise<Response | null>" strip above
    // would otherwise partially consume this same multi-line signature —
    // order matters here, unlike the other (single-line, non-overlapping)
    // replacements.
    .replace(
      /async function meterUsage\([\s\S]*?\)(?:\s*:\s*Promise<Response \| null>)?\s*\{/,
      "async function meterUsage(base44, user, kind, units, opts = {}) {",
    )
    .replace(/let sub: any = null;/, "let sub = null;")
    .replace(/\(s: any\)/g, "(s)")
    .replace(/let billedAs: string =/, "let billedAs =");

  // Stub globals the extracted code references but that only exist in the
  // real Deno function runtime. Node's own global `Response` (Fetch API)
  // already implements `Response.json(data, init)` spec-compliantly —
  // `.status` and `await res.json()` both work on it — so this only
  // installs a fallback where no native Response exists at all.
  globalThis.Deno = globalThis.Deno || { env: { get: () => undefined } };
  if (typeof globalThis.Response === "undefined") {
    globalThis.Response = class {};
    globalThis.Response.json = (data, init) => ({
      status: init?.status ?? 200,
      ok: (init?.status ?? 200) < 400,
      json: async () => data,
    });
  }

  const mod = await import(
    "data:text/javascript," + encodeURIComponent(`${body}\nexport { ${exportNames.join(", ")} };`)
  );
  return mod;
}
