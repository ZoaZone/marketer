// Music brief chain — Base44 InvokeLLM (default) -> OpenAI (fallback) ->
// the caller's own prompt, verbatim.
//
// The audio itself is rendered by ElevenLabs/Suno/Replicate; neither
// InvokeLLM nor OpenAI's chat models can produce audio at all. What this
// chain does is turn a thin UI-built request into a specific musical brief
// before it reaches the renderer. It is best-effort by design: every
// failure mode has to degrade to "use the original prompt" rather than
// break a music job the user has already been charged for, so that is what
// most of these tests pin down.
//
// composeMusicBrief is loaded from the real submitMusic/entry.ts source
// (see test/helpers/loadServerModule.js), not reimplemented.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { loadServerModule } from "./helpers/loadServerModule.js";

let composeMusicBrief;

const SPEC = {
  prompt: "Thriller film score, cinematic, matching: a heist goes wrong",
  genre: "Thriller",
  mood: "tense",
  durationSeconds: 60,
};

// A brief long enough to clear sanitizeBrief's 20-char floor.
const GOOD_BRIEF =
  "Sparse minor-key piano at 70bpm under swelling cellos, building to a taut percussive climax.";

beforeAll(async () => {
  const mod = await loadServerModule(
    "base44/functions/submitMusic/entry.ts",
    "const BRIEF_MAX_CHARS",
    "// COST GATE.",
    ["composeMusicBrief", "BRIEF_MAX_CHARS"],
  );
  composeMusicBrief = mod.composeMusicBrief;
});

function fakeEnv(vars = {}) {
  globalThis.Deno = { env: { get: (k) => vars[k] } };
}

function fakeBase44(invokeLLM) {
  return { integrations: { Core: { InvokeLLM: invokeLLM } } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.Deno = { env: { get: () => undefined } };
});

describe("music brief chain", () => {
  it("uses Base44 InvokeLLM when it answers — OpenAI is never called", async () => {
    fakeEnv({ OPENAI_API_KEY: "sk-test" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const brief = await composeMusicBrief(fakeBase44(async () => GOOD_BRIEF), SPEC);

    expect(brief).toBe(GOOD_BRIEF);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when Base44's AI throws", async () => {
    fakeEnv({ OPENAI_API_KEY: "sk-test" });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: GOOD_BRIEF } }] }),
    })));

    const base44 = fakeBase44(async () => { throw new Error("Base44 AI unavailable"); });
    expect(await composeMusicBrief(base44, SPEC)).toBe(GOOD_BRIEF);
  });

  it("falls back to OpenAI when Base44 returns something unusable", async () => {
    // An empty or one-word reply is not a brief — treat it as no answer
    // rather than sending it to the renderer as the prompt.
    fakeEnv({ OPENAI_API_KEY: "sk-test" });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: GOOD_BRIEF } }] }),
    })));

    expect(await composeMusicBrief(fakeBase44(async () => "  "), SPEC)).toBe(GOOD_BRIEF);
  });

  it("returns null when both fail, so the caller's own prompt is used", async () => {
    fakeEnv({ OPENAI_API_KEY: "sk-test" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    const base44 = fakeBase44(async () => { throw new Error("Base44 AI unavailable"); });
    expect(await composeMusicBrief(base44, SPEC)).toBeNull();
  });

  it("returns null when OpenAI answers with a non-OK status", async () => {
    fakeEnv({ OPENAI_API_KEY: "sk-test" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "rate limited" })));

    const base44 = fakeBase44(async () => { throw new Error("down"); });
    expect(await composeMusicBrief(base44, SPEC)).toBeNull();
  });

  it("returns null when Base44 fails and no OpenAI key is configured", async () => {
    fakeEnv({});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const base44 = fakeBase44(async () => { throw new Error("down"); });
    expect(await composeMusicBrief(base44, SPEC)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is skipped entirely when MUSIC_BRIEF_LLM=off", async () => {
    fakeEnv({ MUSIC_BRIEF_LLM: "off", OPENAI_API_KEY: "sk-test" });
    const invoke = vi.fn(async () => GOOD_BRIEF);

    expect(await composeMusicBrief(fakeBase44(invoke), SPEC)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is skipped when there is no prompt to enrich", async () => {
    fakeEnv({});
    const invoke = vi.fn(async () => GOOD_BRIEF);

    expect(await composeMusicBrief(fakeBase44(invoke), { genre: "Thriller" })).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("truncates an over-long brief and collapses whitespace", async () => {
    fakeEnv({});
    const sprawling = `${"orchestral swell ".repeat(200)}\n\n   trailing`;

    const brief = await composeMusicBrief(fakeBase44(async () => sprawling), SPEC);
    expect(brief.length).toBeLessThanOrEqual(600);
    expect(brief).not.toMatch(/\s{2}|\n/);
  });

  it("never throws — a brief is an improvement, never a blocker", async () => {
    fakeEnv({ OPENAI_API_KEY: "sk-test" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));

    const base44 = { integrations: { Core: {} } }; // InvokeLLM missing entirely
    await expect(composeMusicBrief(base44, SPEC)).resolves.toBeNull();
  });
});
