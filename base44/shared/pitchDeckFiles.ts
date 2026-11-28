// Builds the pitch deck files from ONE deck definition ({ deckTitle, slides,
// brand, logo }): an editable .pptx (pptxgenjs) and a PDF (jsPDF).
// Lives under base44/shared/ (no underscore) so it bundles on this platform.
import PptxGenJS from 'npm:pptxgenjs@3.12.0';
import { jsPDF } from 'npm:jspdf@4.0.0';

export interface DeckSlide { title: string; bullets: string[] }
export interface DeckBrand { primary_color?: string; secondary_color?: string; accent_color?: string; font_family?: string }
export interface DeckLogo { dataUrl: string; mime: string }

const hex = (c: unknown, fb: string) => (/^#?[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).replace('#', '').toUpperCase() : fb);
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

function palette(brand?: DeckBrand) {
  return {
    primary: hex(brand?.primary_color, '7C3AED'),
    secondary: hex(brand?.secondary_color, 'A855F7'),
    accent: hex(brand?.accent_color, 'EC4899'),
    font: brand?.font_family || 'Arial',
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Fetches a brand logo (https only, PNG/JPEG, <=3MB). Returns null if unusable. */
export async function fetchLogo(url?: string): Promise<DeckLogo | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!res.ok || !['image/png', 'image/jpeg'].includes(mime)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 3_000_000) return null;
    return { mime, dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}` };
  } catch (_e) {
    return null;
  }
}

/** Editable .pptx — native text boxes — returned as base64. */
export async function buildPptxBase64(deckTitle: string, slides: DeckSlide[], brand?: DeckBrand, logo?: DeckLogo | null): Promise<string> {
  const c = palette(brand);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
  pptx.title = deckTitle;

  slides.forEach((s, i) => {
    const sl = pptx.addSlide();
    sl.background = { color: '100C1A' };
    sl.addShape(pptx.ShapeType.rect, { x: 0, y: 5.45, w: 10, h: 0.175, fill: { color: c.primary }, line: { color: c.primary } });
    if (logo) sl.addImage({ data: logo.dataUrl, x: 0.35, y: 0.2, w: 1.4, h: 0.5, sizing: { type: 'contain', w: 1.4, h: 0.5 } });

    if (i === 0) {
      sl.addText(s.title || deckTitle, { x: 0.75, y: 1.6, w: 8.5, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: c.font, valign: 'bottom' });
      if (s.bullets[0]) sl.addText(s.bullets[0], { x: 0.75, y: 3.1, w: 8.5, h: 0.9, fontSize: 20, color: c.accent, fontFace: c.font, valign: 'top' });
    } else {
      sl.addText(s.title, { x: 0.65, y: 0.75, w: 8.7, h: 0.8, fontSize: 28, bold: true, color: c.secondary, fontFace: c.font });
      sl.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 10 } })),
        { x: 0.65, y: 1.65, w: 8.7, h: 3.6, fontSize: 20, color: 'EBEBF5', fontFace: c.font, valign: 'top' },
      );
    }
    sl.addText(`${i + 1} / ${slides.length}`, { x: 8.3, y: 5.1, w: 1.4, h: 0.3, fontSize: 9, align: 'right', color: '9696AA', fontFace: c.font });
  });

  return await pptx.write({ outputType: 'base64' }) as string;
}

/** 16:9 PDF of the same slides, returned as base64. jsPDF only ships standard fonts. */
export function buildPdfBase64(deckTitle: string, slides: DeckSlide[], brand?: DeckBrand, logo?: DeckLogo | null): string {
  const c = palette(brand);
  const font = /playfair|georgia|times|serif/i.test(brand?.font_family || '') ? 'times' : 'helvetica';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] });

  slides.forEach((s, i) => {
    if (i > 0) doc.addPage([960, 540], 'landscape');
    doc.setFillColor(16, 12, 26).rect(0, 0, 960, 540, 'F');
    doc.setFillColor(...rgb(c.primary)).rect(0, 530, 960, 10, 'F');
    if (logo) {
      try {
        const p = doc.getImageProperties(logo.dataUrl);
        const scale = Math.min(160 / p.width, 40 / p.height);
        doc.addImage(logo.dataUrl, logo.mime === 'image/png' ? 'PNG' : 'JPEG', 40, 24, p.width * scale, p.height * scale);
      } catch (_e) { /* unreadable logo: leave it out */ }
    }
    if (i === 0) {
      doc.setFontSize(42).setFont(font, 'bold').setTextColor(255, 255, 255);
      doc.text(doc.splitTextToSize(s.title || deckTitle, 800), 80, 220);
      if (s.bullets[0]) {
        doc.setFontSize(22).setFont(font, 'normal').setTextColor(...rgb(c.accent));
        doc.text(doc.splitTextToSize(s.bullets[0], 800), 80, 330);
      }
    } else {
      doc.setFontSize(32).setFont(font, 'bold').setTextColor(...rgb(c.secondary));
      doc.text(doc.splitTextToSize(s.title, 800), 70, 110);
      doc.setFontSize(20).setFont(font, 'normal');
      let y = 170;
      for (const b of s.bullets) {
        const lines = doc.splitTextToSize(b, 780);
        doc.setTextColor(...rgb(c.accent)).text('•', 80, y);
        doc.setTextColor(235, 235, 245).text(lines, 100, y);
        y += lines.length * 26 + 12;
      }
    }
    doc.setFontSize(11).setFont(font, 'normal').setTextColor(150, 150, 170);
    doc.text(`${i + 1} / ${slides.length}`, 900, 515);
  });

  return bytesToBase64(new Uint8Array(doc.output('arraybuffer')));
}