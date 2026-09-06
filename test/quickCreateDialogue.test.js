// Quick Create dialogue: turning a model's answer into per-scene lines.
//
// The report was that Quick Create's speech "is like documentary as
// background. No feeling of characters are talking. Dialogue capacities are
// zero." The fix is per-scene spoken lines rather than one narration track,
// and the fragile part of that is parsing: the model is ASKED for "1| line"
// per scene, but LLM output is not a protocol. An answer this parser drops
// on the floor produces an empty dialogue step with nothing to explain it.
//
// The other half is the speaker label. Keeping "MAYA:" on screen is what
// makes the lines read as characters talking; letting it reach text-to-speech
// makes the voice spell out a name. Both behaviours are pinned here.
import { describe, it, expect, vi } from "vitest";

// QuickCreate builds a Base44 client at module load; these are pure helpers
// and never touch it.
vi.mock("@/api/base44Client", () => ({ base44: {} }));

const { parseDialogueLines, toSpokenLine, sceneRuntimeSeconds } =
  await import("@/pages/QuickCreate.jsx");

describe("parseDialogueLines", () => {
  it("reads the pipe format it asks for", () => {
    const lines = parseDialogueLines(
      "1| MAYA: we're not done yet.\n2| SAM: then we go again.\n3| MAYA: at first light.",
      3,
    );
    expect(lines).toEqual([
      "MAYA: we're not done yet.",
      "SAM: then we go again.",
      "MAYA: at first light.",
    ]);
  });

  it("accepts the numbering variants a model actually returns", () => {
    for (const raw of [
      "1. first line\n2. second line",
      "1) first line\n2) second line",
      "Scene 1: first line\nScene 2: second line",
      "1 - first line\n2 - second line",
    ]) {
      expect(parseDialogueLines(raw, 2)).toEqual(["first line", "second line"]);
    }
  });

  it("joins a wrapped line back onto its own scene", () => {
    // A long line arrives split across two rows; the second row is not a new
    // scene and must not be dropped.
    const lines = parseDialogueLines(
      "1| MAYA: we came a long way for this\nand I am not walking back.\n2| SAM: then don't.",
      2,
    );
    expect(lines[0]).toBe("MAYA: we came a long way for this and I am not walking back.");
    expect(lines[1]).toBe("SAM: then don't.");
  });

  it("falls back to positional order when the model drops the numbering", () => {
    const lines = parseDialogueLines("first line\nsecond line\nthird line", 3);
    expect(lines).toEqual(["first line", "second line", "third line"]);
  });

  it("keeps the speaker label — that is what reads as a character talking", () => {
    expect(parseDialogueLines("1| DR. ELLIS: hold still.", 1)[0]).toBe("DR. ELLIS: hold still.");
  });

  it("strips stage directions, markdown and wrapping quotes", () => {
    const lines = parseDialogueLines('1| **MAYA:** (softly) "we\'re not done yet."', 1);
    expect(lines[0]).toBe("MAYA: we're not done yet.");
  });

  it("ignores scene numbers outside the storyboard", () => {
    // A model that keeps counting past the last scene must not write past
    // the end of the array or shift the real lines.
    const lines = parseDialogueLines("1| one\n2| two\n5| stray", 2);
    expect(lines).toEqual(["one", "two"]);
  });

  it("returns one empty slot per scene for an empty answer", () => {
    expect(parseDialogueLines("", 3)).toEqual(["", "", ""]);
    expect(parseDialogueLines(null, 2)).toEqual(["", ""]);
  });

  it("leaves a scene the model skipped empty rather than shifting the rest", () => {
    const lines = parseDialogueLines("1| one\n3| three", 3);
    expect(lines).toEqual(["one", "", "three"]);
  });
});

describe("toSpokenLine", () => {
  it("drops the speaker label so the voice does not read the name aloud", () => {
    expect(toSpokenLine("MAYA: we're not done yet.")).toBe("we're not done yet.");
    expect(toSpokenLine("Dr. Ellis: hold still.")).toBe("hold still.");
  });

  it("leaves an unlabelled line alone", () => {
    expect(toSpokenLine("we're not done yet.")).toBe("we're not done yet.");
  });

  it("does not mistake a mid-sentence colon for a speaker label", () => {
    const line = "There is only one rule here: nobody walks back alone.";
    expect(toSpokenLine(line)).toBe(line);
  });

  it("still strips stage directions", () => {
    expect(toSpokenLine("SAM: (grinning) then we go again.")).toBe("then we go again.");
  });
});

describe("sceneRuntimeSeconds", () => {
  it("uses the voice track when the line outlasts the visual", () => {
    // Both assemblers hold a scene open until its line finishes, so any
    // duration this page quotes has to follow the same rule or it describes
    // a different video from the one that renders.
    expect(sceneRuntimeSeconds({ seconds: 5, voiceSeconds: 7.4 })).toBeCloseTo(7.4);
  });

  it("uses the visual when it is the longer of the two", () => {
    expect(sceneRuntimeSeconds({ seconds: 8, voiceSeconds: 3 })).toBe(8);
  });

  it("handles a scene with no voice at all", () => {
    expect(sceneRuntimeSeconds({ seconds: 8 })).toBe(8);
    expect(sceneRuntimeSeconds({})).toBe(0);
  });
});
