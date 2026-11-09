import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PRICING_FAQ } from "@/config/faq";

/**
 * Pricing FAQ.
 *
 * The content lives in src/config/faq.js because lib/seo.js emits the same
 * text as FAQPage structured data — Google requires marked-up FAQ content to
 * match what the visitor actually sees, so both read one source rather than
 * two copies that could drift apart.
 */
export default function PricingFAQ() {
  const [open, setOpen] = useState(0);
  return (
    <div className="mb-14">
      <h2 className="text-2xl font-black text-white mb-1">Questions, answered</h2>
      <p className="text-white/40 text-sm mb-6">The things people actually ask before subscribing.</p>
      <div className="rounded-3xl border border-white/10 bg-white/3 divide-y divide-white/5 overflow-hidden">
        {PRICING_FAQ.map((item, i) => (
          <div key={item.q}>
            <button onClick={() => setOpen(open === i ? -1 : i)}
              className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 hover:bg-white/3 transition-colors">
              <span className="text-sm font-bold text-white">{item.q}</span>
              <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && (
              <p className="px-5 pb-5 -mt-1 text-sm text-white/55 leading-relaxed max-w-3xl">{item.a}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
