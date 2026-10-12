import { drawStudioVideoGraphics } from '@/components/quick-create/studioVideoGraphics';

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image or logo for branding.'));
    img.src = src;
  });
}

// Draws the logo and exact text onto a generated image, same layout as video.
export default async function renderStudioImage({ url, logoUrl, text }) {
  const [image, logo] = await Promise.all([load(url), logoUrl ? load(logoUrl) : null]);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  drawStudioVideoGraphics(ctx, canvas.width, canvas.height, logo, text);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not export the branded image.');
  return blob;
}