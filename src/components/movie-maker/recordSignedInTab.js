const MAX_SECONDS = 60;
const MAX_BYTES = 40 * 1024 * 1024;

export default async function recordSignedInTab({ signal, onRecording, stopRef }) {
  if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Tab recording needs a supported desktop browser. Try Chrome or Edge.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: { ideal: 24, max: 30 } }, audio: false });
  try {
    signal.throwIfAborted();
    const track = stream.getVideoTracks()[0];
    const surface = track?.getSettings().displaySurface;
    if (!track || (surface && surface !== 'browser')) throw new Error('Select the signed-in browser tab, not a window or your entire screen.');
    const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    let bytes = 0;
    const startedAt = performance.now();
    const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
    const timer = setTimeout(stop, MAX_SECONDS * 1000);
    stopRef.current = stop;
    track.addEventListener('ended', stop, { once: true });
    signal.addEventListener('abort', stop, { once: true });
    try {
      const recording = await new Promise((resolve, reject) => {
        recorder.ondataavailable = ({ data }) => {
          if (!data.size) return;
          bytes += data.size;
          if (bytes < MAX_BYTES) chunks.push(data);
          else stop();
        };
        recorder.onerror = () => reject(new Error('The browser could not record this tab.'));
        recorder.onstop = () => bytes >= MAX_BYTES ? reject(new Error('The recording is too large. Try a shorter walkthrough.')) : resolve(chunks);
        recorder.start(1000);
        onRecording();
      });
      signal.throwIfAborted();
      if (!recording.length) throw new Error('No footage was recorded. Share the tab and record a short walkthrough first.');
      const type = recorder.mimeType.split(';')[0] || recording[0].type.split(';')[0] || 'video/webm';
      const extension = type === 'video/mp4' ? 'mp4' : 'webm';
      return { file: new File(recording, `signed-in-demo.${extension}`, { type }), durationSeconds: (performance.now() - startedAt) / 1000 };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (stopRef.current === stop) stopRef.current = null;
    }
  } finally {
    stream.getTracks().forEach(track => track.stop());
  }
}