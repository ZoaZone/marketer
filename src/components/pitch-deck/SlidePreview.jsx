const DEFAULTS = { primary: "#7c3aed", secondary: "#a855f7", accent: "#ec4899" };

export default function SlidePreview({ slide, index, total, title, brand, logo }) {
  const isTitle = index === 0;
  const primary = brand?.primary_color || DEFAULTS.primary;
  const accent = brand?.accent_color || DEFAULTS.accent;
  const secondary = brand?.secondary_color || DEFAULTS.secondary;
  const fontFamily = brand?.font_family ? `"${brand.font_family}", Arial, sans-serif` : undefined;
  return (
    <div className="aspect-video w-full rounded-xl border border-border p-6 sm:p-8 flex flex-col justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #14101f, #0b0b14)", fontFamily }}>
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-40" style={{ background: primary }} />
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary}, ${accent})` }} />
      {logo && <img src={logo} alt="" className="absolute top-4 left-5 h-7 sm:h-9 object-contain" crossOrigin="anonymous" />}
      {isTitle ? (
        <div className="relative space-y-2">
          <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight">{slide.title || title}</h2>
          {slide.bullets?.[0] && <p className="text-sm sm:text-lg" style={{ color: accent }}>{slide.bullets[0]}</p>}
        </div>
      ) : (
        <div className="relative space-y-3">
          <h2 className="text-lg sm:text-2xl font-black" style={{ color: secondary }}>{slide.title}</h2>
          <ul className="space-y-1.5 list-disc pl-5 text-xs sm:text-base text-white/85 marker:text-[var(--m)]" style={{ "--m": accent }}>
            {(slide.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
      <span className="absolute bottom-3 right-4 text-[10px] text-white/40">{index + 1} / {total}</span>
    </div>
  );
}