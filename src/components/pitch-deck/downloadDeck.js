import { loadLogo } from "./logo";
import { buildPptx } from "./buildPptx";
import { exportDeckPdf } from "./exportDeckPdf";

// One action, two files: the same slides, brand and logo go into both.
export async function downloadDeck(deckTitle, slides, brand, logoUrl) {
  const clean = slides.map(s => ({ ...s, bullets: (s.bullets || []).filter(b => b.trim()) }));
  const logo = await loadLogo(logoUrl);
  const base = (deckTitle || "pitch-deck").replace(/[^\w-]+/g, "-");

  const blob = buildPptx(deckTitle, clean, brand, logo);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.pptx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);

  exportDeckPdf(deckTitle, clean, brand, logo);
}