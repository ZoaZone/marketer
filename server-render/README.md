# studio-render-worker

Standalone Node + FFmpeg video render worker. Completely independent of the
main Vite app — deployed separately, as its own service.

## Deploying on Railway

1. Create a new Railway service from this repo.
2. Set the service's **root directory** to `server-render`. Railway will
   detect the `Dockerfile` there and build it directly (FFmpeg and the
   DejaVu fonts it needs are installed in the image — no separate buildpack
   config needed).
3. Set the required environment variables (below) in the Railway service's
   **Variables** tab. Don't commit any of these — they're secrets.
4. Once deployed, confirm it's up with `GET /health` → `{ "ok": true }`.

## Required environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on. Railway sets this automatically; defaults to `8080` if unset. |
| `RENDER_SHARED_SECRET` | Required. Every `/render`, `/lane1-video`, `/music`, `/video`, `/dub-audio`, `/dub-video`, and `/jobs/:id` request must send this in the `x-render-secret` header, or it's rejected. The service refuses to start at all if this isn't set. |
| `BASE44_UPLOAD_URL` | The Base44 `uploadRenderResult` function's URL — where the finished MP4 (or, for a music job, the generated MP3; for a dub job, whichever the provider returns, plus a `.srt` sidecar when captions were burned in) gets POSTed once it completes. |
| `BASE44_UPLOAD_TOKEN` | Sent as `Authorization: Bearer <token>` on that upload request. |
| `REPLICATE_API_TOKEN` | Required for `/video` jobs, for `/dub-video` jobs requesting lip-sync, and for `/music` jobs only when `MUSIC_PROVIDER=replicate`. Used to create and poll the Replicate prediction. |
| `MUSIC_PROVIDER` | Optional, defaults to `elevenlabs`. `elevenlabs` uses ElevenLabs Music (`POST /v1/music`) — one synchronous request, vocals supported, up to 10 minutes per run. `replicate` selects the older MusicGen path (instrumental-only, much shorter usable clips). `suno` is accepted as a legacy alias for `elevenlabs`; Suno has no public API and that value only ever selected a stub that threw. |
| `ELEVENLABS_MUSIC_MODEL_ID` | Optional, defaults to `music_v1`. The ElevenLabs music model used for `/music` jobs. |
| `ELEVENLABS_MUSIC_OUTPUT_FORMAT` | Optional, defaults to `mp3_44100_128`. Passed through as the `output_format` query parameter. |
| `REPLICATE_MUSIC_MODEL` | Optional, defaults to `meta/musicgen`. Only used when `MUSIC_PROVIDER=replicate`. `owner/model` uses Replicate's model-by-name endpoint (always the latest version); `owner/model:versionhash` pins a specific version. |
| `VIDEO_MODEL_PRIMARY` | Optional, defaults to `kwaivgi/kling-v1.6-standard`. Tried first for `/video` jobs. |
| `VIDEO_MODEL_FALLBACK` | Optional, defaults to `minimax/video-01`. Tried if the primary model fails for any reason. |
| `ELEVENLABS_API_KEY` | Required for `/dub-audio` and `/dub-video` jobs, and for `/music` jobs unless `MUSIC_PROVIDER=replicate`. Used to create and poll the ElevenLabs dubbing job and download the result, and to call ElevenLabs Music. |
| `LIPSYNC_MODEL` | Optional, defaults to `sync/lipsync-2`. Used for `/dub-video` jobs with `lipSync: true`. |
| `PUBLIC_WORKER_URL` | Optional. This service's own public URL (e.g. `https://studio-production-9d0d.up.railway.app`), with no trailing slash. When set, `/dub-video` jobs with `lipSync: true` complete via a Replicate webhook (`POST /replicate-webhook/:jobToken`) instead of polling — the job is left `processing` and finalized asynchronously when Replicate calls back, freeing the single-item queue to run other jobs in the meantime. When unset, lip-sync falls back to the original polling behavior. |
| `REPLICATE_WEBHOOK_SIGNING_SECRET` | Optional. If set, incoming requests to `/replicate-webhook/:jobToken` must carry a valid Replicate/Svix webhook signature or they're rejected with 401. If unset, the route relies solely on the unguessable `:jobToken` in the path (Replicate can't send `x-render-secret`, so this route never requires it). |

## API

- `GET /health` — `{ ok: true }`. No auth required.
- `POST /render` — body is a project JSON (title/ratio/titleCard/scenes/musicUrl/musicVolume — see `render.js`). Requires `x-render-secret`. Returns `202 { jobId }` immediately; the actual render runs asynchronously, one job at a time.
- `POST /lane1-video` — body is `{ scenes: [{ imageUrl, seconds }], ratio, resolution, audioMode, voiceoverUrl, musicUrl }` (see `lane1.js`); at least one scene with an `imageUrl` is required. Requires `x-render-secret`. Returns `202 { jobId }` immediately. This is Lane 1's (Quick Create/Campaign Studio/Demo Video Maker) FFmpeg finishing step — no Replicate involved, just Ken Burns clips + concat + audio mux + a contrast/saturation/loudnorm finishing pass, encoded at `-preset slow -crf 20` toward ~8-10 Mbps with `+faststart`.
- `POST /music` — body is `{ prompt, durationSeconds, instrumental, lyrics, model_version }` (see `music.js`). Requires `x-render-secret`. Returns `202 { jobId }` immediately. `instrumental` defaults to `true`; pass `false` with `lyrics` to get a sung track (ElevenLabs provider only — MusicGen has no vocal synthesis). `durationSeconds` is clamped per provider: 3–600s on ElevenLabs, 5–30s on Replicate. `model_version` is Replicate-only.
- `POST /video` — body is `{ prompt, imageUrl, durationSeconds, aspectRatio }` (see `video.js`); at least one of `prompt`/`imageUrl` is required. Requires `x-render-secret`. Returns `202 { jobId }` immediately.
- `POST /dub-audio` — body is `{ sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning }` (see `dub.js`); `sourceUrl` and `targetLang` are required. Requires `x-render-secret`. Returns `202 { jobId }` immediately.
- `POST /dub-video` — body is `{ sourceUrl, targetLang, sourceLang, numSpeakers, dropBackgroundAudio, disableVoiceCloning, watermark, highestResolution, startTime, endTime, lipSync, burnCaptions, captionOverrides }` (see `dub.js`); `sourceUrl` and `targetLang` are required. Requires `x-render-secret`. Returns `202 { jobId }` immediately. On completion, `job.captionsUrl` is set to a `.srt` sidecar URL when `burnCaptions` was requested, otherwise `null`. When `PUBLIC_WORKER_URL` is set and `lipSync` is requested, the job sits at `status: "processing"` until Replicate's webhook finalizes it (or up to ~15 minutes, after which it's marked `error` as a safety fallback).
- `POST /replicate-webhook/:jobToken` — Replicate calls this back for a webhook-based `/dub-video` lip-sync job. No `x-render-secret` (Replicate can't send it) — the unguessable `:jobToken` is this route's auth, optionally reinforced by a signature check (see `REPLICATE_WEBHOOK_SIGNING_SECRET` above). Returns `401` on a bad signature, `404` for an unknown/already-resolved token, otherwise `200` immediately — the actual download/caption-burn/upload happens in the background after responding, so a slow finish doesn't hold the HTTP request open.
- `GET /jobs/:id` — requires `x-render-secret`. Shared by all job kinds. Returns the job record: `{ id, status, progress, url, captionsUrl, error, createdAt }`. `status` is one of `queued` / `processing` / `done` / `error`. Finished job records are deleted an hour after completion.

Render, music, video, and dub jobs share the same single-item queue — only one job of any kind runs at a time. A webhook-based `/dub-video` lip-sync job is the exception: once its Replicate prediction is submitted, the queue moves on immediately rather than waiting, and the job is finalized out-of-band when the webhook fires.
