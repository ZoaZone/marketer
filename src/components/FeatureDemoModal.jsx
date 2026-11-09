import { useEffect, useRef } from "react";
import { X, Maximize2 } from "lucide-react";

const VIDEO_URL = "https://media.base44.com/videos/public/69c3c2f5acaefc3a7afad5fd/913d0aa77_generated_video.mp4";

export default function FeatureDemoModal({ onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const enterPIP = async () => {
    if (videoRef.current && document.pictureInPictureEnabled) {
      try { await videoRef.current.requestPictureInPicture(); } catch {}
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        style={{ background: "#0a0a0a" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" />
            <span className="text-sm font-bold text-white">digitalstudios.app — Platform Demo</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={enterPIP}
              title="Pop out to Picture-in-Picture"
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-fuchsia-300 border border-white/10 hover:border-fuchsia-500/40 rounded-lg px-3 py-1.5 transition-all"
            >
              <Maximize2 className="w-3.5 h-3.5" /> PiP
            </button>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <video
            ref={videoRef}
            src={VIDEO_URL}
            autoPlay
            controls
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between">
          <p className="text-xs text-white/40">AI Marketing OS · All features included</p>
          <a href="/pricing"
            className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 transition-colors">
            Get Started Free →
          </a>
        </div>
      </div>
    </div>
  );
}