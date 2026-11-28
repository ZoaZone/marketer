import { useCallback, useEffect, useRef, useState } from "react";
import recordSignedInTab from "@/components/movie-maker/recordSignedInTab";
import { base44 } from "@/api/base44Client";
import uploadVideoMedia from "@/components/quick-create/uploadVideoMedia";
import {
  generateText, generateVoiceover, generateMusic,
  submitRender, getRenderStatus, submitCapture, getCaptureStatus,
} from "@/utils/lane2";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CAPTURE_POLL_MS = 3000;
// The capture worker runs ONE job at a time (headless Chromium + video
// encoding is too heavy to parallelise on one instance), so a capture can
// legitimately sit behind another for several minutes. A 5-minute client
// timeout expired while the job was still queued and was reported to the
// user as a failure — this now matches the render worker's own timeout.
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000; // capture worker's own cap defaults to 60s; this covers queueing + ffmpeg + upload overhead
const RENDER_POLL_MS = 3000;
const RENDER_TIMEOUT_MS = 20 * 60 * 1000; // matches MovieMaker.jsx's own render timeout

/**
 * useAutoDemoFromUrl(user) — "Auto Demo from URL": one call that turns a
 * public URL into a finished, narrated demo video saved to the user's
 * Media Library, with no manual scene editing in between.
 *
 * Pipeline: submitCapture/getCaptureStatus (server-capture/ — records a
 * walkthrough, extracts pageInfo) -> generateText (writes a narration
 * script from the captured title/headings/meta, same call shape
 * DemoVideoMaker.jsx uses for its own script step) -> generateVoiceover ->
 * generateMusic (best-effort; the demo still assembles without it) ->
 * submitRender/getRenderStatus (the captured video becomes a single
 * `videoUrl` scene, narrated by the generated voiceover — this only works
 * because the render worker now accepts video-only scenes) ->
 * base44.entities.ContentAsset.create (the same Media Library save every
 * other video-producing page in this app uses).
 *
 * Everything here runs under the calling user's own Base44 session (the
 * Base44 submitCapture proxy stamps the caller's own verified user id onto
 * every job for rate-limiting/concurrency purposes — nothing to do here).
 *
 * Phase 2 (optional authenticated capture): pass `credentials` to
 * generate() to have the worker log into the target first. This is a
 * one-time, explicit, consent-gated action — see MovieMaker.jsx's "Auto
 * Demo from URL" card for the actual consent UI. This hook enforces that
 * gate too, independent of whatever the calling UI does: if `credentials`
 * is given, `consented` must be exactly `true` or generate() refuses to
 * even submit the capture. Credentials are held in a local variable here
 * only long enough to pass to submitCapture() and are never put into any
 * hook state (so they can't leak into a re-render, a dev-tools state
 * inspector, or this hook's own error messages) — a capture that hits a
 * login wall it can't get past surfaces phase "login_required" (no
 * credentials were usable/given) or "login_failed" (credentials were given
 * but didn't work), never the credentials themselves.
 *
 * Current-session capture records the tab selected by the user, without moving its login session.
 * `phase` is one of: idle | capturing | recording | writing_script | generating_voice |
 * generating_music | assembling | saving | done | error | login_required |
 * login_failed.
 */
export function useAutoDemoFromUrl(user) {
  const [phase, setPhase] = useState("idle");
  const [stepLabel, setStepLabel] = useState("");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [result, setResult] = useState(null); // { assetId, fileUrl, title }
  const runRef = useRef(null);
  const stopRef = useRef(null);
  useEffect(() => () => runRef.current?.abort(), []);

  const reset = useCallback(() => {
    runRef.current?.abort();
    setPhase('idle');
    setStepLabel('');
    setPercent(0);
    setError('');
    setWarnings([]);
    setResult(null);
  }, []);

  const stopRecording = useCallback(() => stopRef.current?.(), []);

  const generate = useCallback(async (rawUrl, { credentials, consented, useCurrentSession } = {}) => {
    if (!user?.email) return;
    const url = String(rawUrl || '').trim();
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error();
    } catch {
      setPhase('error');
      setError(url ? 'Enter a valid http(s) URL.' : 'Enter a URL first.');
      return;
    }
    if (!useCurrentSession && credentials && consented !== true) {
      setPhase('error');
      setError("Please confirm you're authorized to log in with these credentials first.");
      return;
    }

    runRef.current?.abort();
    const run = new AbortController();
    runRef.current = run;
    const { signal } = run;
    setPhase('capturing');
    setStepLabel(useCurrentSession ? 'Choose your signed-in tab in the share picker…' : credentials ? 'Starting the walkthrough capture (logging in first)…' : 'Starting the walkthrough capture…');
    setPercent(0);
    setError('');
    setWarnings([]);
    setResult(null);

    try {
      let capture;
      if (useCurrentSession) {
        const { file, durationSeconds } = await recordSignedInTab({ signal, stopRef, onRecording: () => {
          setPhase('recording');
          setStepLabel('Recording your tab. Finish here or stop sharing in your browser.');
        } });
        if (signal.aborted) return;
        setPhase('capturing');
        setStepLabel('Uploading your walkthrough…');
        capture = { videoUrl: await uploadVideoMedia(file), durationSeconds };
      } else {
        const captureId = await submitCapture(credentials ? { url, credentials } : { url });
        const captureStartedAt = Date.now();
        for (;;) {
          if (signal.aborted) return;
          if (Date.now() - captureStartedAt > CAPTURE_TIMEOUT_MS) throw new Error('Capturing the walkthrough timed out. Please try again.');
          await sleep(CAPTURE_POLL_MS);
          if (signal.aborted) return;
          const job = await getCaptureStatus(captureId);
          if (signal.aborted) return;
          if (typeof job?.stepIndex === 'number' && typeof job?.stepTotal === 'number' && job.stepTotal > 0) {
            setStepLabel(`Capturing walkthrough… step ${Math.min(job.stepIndex + 1, job.stepTotal)} of ${job.stepTotal}`);
          }
          if (typeof job?.percent === 'number') setPercent(job.percent / 100);
          if (job?.status === 'done') { capture = job; break; }
          if (job?.status === 'login_required') {
            setPhase('login_required');
            setError(job.error || "This page requires a login and can't be captured yet.");
            return;
          }
          if (job?.status === 'login_failed') {
            setPhase('login_failed');
            setError('Password sign-in failed. For Google, email codes or magic links, sign in on the site first, then choose “Use my current session” to record that tab.');
            return;
          }
          if (job?.status === 'error') throw new Error(job.error || 'Capturing the walkthrough failed.');
        }
      }
      if (signal.aborted) return;

      const pageInfo = capture.pageInfo || {};
      const captureVideoUrl = capture.videoUrl;
      const captureSeconds = useCurrentSession ? Math.max(1, Math.round(capture.durationSeconds)) : Math.max(5, Math.round(capture.durationSeconds || 30));
      if (!captureVideoUrl) throw new Error("The capture finished but produced no video.");

      // Same generateText({ type: "video_script", ... }) call DemoVideoMaker
      // uses for its own script step, fed by the literal captured
      // title/headings/meta instead of an LLM website-scan summary.
      setPhase("writing_script");
      setStepLabel("Writing narration script…");
      const headingsText = (pageInfo.headings || []).slice(0, 8).join("; ");
      const scriptPrompt = [
        useCurrentSession
          ? `Write a general demo introduction that can be read aloud in ${captureSeconds} seconds. Do not claim specific features or actions not supplied below; the footage was not analyzed.`
          : 'Write a short, engaging voiceover script (about 60–90 seconds when read aloud) for a demo video introducing this website/product.',
        'Use plain prose, no scene labels, no markdown, no preamble.',
        `URL: ${url}`,
        `Page title: ${pageInfo.title || "N/A"}`,
        `Key sections: ${headingsText || "N/A"}`,
        `Description: ${pageInfo.description || "N/A"}`,
      ].join("\n");
      let script = "";
      let voiceUrl;
      try {
        script = await generateText({ type: "video_script", prompt: scriptPrompt, tone: "Professional", section: "capture", externalOnly: useCurrentSession === true });
        if (!script?.trim()) throw new Error("Couldn't write a narration script for this page.");
        if (signal.aborted) return;

        setPhase("generating_voice");
        setStepLabel("Generating voiceover…");
        const voiceBlob = await generateVoiceover(script, useCurrentSession ? { provider: "elevenlabs" } : undefined);
        if (signal.aborted) return;
        if (!voiceBlob) throw new Error("Couldn't generate a voiceover for this script.");
        voiceUrl = await uploadVideoMedia(new File([voiceBlob], `auto-demo-voice-${Date.now()}.mp3`, { type: voiceBlob.type || "audio/mpeg" }));
      } catch (e) {
        if (signal.aborted) return;
        if (!useCurrentSession) throw e;
        const detail = e?.response?.data?.error || e?.message || "Narration is unavailable.";
        setWarnings(prev => [...prev, `Capture succeeded. Saving without narration: ${detail}`]);
      }
      if (signal.aborted) return;

      setPhase("generating_music");
      setStepLabel("Adding background music…");
      let musicUrl;
      try {
        const music = await generateMusic({
          prompt: `Background music for a product demo video about ${pageInfo.title || url}`,
          durationSeconds: Math.min(60, Math.max(15, captureSeconds)),
          instrumental: true,
        });
        musicUrl = music?.url;
      } catch (_e) {
        // Non-fatal — the demo still assembles fine with narration alone.
        setWarnings((prev) => [...prev, "Background music generation failed — the demo will play without it."]);
      }
      if (signal.aborted) return;

      setPhase("assembling");
      setStepLabel("Assembling the demo video…");
      setPercent(0);
      const title = pageInfo.title || url;
      const renderJobId = await submitRender({
        title,
        ratio: "16:9",
        titleCard: { enabled: true, text: title, seconds: 4 },
        scenes: [{ videoUrl: captureVideoUrl, subtitle: "", seconds: captureSeconds, voiceUrl }],
        musicUrl: musicUrl || undefined,
      });

      let finalVideoUrl = null;
      const renderStartedAt = Date.now();
      for (;;) {
        if (signal.aborted) return;
        if (Date.now() - renderStartedAt > RENDER_TIMEOUT_MS) {
          throw new Error("Assembling the demo video timed out. Please try again.");
        }
        await sleep(RENDER_POLL_MS);
        if (signal.aborted) return;
        const job = await getRenderStatus(renderJobId);
        if (signal.aborted) return;
        if (typeof job?.progress === "number") setPercent(job.progress);
        if (job?.status === "done") { finalVideoUrl = job.url; break; }
        if (job?.status === "error") throw new Error(job.error || "Assembling the demo video failed.");
        // else "queued" / "processing" — keep polling
      }
      if (signal.aborted) return;
      if (!finalVideoUrl) throw new Error("The render finished but returned no video.");

      setPhase("saving");
      setStepLabel("Saving to Media Library…");
      const asset = await base44.entities.ContentAsset.create({
        type: "video",
        title: `Demo walkthrough — ${title}`,
        file_url: finalVideoUrl,
        ai_generated: true,
        prompt_used: script.slice(0, 500),
        status: "ready",
      });

      if (signal.aborted) return;
      setResult({ assetId: asset.id, fileUrl: finalVideoUrl, title: asset.title });
      setPhase("done");
      setStepLabel("Done — saved to Media Library.");
      setPercent(1);
    } catch (e) {
      if (signal.aborted) return;
      setPhase("error");
      setError(useCurrentSession && e?.name === 'NotAllowedError' ? 'Tab sharing was canceled or blocked. Open the published studio in its own browser tab and try again.' : e?.response?.data?.error || e?.message || 'Auto Demo failed.');
    } finally {
      if (runRef.current === run) runRef.current = null;
    }
  }, [user]);

  return { phase, stepLabel, percent, error, warnings, result, generate, reset, cancel: reset, stopRecording };
}