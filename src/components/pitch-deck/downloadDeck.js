import { base44 } from "@/api/base44Client";

const save = (base64, mime, filename) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};

// One action, two files: the backend builds the .pptx and the PDF from the
// same deck definition (including any edits made on this page).
export async function downloadDeck(deckTitle, slides, brand, logoUrl) {
  const cleanSlides = slides.map(s => ({ ...s, bullets: (s.bullets || []).filter(b => b.trim()) }));
  const { data } = await base44.functions.invoke("generatePitchDeck", {
    action: "export", deckTitle, slides: cleanSlides, brand, logoUrl,
  });
  if (data?.error || !data?.pptx) throw new Error(data?.error || "Export failed.");
  const base = (deckTitle || "pitch-deck").replace(/[^\w-]+/g, "-");
  save(data.pptx, "application/vnd.openxmlformats-officedocument.presentationml.presentation", `${base}.pptx`);
  save(data.pdf, "application/pdf", `${base}.pdf`);
}