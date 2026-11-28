import { jsPDF } from "jspdf";

const hexToRgb = (hex, fallback) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Landscape 16:9 PDF, one slide per page, styled with the shared brand kit.
// jsPDF only ships standard fonts, so a serif brand font maps to Times and
// everything else to Helvetica.
// `logo` is the result of loadLogo() or null.
export function exportDeckPdf(deckTitle, slides, brand, logo) {
  const primary = hexToRgb(brand?.primary_color, [124, 58, 237]);
  const secondary = hexToRgb(brand?.secondary_color, [168, 85, 247]);
  const accent = hexToRgb(brand?.accent_color, [236, 72, 153]);
  const font = /playfair|georgia|times|serif/i.test(brand?.font_family || "") ? "times" : "helvetica";
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [960, 540] });
  slides.forEach((s, i) => {
    if (i > 0) doc.addPage([960, 540], "landscape");
    doc.setFillColor(16, 12, 26);
    doc.rect(0, 0, 960, 540, "F");
    doc.setFillColor(...primary);
    doc.rect(0, 530, 960, 10, "F");
    if (logo) {
      const h = 40, w = Math.min(160, (logo.w / logo.h) * h);
      const type = logo.dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      try { doc.addImage(logo.dataUrl, type, 40, 24, w, w === 160 ? (logo.h / logo.w) * 160 : h); } catch { /* unsupported format */ }
    }
    if (i === 0) {
      doc.setFontSize(42).setFont(font, "bold").setTextColor(255, 255, 255);
      doc.text(doc.splitTextToSize(s.title || deckTitle, 800), 80, 220);
      if (s.bullets?.[0]) {
        doc.setFontSize(22).setFont(font, "normal").setTextColor(...accent);
        doc.text(doc.splitTextToSize(s.bullets[0], 800), 80, 330);
      }
    } else {
      doc.setFontSize(32).setFont(font, "bold").setTextColor(...secondary);
      doc.text(doc.splitTextToSize(s.title || "", 800), 70, 110);
      doc.setFontSize(20).setFont(font, "normal");
      let y = 170;
      (s.bullets || []).forEach(b => {
        const lines = doc.splitTextToSize(b, 780);
        doc.setTextColor(...accent).text("•", 80, y);
        doc.setTextColor(235, 235, 245).text(lines, 100, y);
        y += lines.length * 26 + 12;
      });
    }
    doc.setFontSize(11).setFont(font, "normal").setTextColor(150, 150, 170);
    doc.text(`${i + 1} / ${slides.length}`, 900, 515);
  });
  doc.save(`${(deckTitle || "pitch-deck").replace(/[^\w-]+/g, "-")}.pdf`);
}