// Scene-video progress reporting.
//
// A clip takes two to three minutes on a worker that runs ONE job at a time
// across every kind, so a caller with no progress signal shows a bare
// spinner for minutes and a healthy generation becomes indistinguishable
// from a hang — the exact symptom reported as "spinning, no output" while
// the worker logs showed jobs completing normally.
//
// generateSceneVideo was the only long-running job kind that read none of
// the status it was already being handed (dubAudioFile, dubVideoFile and
// assembleLane1Video all report progress). These tests pin the callback
// contract so that gap cannot silently come back.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: (...a) => invoke(...a) } } }));

const { generateSceneVideo } = await import("@/utils/aiClient.js");

// The poll loop sleeps POLL_MS between status reads; fake timers keep these
// tests instant instead of real-time.
beforeEach(() => {
  invoke.mockReset();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

/**
 * Drives generateSceneVideo against a scripted sequence of job statuses,
 * advancing fake timers until it settles.
 */
async function runWithStatuses(statuses) {
  let call = 0;
  invoke.mockImplementation(async (fn) => {
    if (fn === "submitVideo") return { data: { jobId: "job-1" } };
    if (fn === "getVideoStatus") return { data: statuses[Math.min(call++, statuses.length - 1)] };
    throw new Error(`unexpected function ${fn}`);
  });

  const events = [];
  const promise = generateSceneVideo({
    prompt: "a wide establishing shot",
    imageUrl: "https://example.com/frame.png",
    onProgress: (e) => events.push(e),
  });

  // Let the scripted statuses drain.
  for (let i = 0; i < statuses.length + 2; i++) {
    await vi.advanceTimersByTimeAsync(4000);
  }
  return { url: await promise, events };
}

describe("generateSceneVideo progress", () => {
  it("reports progress while the job is still running", async () => {
    const { url, events } = await runWithStatuses([
      { status: "processing", progress: 0.3 },
      { status: "processing", progress: 0.7 },
      { status: "done", url: "https://example.com/clip.mp4" },
    ]);

    expect(url).toBe("https://example.com/clip.mp4");
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.some((e) => e.status === "processing")).toBe(true);
  });

  it("distinguishes a QUEUED job from one that is actually generating", async () => {
    // The worker is strictly serial, so "waiting behind another job" and
    // "burning its own two minutes" are different things to tell a user.
    const { events } = await runWithStatuses([
      { status: "queued" },
      { status: "processing", progress: 0.5 },
      { status: "done", url: "https://example.com/clip.mp4" },
    ]);

    expect(events[0].status).toBe("queued");
    expect(events.some((e) => e.status === "processing")).toBe(true);
  });

  it("always reports elapsed time, even when the worker sends no percentage", async () => {
    // Replicate exposes no real completion percentage for these models, so
    // `progress` is frequently absent — elapsed time is then the only proof
    // the job is alive, and it must never be missing.
    const { events } = await runWithStatuses([
      { status: "processing" },
      { status: "done", url: "https://example.com/clip.mp4" },
    ]);

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(typeof e.elapsedMs).toBe("number");
      expect(e.elapsedMs).toBeGreaterThanOrEqual(0);
    }
    expect(events[0].progress).toBeNull();
  });

  it("emits a final done event so a caller can clear its spinner", async () => {
    const { events } = await runWithStatuses([
      { status: "processing", progress: 0.5 },
      { status: "done", url: "https://example.com/clip.mp4" },
    ]);

    const last = events[events.length - 1];
    expect(last.status).toBe("done");
    expect(last.progress).toBe(1);
  });

  it("carries the job id, so a log line can be matched to the on-screen run", async () => {
    const { events } = await runWithStatuses([
      { status: "processing" },
      { status: "done", url: "https://example.com/clip.mp4" },
    ]);
    expect(events.every((e) => e.jobId === "job-1")).toBe(true);
  });

  it("works without a callback — onProgress stays optional", async () => {
    invoke.mockImplementation(async (fn) => {
      if (fn === "submitVideo") return { data: { jobId: "job-2" } };
      return { data: { status: "done", url: "https://example.com/clip.mp4" } };
    });

    const promise = generateSceneVideo({ prompt: "no callback supplied" });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promise).resolves.toBe("https://example.com/clip.mp4");
  });
});
