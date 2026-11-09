import { uid } from '@/components/media-editor/editorModel';
import { proxyImageAsObjectUrl } from '@/utils/aiClient';

// Everything the editor touches is turned into a same-origin blob URL, so the
// canvas is never tainted and the browser can record it.
export function readMeta(kind, src) {
  return new Promise((resolve, reject) => {
    const el = kind === 'video' ? document.createElement('video') : new Image();
    el.onerror = () => reject(new Error('Could not read this file. Try an MP4, MOV, JPG or PNG.'));
    if (kind === 'video') { el.preload = 'metadata'; el.onloadedmetadata = () => resolve({ duration: el.duration, w: el.videoWidth, h: el.videoHeight }); }
    else el.onload = () => resolve({ duration: 0, w: el.naturalWidth, h: el.naturalHeight });
    el.src = src;
  });
}

const toMedia = async (kind, src, name) => {
  const meta = await readMeta(kind, src);
  if (kind === 'video' && (!Number.isFinite(meta.duration) || meta.duration <= 0)) throw new Error('This video has no readable length.');
  return { id: uid(), kind, src, name, ...meta, duration: kind === 'video' ? meta.duration : 4, trimStart: 0, trimEnd: meta.duration, fit: 'cover', zoom: 1, panX: 0.5, panY: 0.5, filter: 'none' };
};

export async function importFile(file) {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!kind) throw new Error(`${file.name} is not an image or video.`);
  if (file.size > 300 * 1024 * 1024) throw new Error(`${file.name} is larger than 300 MB.`);
  return toMedia(kind, URL.createObjectURL(file), file.name);
}

export async function fetchBlobUrl(url, kind) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('download failed');
    return URL.createObjectURL(await res.blob());
  } catch {
    if (kind === 'image') return proxyImageAsObjectUrl(url);
    throw new Error('Could not download this item from your library.');
  }
}

export async function importAsset(asset) {
  const kind = asset.type === 'video' ? 'video' : 'image';
  return toMedia(kind, await fetchBlobUrl(asset.file_url, kind), asset.title || 'Library item');
}

export async function importLayerImage(fileOrAsset) {
  if (fileOrAsset instanceof File) {
    if (!/^(image|video)\//.test(fileOrAsset.type)) throw new Error('Choose an image or video.');
    return { src: URL.createObjectURL(fileOrAsset), media: fileOrAsset.type.startsWith('video/') ? 'video' : 'image', name: fileOrAsset.name };
  }
  const media = fileOrAsset.type === 'video' ? 'video' : 'image';
  return { src: await fetchBlobUrl(fileOrAsset.file_url, media), media, name: fileOrAsset.title || 'Library item' };
}