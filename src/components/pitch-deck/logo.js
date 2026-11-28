// Best-effort logo fetch shared by the PDF and PPTX exports. A logo that
// blocks cross-origin reads (or isn't a PNG/JPEG) resolves to null and is
// simply left out.
export async function loadLogo(url) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpeg" : null;
    if (!ext) return null;
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    const dims = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = rej; i.src = dataUrl; });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { dataUrl, bytes, ext, ...dims };
  } catch { return null; }
}