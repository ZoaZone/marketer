// Keeps multi-scene videos coherent but varied: one shared "visual bible"
// (characters, wardrobe, setting, palette) plus a different camera shot per scene.
const SHOTS = [
  'wide establishing shot', 'medium shot from the side', 'tight close-up on the subject', 'over-the-shoulder angle',
  'low-angle hero shot', 'high overhead angle', 'tracking shot following the action', 'detail close-up of an object',
];

export const shotFor = index => SHOTS[index % SHOTS.length];

export async function buildStoryBible(script, generateText) {
  try {
    const text = await generateText({
      type: 'script',
      prompt: `Read this video script and describe, in 2 short sentences of plain text, the recurring look that must stay identical in every scene: the main characters (age, hair, face, clothing), the setting, time of day and colour palette. No preamble.\n\n${script}`,
      tone: 'Professional',
    });
    return (text || '').trim().slice(0, 500);
  } catch { return ''; }
}

export const framePrompt = ({ bible, shot, index, total, text }) =>
  `Shot ${index + 1} of ${total}, ${shot}. ${bible ? `Keep these identical across all shots: ${bible} ` : ''}This shot must look clearly different from the other shots (new framing, angle and action). Show only this moment: ${text}`;

export const clipPrompt = ({ bible, shot, text }) =>
  `${shot}. ${bible ? `Consistent look: ${bible} ` : ''}${text}. Natural, fluid camera movement and realistic motion. This is a new scene, not a repeat of the previous one.`;