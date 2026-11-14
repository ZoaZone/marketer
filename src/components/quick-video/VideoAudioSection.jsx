import { useState } from "react";
import { Mic, Music, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { generateText, generateVoiceover, uploadFile } from "@/utils/lane1";
import { generateMusic, submitRender, getRenderStatus } from "@/utils/lane2";
import VoiceOptions, { useVoiceOptions, LANGUAGES } from "@/components/voice/VoiceOptions";
import LibraryPickButton from "@/components/media-editor/LibraryPickButton";

/**
 * Voice-over + music for Quick Video. "Create preview" mixes both under the
 * generated clips on the render worker; the mixed video is what the user
 * previews and then saves.
 */
export default function VideoAudioSection({ clipUrls, clipSeconds, aspect, topic, voiceStyle, disabled, onMixed }) {
  const [script, setScript] = useState("");
  const [voiceUrl, setVoiceUrl] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [vo, setVo] = useVoiceOptions();
  const langName = (LANGUAGES.find(([c]) => c === vo.lang) || [])[1] || "English";
  const total = clipSeconds.reduce((a, b) => a + b, 0);

  const run = async (name, fn) => {
    setBusy(name); setError("");
    try { await fn(); } catch (e) { setError(e?.message || "Something went wrong."); }
    setBusy("");
  };

  const writeScript = () => run("write", async () => {
    const t = await generateText({
      type: "script", tone: "Professional",
      prompt: `Write a short spoken voice-over of about ${Math.max(10, Math.round(total * 2.2))} words for a ${total}-second video about: ${topic}. ${voiceStyle ? `Voice/tone: ${voiceStyle}.` : ""} Write it in ${langName}. Plain spoken text only, no labels or directions.`,
    });
    setScript(String(t || "").trim());
  });

  const makeVoice = () => run("voice", async () => {
    const blob = await generateVoiceover(script, vo);
    if (!blob) throw new Error("Write the voice-over text first.");
    setVoiceUrl(await uploadFile(new File([blob], "voiceover.mp3", { type: blob.type || "audio/mpeg" })));
  });

  const makeMusic = () => run("music", async () => {
    const r = await generateMusic({ prompt: `Background music for a short video about: ${topic}`, durationSeconds: total, instrumental: true });
    if (!r?.url) throw new Error("Music was not produced.");
    setMusicUrl(r.url);
  });

  const uploadMusic = (file) => file && run("music", async () => setMusicUrl(await uploadFile(file)));

  const mix = () => run("mix", async () => {
    setProgress(0);
    const scenes = clipUrls.map((u, i) => ({ id: i + 1, text: "", videoUrl: u, duration: clipSeconds[i], clips: [{ videoUrl: u, duration: clipSeconds[i] }] }));
    const jobId = await submitRender({ scenes, ratio: aspect, resolution: "720p", voiceoverUrl: voiceUrl || undefined, musicUrl: musicUrl || undefined });
    const started = Date.now();
    for (;;) {
      if (Date.now() - started > 20 * 60 * 1000) throw new Error("Mixing timed out. Please try again.");
      await new Promise(r => setTimeout(r, 4000));
      const job = await getRenderStatus(jobId);
      if (typeof job?.progress === "number") setProgress(job.progress);
      if (job?.status === "done") { onMixed({ url: job.url, voiceUrl, musicUrl }); return; }
      if (job?.status === "error") throw new Error(job.error || "Mixing failed.");
    }
  });

  const working = !!busy || disabled;
  const btn = "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted/20 disabled:opacity-50";
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Mic className="w-4 h-4 text-fuchsia-400" />Voice-over &amp; music</h3>
      <VoiceOptions opts={vo} onChange={setVo} disabled={working} />
      <textarea value={script} onChange={e => setScript(e.target.value)} rows={3} placeholder="Voice-over text (write your own, or let AI write it)"
        className="w-full rounded-lg border border-border bg-background p-3 text-sm resize-none" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={working} onClick={writeScript}>
          {busy === "write" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}Write with AI
        </button>
        <button type="button" className={btn} disabled={working || !script.trim()} onClick={makeVoice}>
          {busy === "voice" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}{voiceUrl ? "Regenerate voice" : "Generate voice"}
        </button>
        <button type="button" className={btn} disabled={working} onClick={makeMusic}>
          {busy === "music" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />}{musicUrl ? "Regenerate AI music" : "Generate AI music"}
        </button>
        <label className={`${btn} cursor-pointer`}><Upload className="w-3.5 h-3.5" />Upload music
          <input type="file" accept="audio/*" className="hidden" disabled={working} onChange={e => { uploadMusic(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <LibraryPickButton kinds={["audio"]} multi={false} label="Music from library" disabled={working} className={btn}
          onPick={items => items[0]?.file_url && setMusicUrl(items[0].file_url)} />
      </div>
      {voiceUrl && <div><p className="text-[11px] text-muted-foreground mb-1">Voice-over</p><audio src={voiceUrl} controls className="w-full h-9" /></div>}
      {musicUrl && <div><p className="text-[11px] text-muted-foreground mb-1">Music</p><audio src={musicUrl} controls className="w-full h-9" /></div>}
      <button type="button" onClick={mix} disabled={working || (!voiceUrl && !musicUrl)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm font-semibold disabled:opacity-50">
        {busy === "mix" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy === "mix" ? `Mixing preview… ${Math.round((progress || 0) * (progress > 1 ? 1 : 100))}%` : "Create preview with voice & music"}
      </button>
      <p className="text-[11px] text-muted-foreground">The preview above is replaced with the mixed video, so you hear exactly what you save.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}