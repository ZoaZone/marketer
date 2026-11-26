// audioConcat.js — concatenates several audio blobs into one playable WAV
// blob, with a short silence gap between each. Built for Movie Maker's
// per-scene dialogue: each character's line is synthesized separately (so
// each can use its own ElevenLabs voice), but the scene still needs ONE
// combined narration track for the existing scene.voiceUrl pipeline
// (generateSceneVoiceover / assembleMovie / the render worker's
// buildSceneClip, none of which know about multiple lines).

function encodeWav(channelData, sampleRate) {
  const numChannels = channelData.length;
  const length = channelData[0].length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeStr(36, "data"); view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Decodes and concatenates audio blobs in order, with `gapSeconds` of
 * silence between each (default 0.4s — enough to read as a beat between
 * two characters' lines without feeling like a dropout). Falsy entries in
 * `blobs` (a line that failed to synthesize) are skipped rather than
 * failing the whole concatenation. Returns null if nothing usable was
 * passed in.
 */
export async function concatAudioBlobs(blobs, gapSeconds = 0.4) {
  const valid = (blobs || []).filter(Boolean);
  if (!valid.length) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buffers = [];
    for (const b of valid) {
      try { buffers.push(await ctx.decodeAudioData(await b.arrayBuffer())); }
      catch { /* an unreadable line is skipped rather than failing the whole scene */ }
    }
    if (!buffers.length) return null;
    if (buffers.length === 1) return encodeWav([buffers[0].getChannelData(0)], buffers[0].sampleRate);

    const sampleRate = buffers[0].sampleRate;
    const numChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
    const gapSamples = Math.round(gapSeconds * sampleRate);
    const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0) + gapSamples * (buffers.length - 1);
    const out = Array.from({ length: numChannels }, () => new Float32Array(totalSamples));
    let cursor = 0;
    buffers.forEach((buf, i) => {
      for (let ch = 0; ch < numChannels; ch++) {
        const data = buf.numberOfChannels > ch ? buf.getChannelData(ch) : buf.getChannelData(0);
        out[ch].set(data, cursor);
      }
      cursor += buf.length + (i < buffers.length - 1 ? gapSamples : 0);
    });
    return encodeWav(out, sampleRate);
  } finally {
    ctx.close().catch(() => {});
  }
}
