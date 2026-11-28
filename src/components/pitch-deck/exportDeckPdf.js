import { jsPDF } from "jspdf";

// Landscape 16:9 PDF, one slide per page.
export function exportDeckPdf(deckTitle, slides) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [960, 540] });
  slides.forEach((s, i) => {
    if (i > 0) doc.addPage([960, 540], "landscape");
    doc.setFillColor(20, 14, 32);
    doc.rect(0, 0, 960, 540, "F");
    doc.setTextColor(255, 255, 255);
    if (i === 0) {
      doc.setFontSize(42).setFont("helvetica", "bold");
      doc.text(doc.splitTextToSize(s.title || deckTitle, 800), 80, 220);
      if (s.bullets?.[0]) {
        doc.setFontSize(22).setFont("helvetica", "normal").setTextColor(224, 140, 251);
        doc.text(doc.splitTextToSize(s.bullets[0], 800), 80, 330);
      }
    } else {
      doc.setFontSize(32).setFont("helvetica", "bold");
      doc.text(doc.splitTextToSize(s.title || "", 800), 70, 90);
      doc.setFontSize(20).setFont("helvetica", "normal").setTextColor(235, 235, 245);
      let y = 160;
      (s.bullets || []).forEach(b => {
        const lines = doc.splitTextToSize(`•  ${b}`, 800);
        doc.text(lines, 80, y);
        y += lines.length * 26 + 12;
      });
    }
    doc.setFontSize(11).setTextColor(150, 150, 170);
    doc.text(`${i + 1} / ${slides.length}`, 900, 515);
  });
  doc.save(`${(deckTitle || "pitch-deck").replace(/[^\w-]+/g, "-")}.pdf`);
}