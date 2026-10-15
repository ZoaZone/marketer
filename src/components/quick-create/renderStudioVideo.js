import { drawStudioVideoGraphics } from '@/components/quick-create/studioVideoGraphics';

function loadMedia(element, event, src) {
  return new Promise((resolve, reject) => {
    element.addEventListener(event, () => resolve(element), { once: true });
    element.addEventListener('error', () => reject(new Error('Could not load video or logo for branding.')), { once: true });
    element.src = src;
  });
}

export default async function renderStudioVideo({ url, logoUrl, text, hasAudio, musicUrl, onProgress, dims }) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video graphics export needs a supported browser such as Chrome or Edge.');
  const audioContext = hasAudio || musicUrl ? new (window.AudioContext || window.webkitAudioContext)() : null;
  if (audioContext) await audioContext.resume();
  let video, recorder, stream, objectUrl, animation;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not download the generated video for branding.');
    objectUrl = URL.createObjectURL(await response.blob());
    video = document.createElement('video'); video.playsInline = true; video.preload = 'auto'; video.muted = !hasAudio;
    await loadMedia(video, 'loadeddata', objectUrl);
    let logo = null;
    if (logoUrl) { logo = new Image(); logo.crossOrigin = 'anonymous'; await loadMedia(logo, 'load', logoUrl); }
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The generated video has no readable duration.');
    const canvas = document.createElement('canvas'); canvas.width = dims ? dims[0] : video.videoWidth; canvas.height = dims ? dims[1] : video.videoHeight;
    const ctx = canvas.getContext('2d');
    stream = canvas.captureStream(30);
    let musicSource = null;
    if (audioContext) {
      const destination = audioContext.createMediaStreamDestination();
      if (hasAudio) audioContext.createMediaElementSource(video).connect(destination);
      if (musicUrl) {
        const musicResponse = await fetch(musicUrl);
        if (!musicResponse.ok) throw new Error('Could not download your music track.');
        let buffer;
        try { buffer = await audioContext.decodeAudioData(await musicResponse.arrayBuffer()); }
        catch { throw new Error('Your music track could not be read. Try an MP3 or WAV file.'); }
        const gain = audioContext.createGain();
        gain.gain.value = hasAudio ? 0.3 : 0.9; // sit under generated sound, full level otherwise
        musicSource = audioContext.createBufferSource();
        musicSource.buffer = buffer; musicSource.loop = true;
        musicSource.connect(gain).connect(destination);
      }
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    }
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(mime => MediaRecorder.isTypeSupported(mime));
    if (!mimeType) throw new Error('This browser cannot export video graphics. Please use Chrome or Edge.');
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('The browser could not record the branded video.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });
    const frame = () => {
      // Cover-fit: fills the frame, cropping the overflow (centre crop for square / 4:5).
      const s = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const dw = video.videoWidth * s, dh = video.videoHeight * s;
      ctx.drawImage(video, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      drawStudioVideoGraphics(ctx, canvas.width, canvas.height, logo, text);
      onProgress(Math.min(99, Math.round(video.currentTime / video.duration * 100)));
      animation = requestAnimationFrame(frame);
    };
    frame();
    recorder.start();
    const playbackEnded = new Promise((resolve, reject) => {
      video.onended = resolve;
      video.onerror = () => reject(new Error('Video playback failed during branding.'));
    });
    musicSource?.start();
    await video.play();
    await playbackEnded;
    musicSource?.stop();
    cancelAnimationFrame(animation); recorder.stop();
    const blob = await done; onProgress(100);
    return blob;
  } finally {
    cancelAnimationFrame(animation);
    video?.pause();
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    if (audioContext) await audioContext.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (video) { video.removeAttribute('src'); video.load(); }
  }
}