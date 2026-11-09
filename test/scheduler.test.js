// Lane-aware job scheduling on the render worker.
//
// The worker ran exactly ONE job at a time across every kind. FFmpeg jobs
// genuinely want that — an encode already saturates the container — but the
// provider-backed kinds spend nearly all their wall-clock waiting on an HTTP
// poll to Replicate or ElevenLabs, and serialising those is what made a
// six-scene Movie Maker film take six consecutive two-to-three-minute clips
// before assembly could even begin.
//
// These tests pin the three properties that make the split correct and that
// a well-meaning simplification would quietly undo: FFmpeg stays serial,
// provider work overlaps up to its cap, and a long FFmpeg job never blocks
// provider work queued behind it.
import { describe, it, expect, vi } from "vitest";
import { createScheduler } from "../server-render/scheduler.js";

const laneOf = (job) => job.lane;

/** A job whose promise the test resolves by hand. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Builds a scheduler whose jobs never settle on their own, so the test can
 * observe exactly what is in flight at each point.
 */
function manualScheduler(limits) {
  const pending = new Map(); // id -> deferred
  const started = [];
  const scheduler = createScheduler({
    laneOf,
    limits,
    run: (job) => {
      started.push(job.id);
      const d = deferred();
      pending.set(job.id, d);
      return d.promise;
    },
  });
  // Settling a job and letting the scheduler's .finally() microtasks run.
  const finish = async (id, error) => {
    const d = pending.get(id);
    if (error) d.reject(error); else d.resolve();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  };
  return { scheduler, started, finish };
}

describe("lane scheduling", () => {
  it("runs FFmpeg jobs strictly one at a time", async () => {
    const { scheduler, started } = manualScheduler({ cpu: 1, provider: 3 });

    scheduler.enqueue({ id: "render-a", lane: "cpu" });
    scheduler.enqueue({ id: "render-b", lane: "cpu" });

    expect(started).toEqual(["render-a"]);
    expect(scheduler.running("cpu")).toBe(1);
  });

  it("overlaps provider jobs up to the lane's limit", async () => {
    const { scheduler, started } = manualScheduler({ cpu: 1, provider: 3 });

    for (const id of ["clip-1", "clip-2", "clip-3", "clip-4"]) {
      scheduler.enqueue({ id, lane: "provider" });
    }

    // Three in flight, the fourth waiting — not all four, and not one.
    expect(started).toEqual(["clip-1", "clip-2", "clip-3"]);
    expect(scheduler.running("provider")).toBe(3);
    expect(scheduler.queued()).toBe(1);
  });

  it("starts the next queued job as soon as a slot frees", async () => {
    const { scheduler, started, finish } = manualScheduler({ cpu: 1, provider: 2 });

    for (const id of ["clip-1", "clip-2", "clip-3"]) {
      scheduler.enqueue({ id, lane: "provider" });
    }
    expect(started).toEqual(["clip-1", "clip-2"]);

    await finish("clip-1");
    expect(started).toEqual(["clip-1", "clip-2", "clip-3"]);
    expect(scheduler.queued()).toBe(0);
  });

  it("does not let a long FFmpeg render block clips queued behind it", async () => {
    // The head-of-line case the old single-slot queue got wrong: a film
    // render holds the cpu lane for many minutes, and with a plain shift()
    // every clip behind it waited that render out for no reason.
    const { scheduler, started } = manualScheduler({ cpu: 1, provider: 3 });

    scheduler.enqueue({ id: "render-a", lane: "cpu" });
    scheduler.enqueue({ id: "render-b", lane: "cpu" });   // blocked behind render-a
    scheduler.enqueue({ id: "clip-1", lane: "provider" }); // must NOT be blocked

    expect(started).toContain("clip-1");
    expect(started).not.toContain("render-b");
  });

  it("releases a slot when a job fails, so failures cannot wedge a lane", async () => {
    // A lane that leaked slots on failure would stop accepting work after a
    // handful of errors — strictly worse than the single-slot behaviour this
    // replaces.
    const { scheduler, started, finish } = manualScheduler({ cpu: 1, provider: 1 });

    scheduler.enqueue({ id: "clip-1", lane: "provider" });
    scheduler.enqueue({ id: "clip-2", lane: "provider" });
    expect(started).toEqual(["clip-1"]);

    await finish("clip-1", new Error("Replicate said no"));
    expect(started).toEqual(["clip-1", "clip-2"]);
    expect(scheduler.running("provider")).toBe(1);
  });

  it("keeps the lanes independent — a full provider lane still admits a render", async () => {
    const { scheduler, started } = manualScheduler({ cpu: 1, provider: 2 });

    scheduler.enqueue({ id: "clip-1", lane: "provider" });
    scheduler.enqueue({ id: "clip-2", lane: "provider" });
    scheduler.enqueue({ id: "render-a", lane: "cpu" });

    expect(started).toEqual(["clip-1", "clip-2", "render-a"]);
  });

  it("never starts a job twice", async () => {
    const { scheduler, started, finish } = manualScheduler({ cpu: 1, provider: 2 });

    scheduler.enqueue({ id: "clip-1", lane: "provider" });
    scheduler.enqueue({ id: "clip-2", lane: "provider" });
    await finish("clip-1");
    await finish("clip-2");

    expect(started).toEqual(["clip-1", "clip-2"]);
    expect(scheduler.running()).toEqual({ cpu: 0, provider: 0 });
  });

  it("defaults an unknown lane to a single slot rather than unbounded", async () => {
    const { scheduler, started } = manualScheduler({ provider: 2 });

    scheduler.enqueue({ id: "x-1", lane: "unconfigured" });
    scheduler.enqueue({ id: "x-2", lane: "unconfigured" });

    expect(started).toEqual(["x-1"]);
  });

  it("dispatches without the caller awaiting run()", async () => {
    // enqueue() is fire-and-forget: every POST route calls it and responds
    // with the job id immediately.
    const run = vi.fn(() => new Promise(() => {}));
    const scheduler = createScheduler({ laneOf, limits: { provider: 1 }, run });

    scheduler.enqueue({ id: "clip-1", lane: "provider" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
