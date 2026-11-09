// scheduler.js — lane-aware job scheduling for the render worker.
//
// Every job kind used to share one slot: index.js held a single `processing`
// boolean, so exactly one job of any kind ran at a time. That is correct for
// FFmpeg work — an encode already saturates this container's cores, and two
// concurrent encodes finish no sooner than two back to back — but it is badly
// wrong for the provider-backed kinds, which spend nearly all of their
// wall-clock *waiting* on an HTTP poll to Replicate or ElevenLabs while this
// process sits idle.
//
// The cost was visible in Movie Maker: a six-scene film generated six clips at
// roughly two to three minutes each, strictly one after another, so the user
// waited a quarter of an hour before assembly could even begin — and any music
// or dubbing job queued behind all of it.
//
// A scheduler groups job kinds into LANES, each with its own concurrency
// limit, and dispatches whatever the lanes currently allow.

/**
 * createScheduler({ laneOf, limits, run })
 *
 *   laneOf(job)  -> the lane name this job belongs to
 *   limits       -> { [lane]: maxConcurrent }
 *   run(job)     -> a promise; the job's slot is released when it settles
 *
 * Returns { enqueue, pump, running, queued }.
 *
 * `run` is never awaited by the caller: enqueue returns immediately, the same
 * fire-and-forget contract the POST routes already relied on. A rejected `run`
 * still releases its slot — a lane that leaked slots on failure would wedge
 * the worker after a handful of errors, which is strictly worse than the
 * single-slot behaviour this replaces.
 */
export function createScheduler({ laneOf, limits, run }) {
  const queue = [];
  const running = Object.fromEntries(Object.keys(limits).map((lane) => [lane, 0]));

  const limitFor = (lane) => (typeof limits[lane] === "number" ? limits[lane] : 1);

  /**
   * Removes and returns the first queued job whose lane still has a free
   * slot, or null when nothing can start right now.
   *
   * Scanning PAST a blocked job rather than stopping at it is the point: a
   * long film render holds the cpu lane for many minutes, and with a plain
   * shift() every clip, music and dubbing job queued behind it would wait out
   * that render for no reason at all.
   */
  function takeNextRunnable() {
    for (let i = 0; i < queue.length; i++) {
      const lane = laneOf(queue[i]);
      if (running[lane] === undefined) running[lane] = 0;
      if (running[lane] < limitFor(lane)) return queue.splice(i, 1)[0];
    }
    return null;
  }

  function pump() {
    for (;;) {
      const next = takeNextRunnable();
      if (!next) return;
      const lane = laneOf(next);
      running[lane] += 1;
      // run() is invoked synchronously, not deferred to a microtask: the
      // POST routes reply with the job id the moment they enqueue, and a job
      // that has been accepted should already be in flight (and already have
      // logged its `started` line) by the time that reply is written.
      let settled;
      try {
        settled = Promise.resolve(run(next));
      } catch (e) {
        settled = Promise.reject(e);
      }
      settled
        .catch(() => {}) // run() reports its own failures; never leak the slot
        .finally(() => {
          running[lane] -= 1;
          pump();
        });
    }
  }

  return {
    enqueue(job) {
      queue.push(job);
      pump();
    },
    pump,
    /** In-flight count for a lane (or every lane when called with no name). */
    running: (lane) => (lane ? running[lane] || 0 : { ...running }),
    /** How many jobs are waiting, not yet started. */
    queued: () => queue.length,
  };
}
