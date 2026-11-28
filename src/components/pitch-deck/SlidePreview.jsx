export default function SlidePreview({ slide, index, total, title }) {
  const isTitle = index === 0;
  return (
    <div className="aspect-video w-full rounded-xl border border-border bg-gradient-to-br from-[#1a1024] to-[#0f0f1a] p-6 sm:p-8 flex flex-col justify-center relative overflow-hidden">
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      {isTitle ? (
        <div className="relative space-y-2">
          <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight">{slide.title || title}</h2>
          {slide.bullets?.[0] && <p className="text-sm sm:text-lg text-fuchsia-300">{slide.bullets[0]}</p>}
        </div>
      ) : (
        <div className="relative space-y-3">
          <h2 className="text-lg sm:text-2xl font-black text-white">{slide.title}</h2>
          <ul className="space-y-1.5 list-disc pl-5 text-xs sm:text-base text-white/85">
            {(slide.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
      <span className="absolute bottom-2 right-4 text-[10px] text-white/40">{index + 1} / {total}</span>
    </div>
  );
}