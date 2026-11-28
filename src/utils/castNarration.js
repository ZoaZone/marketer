import { generateText, generateVoiceover } from "@/utils/lane1";
import { concatAudioBlobs } from "@/utils/audioConcat";
import { castVoices } from "@/components/quick-create/castVoices";

const NUMBERED = /^\s*(?:scene\s*)?(\d{1,2})\s*[|.):\-]\s*(.+)$/i;
const LABEL = /^\s*[A-Za-z][A-Za-z0-9 .'\-]{0,24}:\s*/;

const savedVoiceOpts = () => {
  try { return { lang: "en", voice: "river", ...JSON.parse(localStorage.getItem("ds_voice_opts") || "{}") }; } catch { return { lang: "en", voice: "river" }; }
};

const clean = (t) => String(t || "").replace(/\*+/g, "").replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();

/**
 * Multi-voice voice-over for auto-generated videos (Quick Create auto mode,
 * Create Demo). Rewrites the scenes as lines spoken by named characters, gives
 * each character a distinct voice, and joins the lines into ONE track (the
 * renderer takes a single voice-over per video).
 *
 * Returns an audio Blob, or null when the content has only one speaker (or the
 * rewrite could not be parsed) — callers then keep their single-narrator path.
 */
export async function castNarration(sceneTexts) {
  const opts = savedVoiceOpts();
  const numbered = sceneTexts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const raw = await generateText({
    type: "script",
    prompt:
      `Turn these ${sceneTexts.length} scenes into spoken lines, exactly one short line per scene, in the same language as the scenes. ` +
      `Only use more than one speaker if the scenes themselves explicitly name or describe several distinct characters talking; ` +
      `then give each a different name. Never invent characters. For plain narration, a product description or a single presenter, ` +
      `keep the original wording and use ONE speaker named NARRATOR. ` +
      `Format every line as "1| NAME: words". No stage directions, no quotation marks, nothing else.\n\n${numbered}`,
    tone: "Conversational",
  });

  const lines = new Array(sceneTexts.length).fill("");
  for (const row of String(raw || "").split(/\r?\n/)) {
    const m = row.match(NUMBERED);
    const i = m ? Number(m[1]) - 1 : -1;
    if (i >= 0 && i < lines.length) lines[i] = clean(m[2]);
  }
  if (lines.filter(Boolean).length < Math.ceil(lines.length / 2)) return null;

  const cast = castVoices(lines.map(dialogue => ({ dialogue })), opts.voice);
  if (cast.speakers.length < 2) return null;

  const blobs = [];
  for (const line of lines.filter(Boolean)) {
    const blob = await generateVoiceover(clean(line.replace(LABEL, "")), { lang: opts.lang, voice: cast.voiceFor(line) });
    if (blob) blobs.push(blob);
  }
  return blobs.length ? concatAudioBlobs(blobs, 0.3) : null;
}