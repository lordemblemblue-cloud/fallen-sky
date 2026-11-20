import { useEffect, useRef, useState } from 'react';
import { Download, MonitorDown, X } from 'lucide-react';

// beforeinstallprompt is supported in Chromium browsers, but not every browser
// exposes a programmatic installer. Keep a useful manual-install fallback.
function installDirections() {
  if (typeof navigator === 'undefined') return 'Open your browser menu and look for Install app or Add to Dock.';

  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) {
    return 'In Safari, tap Share, then Add to Home Screen.';
  }
  if (/Android/.test(agent)) {
    return 'In Chrome, open the three-dot menu, then select Add to Home screen or Install app.';
  }
  if (/Edg\//.test(agent)) {
    return 'In Microsoft Edge, open the three-dot menu, choose Apps, then Install this site as an app.';
  }
  if (/Safari/.test(agent) && !/Chrome|Chromium|CriOS|Edg\//.test(agent)) {
    return 'In Safari on Mac, open File, then choose Add to Dock.';
  }
  if (/Firefox/.test(agent)) {
    return 'If Firefox does not offer app installation, open this site in Chrome or Microsoft Edge and use its Install app option.';
  }
  return 'In Chrome, select the install icon in the address bar, or open the three-dot menu, choose Cast, save, and share, then Install page as app.';
}

function isRunningAsApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}

export default function InstallAppButton() {
  const pendingPrompt = useRef(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setInstalled(isRunningAsApp());

    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      pendingPrompt.current = event;
    }
    function onAppInstalled() {
      pendingPrompt.current = null;
      setInstalled(true);
      setShowHelp(false);
    }
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    function onDisplayModeChange() {
      setInstalled(isRunningAsApp());
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    displayMode?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      displayMode?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  async function onInstallClick() {
    const prompt = pendingPrompt.current;
    if (!prompt?.prompt) {
      setShowHelp((value) => !value);
      return;
    }

    // The native prompt must be called from this direct user click.
    pendingPrompt.current = null;
    setShowHelp(false);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'dismissed') setShowHelp(true);
    } catch {
      setShowHelp(true);
    }
  }

  if (installed) return null;

  return (
    <div className="absolute left-3 top-3 z-50 sm:left-5 sm:top-5">
      <button
        type="button"
        onClick={onInstallClick}
        aria-label="Install Adam X Eve Games on this device"
        aria-controls="games-hub-install-help"
        aria-expanded={showHelp}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/25 bg-slate-950/75 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:border-cyan-300/70 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Download className="h-4 w-4 text-cyan-200" aria-hidden="true" />
        Install App
      </button>

      {showHelp && (
        <section
          id="games-hub-install-help"
          aria-label="Install the games hub"
          className="absolute left-0 top-12 w-[min(87vw,365px)] rounded-xl border border-white/20 bg-[#0c1524]/95 p-4 text-white shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <MonitorDown className="h-5 w-5 shrink-0 text-cyan-200" aria-hidden="true" />
              <h2 className="text-sm font-bold">Install Adam X Eve Games</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              aria-label="Close install instructions"
              className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/80">{installDirections()}</p>
          <p className="mt-3 text-xs leading-5 text-white/55">
            This installs the games hub in its own window. Both games still run from the published website and may need an internet connection.
          </p>
        </section>
      )}
    </div>
  );
}
