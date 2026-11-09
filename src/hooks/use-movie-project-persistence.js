import { useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { mine } from "@/utils/scope";

const DEBOUNCE_MS = 1500;

/**
 * useMovieProjectPersistence(user) — autosave/load for a single MovieMaker
 * project, backed by the MovieProject entity.
 *
 * - scheduleSave(snapshot): debounced (1.5s) — call on every meaningful
 *   state change; rapid-fire calls coalesce into one write. Best-effort:
 *   every failure is swallowed and only ever reflected in `status`, never
 *   thrown, so a flaky save can't break the UI the user is actively using.
 * - load(explicitId?): call once on mount. Loads the given project id if
 *   provided (e.g. from ?projectId=), otherwise the user's most-recently-
 *   saved one; returns null if neither exists (fresh session). Always
 *   scoped to the calling user via mine() — an id for a project you don't
 *   own resolves to nothing, never someone else's data.
 * - newProject(): detaches from the current record (and drops any pending
 *   save) without deleting it — the next scheduleSave() creates a new row.
 *
 * `status` is "idle" | "saving" | "saved" | "error" — drive a small
 * "Saved ✓ / Saving…" indicator off it directly.
 */
export function useMovieProjectPersistence(user) {
  const [projectId, setProjectId] = useState(null);
  const [status, setStatus] = useState("idle");
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(null);

  const persist = useCallback(async (snapshot) => {
    if (!user?.email) return;
    if (savingRef.current) {
      // A write is already in flight — remember only the latest snapshot
      // and let that write's completion pick it up, rather than firing two
      // overlapping updates at the same record.
      pendingRef.current = snapshot;
      return;
    }
    savingRef.current = true;
    setStatus("saving");
    try {
      const payload = { ...snapshot, last_saved_at: new Date().toISOString() };
      if (projectId) {
        await base44.entities.MovieProject.update(projectId, payload);
      } else {
        const created = await base44.entities.MovieProject.create(payload);
        setProjectId(created.id);
      }
      setStatus("saved");
    } catch (_e) {
      // Never throw into the UI — a failed autosave is not the user's
      // problem to handle mid-flow, the indicator just reflects it.
      setStatus("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        persist(next);
      }
    }
  }, [projectId, user?.email]);

  const scheduleSave = useCallback((snapshot) => {
    if (!user?.email) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { persist(snapshot); }, DEBOUNCE_MS);
  }, [persist, user?.email]);

  const load = useCallback(async (explicitId) => {
    if (!user?.email) return null;
    try {
      let record = null;
      if (explicitId) {
        const rows = await base44.entities.MovieProject.filter({ id: explicitId, ...mine(user) });
        record = rows[0] || null;
      }
      if (!record) {
        const rows = await base44.entities.MovieProject.filter(mine(user), "-last_saved_at", 1);
        record = rows[0] || null;
      }
      if (!record) return null;

      setProjectId(record.id);
      let scenes = [];
      try { scenes = record.scenes ? JSON.parse(record.scenes) : []; } catch (_e) { scenes = []; }

      return {
        id: record.id,
        title: record.title || "",
        genre: record.genre || "Drama",
        language: record.language || "English",
        storyPrompt: record.story_outline || "",
        script: record.script || "",
        step: typeof record.step === "number" ? record.step : 0,
        scenes,
        musicUrl: record.music_url || "",
        titleCard: record.title_card_enabled ?? true,
        videoUrl: record.final_video_url || "",
      };
    } catch (_e) {
      return null;
    }
  }, [user?.email]);

  const newProject = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = null;
    setProjectId(null);
    setStatus("idle");
  }, []);

  return { projectId, status, scheduleSave, load, newProject };
}
