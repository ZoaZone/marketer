import { Clock, ChevronLeft, ChevronRight, X } from "lucide-react";

const LENGTH_PRESETS = [15, 30, 45, 60];

/**
 * Per-image duration editor for the compiled video. `durations[i]` is the
 * seconds for `images[i]`; any missing entry defaults to 3s. Always emits an
 * array the same length as `images` so it stays in sync as clips are added
 * or removed. `onMove`/`onRemove` (optional) let the user reorder or drop a
 * clip from the video without leaving this step.
 */
export default function ClipTimeline({ images, durations, onChange, onMove, onRemove }) {
  if (!images.length) return null;

  const getDur = (i) => durations?.[i] ?? 3;
  const setDur = (i, val) => {
    const next = images.map((_, j) => (j === i ? val : getDur(j)));
    onChange(next);
  };
  const total = images.reduce((sum, _, i) => sum + getDur(i), 0);

  const applyPreset = (targetSeconds) => {
    const per = Math.max(2, targetSeconds / images.length);
    onChange(images.map(() => Math.round(per * 2) / 2));
  };

  return (
    <div className="pt-6 border-t border-neutral-800">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-bold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-fuchsia-400" /> Clip Timing</h3>
        <p className="text-xs text-neutral-500">Total length ≈ {total.toFixed(1)}s</p>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Video Length:</span>
        {LENGTH_PRESETS.map(s => (
          <button key={s} type="button" onClick={() => applyPreset(s)}
            className="px-3 py-1 rounded-lg border border-neutral-700 text-xs font-bold text-neutral-300 hover:border-fuchsia-500/50 hover:text-fuchsia-300 transition-colors">
            {s}s
          </button>
        ))}
        <span className="text-[11px] text-neutral-500">— splits evenly across all clips, or fine-tune each below.</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((url, i) => (
          <div key={i} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="relative aspect-video bg-black group">
              <img src={url} alt={`Clip ${i + 1}`} className="w-full h-full object-cover" />
              {(onMove || onRemove) && (
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/70 to-transparent">
                  {onMove ? (
                    <div className="flex gap-1">
                      <button type="button" disabled={i === 0} onClick={() => onMove(i, i - 1)} title="Move earlier"
                        className="bg-black/60 backdrop-blur-md rounded-full p-1 disabled:opacity-30 hover:bg-black/90"><ChevronLeft className="w-3.5 h-3.5 text-white" /></button>
                      <button type="button" disabled={i === images.length - 1} onClick={() => onMove(i, i + 1)} title="Move later"
                        className="bg-black/60 backdrop-blur-md rounded-full p-1 disabled:opacity-30 hover:bg-black/90"><ChevronRight className="w-3.5 h-3.5 text-white" /></button>
                    </div>
                  ) : <div />}
                  {onRemove && (
                    <button type="button" onClick={() => onRemove(i)} title="Remove clip"
                      className="bg-black/60 backdrop-blur-md rounded-full p-1 hover:bg-red-500/80"><X className="w-3.5 h-3.5 text-white" /></button>
                  )}
                </div>
              )}
            </div>
            <div className="p-3">
              <label className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-1.5 block">Clip {i + 1} · {getDur(i)}s</label>
              <input type="range" min={2} max={15} step={0.5} value={getDur(i)} onChange={e => setDur(i, +e.target.value)} className="w-full accent-fuchsia-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
