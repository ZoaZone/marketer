import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const KEY = "ds_install_dismissed";
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIosSafari = () => {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
};

// Floating "Install App" button, bottom-left (the chat widget owns bottom-right).
export default function InstallPrompt() {
  const [event, setEvent] = useState(null);
  const [ios, setIos] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === "1");

  useEffect(() => {
    if (isStandalone()) return undefined;
    setIos(isIosSafari());
    const onPrompt = (e) => { e.preventDefault(); setEvent(e); };
    const onInstalled = () => { setEvent(null); setHidden(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (hidden || isStandalone() || (!event && !ios)) return null;

  const dismiss = () => { localStorage.setItem(KEY, "1"); setHidden(true); };
  const install = async () => {
    if (!event) { setShowTip((v) => !v); return; }
    event.prompt();
    await event.userChoice.catch(() => null);
    setEvent(null);
  };

  return (
    <div className="fixed z-50 flex flex-col items-start gap-2 left-4 lg:left-[17rem]" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}>
      {showTip && (
        <div role="status" className="max-w-[240px] rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-xl">
          Tap the Share button, then Add to Home Screen.
        </div>
      )}
      <div className="flex items-center rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg shadow-fuchsia-500/30">
        <button type="button" onClick={install} className="flex items-center gap-2 pl-4 pr-2 py-2.5 text-sm font-semibold">
          <Download className="w-4 h-4" /> Install App
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="p-2 pr-3 opacity-80 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}