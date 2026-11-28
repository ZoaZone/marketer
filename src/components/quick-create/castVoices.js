import { VOICES } from "@/components/voice/VoiceOptions";

const SPEAKER = /^\s*([A-Za-z][A-Za-z0-9 .'\-]{0,24}):\s*/;

/** Lower-cased speaker name of a "MAYA: line", or "" for an unlabelled line. */
export const speakerOf = (line) => {
  const m = String(line || "").match(SPEAKER);
  return m ? m[1].trim().toLowerCase() : "";
};

/**
 * Gives every speaker in the scenes their own voice.
 * `overrides` are the user's explicit picks ({ speakerKey: voiceName }); every
 * other speaker gets the next voice nobody else has (starting from `base`, the
 * voice chosen in the Speech options), cycling only if there are more
 * characters than voices.
 * Returns { speakers: [{ key, label, voice }], voiceFor(line) }.
 */
export function castVoices(scenes, base, overrides = {}) {
  const order = [base, ...VOICES.map(([v]) => v).filter(v => v !== base)];
  const speakers = [];
  const used = new Set(Object.values(overrides));
  for (const scene of scenes) {
    const line = scene.dialogue || "";
    const key = speakerOf(line);
    if (!key || speakers.some(s => s.key === key)) continue;
    const label = line.match(SPEAKER)[1].trim();
    const voice = overrides[key] || order.find(v => !used.has(v)) || order[speakers.length % order.length];
    used.add(voice);
    speakers.push({ key, label, voice });
  }
  const voiceFor = (line) => speakers.find(s => s.key === speakerOf(line))?.voice || base;
  return { speakers, voiceFor };
}