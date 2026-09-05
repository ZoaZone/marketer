// Music provider selection — which of ElevenLabs / Suno / Replicate
// actually runs for a given request.
//
// This logic exists TWICE, deliberately and unavoidably: once in
// server-render/music.js (the worker, which does the work) and once in
// base44/functions/submitMusic/entry.ts (the Base44 function, which has to
// charge the right metering kind BEFORE the job runs). A Base44 function
// deployment cannot import from the worker, so the copy is hand-kept — and
// if the two ever drift, the platform charges for one provider while a
// different one runs. That is the precise shape of the bug this file
// guards: a BYOK user billed Render Minutes for a job their own key paid
// for, or a 1 RM vocal song charged as a 0.25 RM instrumental.
//
// Both real implementations are loaded from source — the worker's as a
// normal ES module, the function's through the same TS-stripping loader
// test/entitlement.test.js uses — and then driven through identical inputs.
import { describe, it, expect, beforeAll } from "vitest";
import { loadServerModule } from "./helpers/loadServerModule.js";
import { pickProvider as workerPickProvider } from "../server-render/music.js";

let fnPickProvider;

beforeAll(async () => {
  const mod = await loadServerModule(
    "base44/functions/submitMusic/entry.ts",
    "/**\n * Which music provider the worker will actually use for this spec.",
    "// COST GATE.",
    ["pickProvider"],
  );
  fnPickProvider = mod.pickProvider;
});

// The worker reads process.env; the Base44 copy reads Deno.env. Drive each
// through its own accessor with the same underlying values so the two are
// compared on equal footing.
function bothPick(spec, env, byok = {}) {
  const worker = workerPickProvider({ ...spec, byok }, env);

  const previousDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: (k) => env[k] } };
  try {
    return { worker, fn: fnPickProvider(spec, byok) };
  } finally {
    globalThis.Deno = previousDeno;
  }
}

const EL = { ELEVENLABS_API_KEY: "el-key" };
const SUNO = { SUNO_API_KEY: "suno-key" };
const REPLICATE_ONLY = {};

describe("music provider selection", () => {
  it("defaults to ElevenLabs for an instrumental bed", () => {
    const { worker, fn } = bothPick({ instrumental: true }, { ...EL });
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("defaults to ElevenLabs for vocals — it sings, so no Suno key is needed", () => {
    const { worker, fn } = bothPick({ instrumental: false }, { ...EL });
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("does NOT use Suno just because a Suno key exists — it is opt-in", () => {
    const { worker, fn } = bothPick({ instrumental: false }, { ...EL, ...SUNO });
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("uses Suno only when explicitly selected AND a key is present", () => {
    const env = { ...EL, ...SUNO, MUSIC_PROVIDER: "suno" };
    const { worker, fn } = bothPick({ instrumental: false }, env);
    expect(worker).toBe("suno");
    expect(fn).toBe("suno");
  });

  it("falls back to ElevenLabs when Suno is selected but no key is configured", () => {
    const env = { ...EL, MUSIC_PROVIDER: "suno" };
    const { worker, fn } = bothPick({ instrumental: false }, env);
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("never sends an instrumental request to Suno, even when Suno is selected", () => {
    const env = { ...EL, ...SUNO, MUSIC_PROVIDER: "suno" };
    const { worker, fn } = bothPick({ instrumental: true }, env);
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("honours MUSIC_PROVIDER=replicate for an instrumental", () => {
    const env = { ...EL, MUSIC_PROVIDER: "replicate" };
    const { worker, fn } = bothPick({ instrumental: true }, env);
    expect(worker).toBe("replicate");
    expect(fn).toBe("replicate");
  });

  it("prefers ElevenLabs for vocals even under MUSIC_PROVIDER=replicate — MusicGen cannot sing", () => {
    const env = { ...EL, MUSIC_PROVIDER: "replicate" };
    const { worker, fn } = bothPick({ instrumental: false }, env);
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("degrades to Replicate when no ElevenLabs key is configured at all", () => {
    const { worker, fn } = bothPick({ instrumental: true }, REPLICATE_ONLY);
    expect(worker).toBe("replicate");
    expect(fn).toBe("replicate");
  });

  it("degrades a vocals request to Replicate when nothing vocal-capable is configured", () => {
    // The caller finds out via `vocals: false` in the job result rather
    // than being handed an instrumental passed off as a song.
    const { worker, fn } = bothPick({ instrumental: false }, REPLICATE_ONLY);
    expect(worker).toBe("replicate");
    expect(fn).toBe("replicate");
  });

  it("lets a BYOK ElevenLabs key select ElevenLabs with no platform key set", () => {
    const { worker, fn } = bothPick({ instrumental: true }, {}, { elevenLabsKey: "user-key" });
    expect(worker).toBe("elevenlabs");
    expect(fn).toBe("elevenlabs");
  });

  it("lets a BYOK Suno key satisfy an explicitly-selected Suno run", () => {
    const env = { ...EL, MUSIC_PROVIDER: "suno" };
    const { worker, fn } = bothPick({ instrumental: false }, env, { sunoApiKey: "user-suno" });
    expect(worker).toBe("suno");
    expect(fn).toBe("suno");
  });
});
