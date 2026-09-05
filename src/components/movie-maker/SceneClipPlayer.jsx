import { useEffect, useState } from "react";

// SceneClipPlayer — the Movie Maker Scenes-step preview.
//
// Plays every chained shot of a scene back-to-back in one continuous,
// looping run — the same order assembly renders them in — instead of
// stopping dead at the end of the first shot, which read as "continuous
// play not showing in preview".
//
// A scene with no generated clip shows its still image with a visible
// "still image" badge, so a scene that will render as a Ken Burns pan in
// the final film is obvious BEFORE assembling, not discovered in the
// export (the exact symptom behind "the last scene was just an image
// showing in cinematic view").
export default function SceneClipPlayer({ clips = [], videoUrl, imageUrl, totalSeconds }) {
  // Ordered playlist: the scene's chained shots when it has any, else its
  // single clip. Falls through to the still image when neither exists.
  const sources = (clips.length
    ? clips.map(c => c?.videoUrl).filter(Boolean)
    : (videoUrl ? [videoUrl] : []));

  const [index, setIndex] = useState(0);

  // Regenerated clips restart the playlist from the first shot.
  const playlistKey = sources.join("|");
  useEffect(() => { setIndex(0); }, [playlistKey]);

  if (!sources.length) {
    if (!imageUrl) return null;
    return (
      <div className="relative">
        <img src={imageUrl} alt="" className="w-full h-32 object-cover rounded-xl border border-border" />
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-semibold text-amber-300">
          Still image — generate a video clip for motion
        </span>
      </div>
    );
  }

  const current = sources[index] || sources[0];
  return (
    <div className="relative">
      <video
        key={`${index}-${current}`}
        src={current}
        controls autoPlay muted playsInline
        onEnded={() => setIndex(i => (i + 1) % sources.length)}
        className="w-full h-32 object-cover rounded-xl border border-border"
      />
      {sources.length > 1 && (
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-semibold text-white">
          Shot {index + 1}/{sources.length} · {totalSeconds}s · loop
        </span>
      )}
    </div>
  );
}