import { VOICES } from "@/components/voice/VoiceOptions";

const LABEL = /^\s*([A-Za-z][A-Za-z0-9 .'\-]{0,24}):\s*(\S.*)$/;
const keyOf = (name) => String(name || "").trim().toLowerCase();

/**
 * Spoken lines of a scene: the explicit Dialogue rows when present, otherwise
 * "NAME: line" rows found in the scene text (needs 2+ to count as dialogue).
 * Each: { speaker, text, voiceId }.
 */
export function sceneLines(scene) {
  const rows = (scene.dialogue || []).filter(l => l.text?.trim());
  if (rows.length) return rows.map(l => ({ speaker: l.speaker, text: l.text, voiceId: l.voiceId }));
  const labeled = String(scene.text || "").split(/\n+/).map(s => s.match(LABEL)).filter(Boolean);
  if (labeled.length < 2) return [];
  return labeled.map(m => ({ speaker: m[1], text: m[2], voiceId: "" }));
}

/** One distinct built-in voice per speaker across the whole film, by first appearance. */
export function castSpeakers(scenes) {
  const names = VOICES.map(([v]) => v);
  const map = {};
  let n = 0;
  for (const s of scenes) {
    for (const l of sceneLines(s)) {
      const k = keyOf(l.speaker);
      if (k && !map[k]) map[k] = names[n++ % names.length];
    }
  }
  return (speaker) => map[keyOf(speaker)];
}