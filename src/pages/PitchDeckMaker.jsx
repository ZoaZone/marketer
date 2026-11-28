import { useState } from "react";
import { Presentation, Loader2, Download, Wand2, ChevronLeft, ChevronRight, AlertTriangle, Save, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SlidePreview from "@/components/pitch-deck/SlidePreview";
import { exportDeckPdf } from "@/components/pitch-deck/exportDeckPdf";
import { invokeAI } from "@/lib/aiInvoke";
import { base44 } from "@/api/base44Client";

const SCHEMA = {
  type: "object",
  properties: {
    deckTitle: { type: "string" },
    slides: { type: "array", items: { type: "object", properties: { title: { type: "string" }, bullets: { type: "array", items: { type: "string" } } } } },
  },
};
const AUDIENCES = ["Investors", "Customers", "Partners", "Internal team"];
const inputCls = "w-full rounded-xl border border-input bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-ring";

export default function PitchDeckMaker() {
  const [idea, setIdea] = useState("");
  const [website, setWebsite] = useState("");
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [count, setCount] = useState(10);
  const [deckTitle, setDeckTitle] = useState("");
  const [slides, setSlides] = useState([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const generate = async () => {
    if (!idea.trim()) { setError("Describe your company or idea first."); return; }
    setBusy(true); setError(""); setSaved(false);
    try {
      const res = await invokeAI({
        prompt: `Create a ${count}-slide pitch deck for ${audience.toLowerCase()}.
Company / idea: """${idea}"""
${website.trim() ? `Website: ${website}` : ""}
Slide 1 is the title slide: title = company or deck name, bullets = [one-line tagline].
Then cover: problem, solution, product, market size, business model, traction, competition, go-to-market, team, financial ask/closing — adapted to the audience and trimmed or merged to fit exactly ${count} slides.
Each non-title slide: a short title and 3-4 concise bullets (max 14 words each). Do not invent specific numbers; use clearly marked placeholders like [X%] when data is unknown.`,
        response_json_schema: SCHEMA,
        add_context_from_internet: !!website.trim(),
      }, { tag: "pitch_deck" });
      if (!res?.slides?.length) throw new Error("No slides were produced. Try again.");
      setDeckTitle(res.deckTitle || "Pitch Deck");
      setSlides(res.slides);
      setCurrent(0);
    } catch (e) { setError(e?.message || "Deck generation failed."); }
    setBusy(false);
  };

  const patch = (change) => setSlides(prev => prev.map((s, i) => i === current ? { ...s, ...change } : s));

  const saveDeck = async () => {
    await base44.entities.ContentAsset.create({
      type: "script", title: `Pitch deck: ${deckTitle}`.slice(0, 80),
      content: JSON.stringify({ deckTitle, slides }), ai_generated: true, prompt_used: idea.slice(0, 500),
    });
    setSaved(true);
  };

  const slide = slides[current];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader icon={Presentation} iconGradient="from-amber-500 to-orange-600" title="Pitch Deck" subtitle="Turn an idea or website into a ready-to-present slide deck" />

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Your company or idea</label>
          <textarea value={idea} onChange={e => setIdea(e.target.value)} rows={4} className={`${inputCls} resize-none`}
            placeholder="What do you do, who is it for, what makes it different?" />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Website (optional)</label>
            <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Audience</label>
            <select value={audience} onChange={e => setAudience(e.target.value)} className={inputCls}>
              {AUDIENCES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Slides</label>
            <select value={count} onChange={e => setCount(Number(e.target.value))} className={inputCls}>
              {[6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <button onClick={generate} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating deck…</> : <><Wand2 className="w-4 h-4" /> {slides.length ? "Regenerate Deck" : "Generate Pitch Deck"}</>}
        </button>
        {error && <p role="alert" className="flex items-center gap-2 text-sm text-red-400"><AlertTriangle className="w-4 h-4" />{error}</p>}
      </div>

      {slide && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-3">
            <SlidePreview slide={slide} index={current} total={slides.length} title={deckTitle} />
            <div className="flex items-center justify-between">
              <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-sm disabled:opacity-30"><ChevronLeft className="w-4 h-4" /> Prev</button>
              <div className="flex gap-1 flex-wrap justify-center">
                {slides.map((_, i) => (
                  <button key={i} onClick={() => setCurrent(i)} aria-label={`Slide ${i + 1}`}
                    className={`w-6 h-6 rounded text-[10px] font-bold ${i === current ? "bg-fuchsia-500 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</button>
                ))}
              </div>
              <button onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))} disabled={current === slides.length - 1}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-sm disabled:opacity-30">Next <ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Edit slide {current + 1}</h3>
            <input value={slide.title || ""} onChange={e => patch({ title: e.target.value })} className={inputCls} />
            <textarea rows={7} value={(slide.bullets || []).join("\n")} className={`${inputCls} resize-none text-xs`}
              onChange={e => patch({ bullets: e.target.value.split("\n") })} placeholder="One bullet per line" />
            <div className="flex gap-2">
              <button onClick={() => exportDeckPdf(deckTitle, slides.map(s => ({ ...s, bullets: (s.bullets || []).filter(b => b.trim()) })))}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted/20">
                <Download className="w-4 h-4" /> PDF
              </button>
              <button onClick={saveDeck} disabled={saved}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/50 text-fuchsia-400 text-sm font-semibold disabled:opacity-60">
                {saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}