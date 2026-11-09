// Lane 1 audio mixing (Quick Create / Campaign Studio / Demo Video Maker).
//
// The reported symptom: "the video, voice over and music is generated, but
// while playing only voice over" — the short shipped without the music track
// it had just spent a generation on.
//
// The cause was that Lane 1's audio was a three-way either/or (voiceover XOR
// music XOR silent). Nothing failed and nothing was logged; the caller simply
// passed one URL and dropped the other. These tests pin the mix as a layering
// of independent sources so that shape cannot come back.
import { describe, it, expect } from "vitest";
import { planAudioMix } from "../server-render/lane1.js";

const D = 30; // film duration, seconds

describe("planAudioMix", () => {
  it("mixes narration and music together — the case that used to drop one", () => {
    const plan = planAudioMix({ hasSceneVoice: false, hasVoiceover: true, hasMusic: true, videoDuration: D });
    const graph = plan.filters.join(";");

    expect(plan.extraInputs).toEqual(["voiceover", "music"]);
    expect(graph).toMatch(/amix=inputs=2/);
    expect(graph).toContain("[aout]");
  });

  it("ducks music under narration, and lets it lead when it is alone", () => {
    const withVoice = planAudioMix({ hasSceneVoice: false, hasVoiceover: true, hasMusic: true, videoDuration: D });
    const alone = planAudioMix({ hasSceneVoice: false, hasVoiceover: false, hasMusic: true, videoDuration: D });

    const duckedVolume = Number(withVoice.filters.join(";").match(/volume=([\d.]+)/)[1]);
    const aloneVolume = Number(alone.filters.join(";").match(/volume=([\d.]+)/)[1]);

    expect(duckedVolume).toBeLessThan(aloneVolume);
    expect(duckedVolume).toBeLessThanOrEqual(0.25);
  });

  it("numbers filter inputs in the order the inputs are appended", () => {
    // The one thing a hand-built filter_complex gets wrong silently: an
    // index that does not match the position of its -i.
    const plan = planAudioMix({ hasSceneVoice: false, hasVoiceover: true, hasMusic: true, videoDuration: D });
    const graph = plan.filters.join(";");

    expect(plan.extraInputs[0]).toBe("voiceover");
    expect(graph).toMatch(/\[1:a\]apad/);      // voiceover is input 1
    expect(plan.extraInputs[1]).toBe("music");
    expect(graph).toMatch(/\[2:a\]volume/);    // music is input 2
  });

  it("uses input 1 for music when there is no voiceover ahead of it", () => {
    const plan = planAudioMix({ hasSceneVoice: true, hasVoiceover: false, hasMusic: true, videoDuration: D });
    expect(plan.extraInputs).toEqual(["music"]);
    expect(plan.filters.join(";")).toMatch(/\[1:a\]volume/);
  });

  it("takes per-scene dialogue from the concat's own track, with no extra input", () => {
    // Scene voice rides in on each scene clip's audio, so it costs a label
    // and not an -i; treating it as an input would shift every later index.
    const plan = planAudioMix({ hasSceneVoice: true, hasVoiceover: false, hasMusic: false, videoDuration: D });

    expect(plan.extraInputs).toEqual([]);
    expect(plan.filters.join(";")).toMatch(/\[0:a\]apad/);
  });

  it("layers scene dialogue, project narration and music all at once", () => {
    const plan = planAudioMix({ hasSceneVoice: true, hasVoiceover: true, hasMusic: true, videoDuration: D });
    const graph = plan.filters.join(";");

    expect(plan.extraInputs).toEqual(["voiceover", "music"]);
    // Two mixes: scene voice + narration, then that under music.
    expect(graph.match(/amix=inputs=2/g)).toHaveLength(2);
    expect(graph).toContain("[aout]");
  });

  it("pads every finite narration source to the film's length", () => {
    // amix duration=first must resolve to the FILM. A narration shorter than
    // the film would otherwise end the mix early and truncate the music bed.
    const plan = planAudioMix({ hasSceneVoice: true, hasVoiceover: true, hasMusic: false, videoDuration: D });
    const pads = plan.filters.join(";").match(/apad=whole_dur=30/g);
    expect(pads).toHaveLength(2);
  });

  it("reports silence when there is nothing to mix", () => {
    const plan = planAudioMix({ hasSceneVoice: false, hasVoiceover: false, hasMusic: false, videoDuration: D });
    expect(plan.silent).toBe(true);
    expect(plan.filters).toEqual([]);
    expect(plan.extraInputs).toEqual([]);
  });

  it("always terminates in a single normalised [aout]", () => {
    for (const combo of [
      { hasSceneVoice: true, hasVoiceover: false, hasMusic: false },
      { hasSceneVoice: false, hasVoiceover: true, hasMusic: false },
      { hasSceneVoice: false, hasVoiceover: false, hasMusic: true },
      { hasSceneVoice: true, hasVoiceover: true, hasMusic: true },
    ]) {
      const graph = planAudioMix({ ...combo, videoDuration: D }).filters.join(";");
      expect(graph.match(/\[aout\]/g)).toHaveLength(1);
      expect(graph).toMatch(/loudnorm\[aout\]$/);
    }
  });
});
