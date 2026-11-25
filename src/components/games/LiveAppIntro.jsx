import { useCallback, useEffect, useRef, useState } from 'react';

// The single-impact corrected 10-second cinematic, hosted in the owner's
// Base44 media library so both browser and installed PWA can stream it.
// The two-game selection screen is rendered only after this video ends.
export const LIVE_LAUNCH_INTRO_URL =
  'https://media.base44.com/videos/public/6876751a602125f45f1861b9/16a6b1762_intro_single_impact_fixed.mp4';

export default function LiveAppIntro({ onComplete }) {
  const videoRef = useRef(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  const playWithSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    try {
      const result = video.play();
      if (result && typeof result.then === 'function') {
        void result.then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
      }
    } catch {
      setNeedsGesture(true);
    }
  }, []);

  useEffect(() => {
    playWithSound();
    // The optional cinematic must never block access to either game.
    const watchdog = window.setTimeout(onComplete, 15000);
    // Browsers that block unmuted autoplay do not always reject play().
    const blockedCheck = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && video.paused && video.currentTime < 0.1) setNeedsGesture(true);
    }, 1000);
    return () => {
      window.clearTimeout(blockedCheck);
      window.clearTimeout(watchdog);
      videoRef.current?.pause();
    };
  }, [playWithSound, onComplete]);

  return (
    <main
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black"
      aria-label="Adam X Eve Games launch cinematic"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={LIVE_LAUNCH_INTRO_URL}
        preload="auto"
        playsInline
        autoPlay
        onEnded={onComplete}
        onError={onComplete}
        aria-label="Adam X Eve intro video"
      />
      {needsGesture && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <button
            type="button"
            onClick={playWithSound}
            className="rounded-md border border-white/60 bg-black/80 px-8 py-3 text-base font-semibold tracking-wider text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Play intro with sound
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onComplete}
        className="absolute bottom-5 right-5 rounded bg-black/60 px-4 py-2 text-xs font-medium uppercase tracking-widest text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        aria-label="Skip intro and choose a game"
      >
        Skip intro
      </button>
    </main>
  );
}
