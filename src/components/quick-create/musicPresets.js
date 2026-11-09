// Built-in background music library. Tracks are synthesised in the browser
// (Web Audio), so they are royalty-free, instant and need no external service.
const mtof = m => 440 * 2 ** ((m - 69) / 12);

export const MUSIC_PRESETS = [
  { id: 'cinematic', label: 'Cinematic', hint: 'Slow, emotional pads', bpm: 60, chords: [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]], wave: 'sine', attack: 1.2 },
  { id: 'uplifting', label: 'Uplifting', hint: 'Bright and positive', bpm: 100, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], wave: 'triangle', attack: 0.3, arp: true },
  { id: 'calm', label: 'Calm', hint: 'Soft and relaxed', bpm: 70, chords: [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 68]], wave: 'sine', attack: 1.5 },
  { id: 'energetic', label: 'Energetic', hint: 'Driving beat', bpm: 120, chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], wave: 'triangle', attack: 0.05, arp: true, pulse: true },
  { id: 'suspense', label: 'Suspense', hint: 'Dark and tense', bpm: 56, chords: [[45, 48, 51], [45, 48, 52], [44, 47, 51], [45, 48, 51]], wave: 'sawtooth', attack: 2, quiet: true },
];

export const defaultPresetFor = cinematic => (cinematic ? 'cinematic' : 'uplifting');

/** Renders a preset to an AudioBuffer of the requested length (seconds). */
export async function renderPresetBuffer(id, seconds) {
  const p = MUSIC_PRESETS.find(x => x.id === id) || MUSIC_PRESETS[0];
  const sr = 22050, total = Math.max(5, Math.min(120, seconds));
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sr), sr);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.6, Math.min(2, total / 4));
  master.gain.setValueAtTime(0.6, Math.max(0, total - 2));
  master.gain.linearRampToValueAtTime(0, total);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = p.wave === 'sawtooth' ? 700 : 3500;
  master.connect(filter).connect(ctx.destination);
  const note = (freq, start, dur, type, peak, attack) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    const a = Math.min(attack, dur / 2);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + a);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g).connect(master);
    osc.start(start); osc.stop(start + dur + 0.05);
  };
  const beat = 60 / p.bpm, bar = beat * 4, level = p.quiet ? 0.07 : 0.11;
  for (let b = 0; b * bar < total; b++) {
    const chord = p.chords[b % p.chords.length], t = b * bar;
    chord.forEach(m => note(mtof(m), t, bar + 0.5, p.wave, level, p.attack));
    note(mtof(chord[0] - 12), t, bar + 0.3, 'sine', 0.22, 0.1);
    if (p.arp) for (let i = 0; i < 8; i++) note(mtof(chord[i % chord.length] + 12), t + i * beat / 2, beat * 0.9, 'triangle', 0.08, 0.01);
    if (p.pulse) for (let i = 0; i < 8; i++) note(mtof(chord[0] - 12), t + i * beat / 2, beat * 0.4, 'triangle', 0.16, 0.01);
  }
  return ctx.startRendering();
}

/** Renders a preset to a 16-bit WAV file blob. */
export async function renderPresetBlob(id, seconds) {
  const buffer = await renderPresetBuffer(id, seconds);
  const data = buffer.getChannelData(0), view = new DataView(new ArrayBuffer(44 + data.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, data.length * 2, true);
  data.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true));
  return new Blob([view], { type: 'audio/wav' });
}