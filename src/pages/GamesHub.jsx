import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import InstallAppButton from '@/components/games/InstallAppButton';
import LiveAppIntro from '@/components/games/LiveAppIntro';
import GamesCrossScroll from '@/components/games/hub/GamesCrossScroll';
import MobileTouchControls from '@/components/mobile/MobileTouchControls';
import { shouldShowLiveIntro } from '@/components/games/liveIntroEnvironment';

// Adam X Eve Games: the first page. A cross-scroll menu of game tiles that
// moves left and right (keys, wheel, swipe, gamepad); the games themselves are
// listed in components/games/hub/gamesHubCatalog.mjs. A game whose route is not
// registered yet (Fantasy Battle until its route lands) shows "Coming soon".

// A return from any game goes straight to the hub; a fresh page load plays
// the cinematic again only on the published site.
let cinematicPlayedOnThisPageLoad = false;

export default function GamesHub() {
  const navigate = useNavigate();
  const checkedIntroRef = useRef(false);
  const router = useRouter();
  const [introPhase, setIntroPhase] = useState('checking');

  useEffect(() => {
    if (checkedIntroRef.current) return;
    checkedIntroRef.current = true;
    const eligible = shouldShowLiveIntro({
      hostname: window.location.hostname,
      search: window.location.search,
      embedded: window.parent !== window,
      isDevelopment: import.meta.env.DEV,
    });
    if (eligible && !cinematicPlayedOnThisPageLoad) {
      cinematicPlayedOnThisPageLoad = true;
      setIntroPhase('playing');
    } else {
      setIntroPhase('complete');
    }
  }, []);

  if (introPhase === 'checking') {
    return <>
      <MobileTouchControls game="duelist" disabled />
      <main className="h-[100dvh] bg-black" aria-label="Loading Adam X Eve Games" />
    </>;
  }
  if (introPhase === 'playing') {
    return <>
      <MobileTouchControls game="duelist" disabled />
      <LiveAppIntro onComplete={() => setIntroPhase('complete')} />
    </>;
  }

  return (
    <>
      {/* No gameplay controls on the hub; on touch portrait the shared component
          shows the same mandatory sideways screen before any game launches. */}
      <MobileTouchControls game="duelist" disabled />
      <main className="relative h-[100dvh] min-h-0 overflow-hidden bg-[#05070c] text-white">
        <GamesCrossScroll routesByPath={router?.routesByPath} onLaunch={(to) => navigate({ to })}>
          <div className="xs-install-slot" data-hub-nodrag>
            <InstallAppButton />
          </div>
          <header className="xs-brand">
            <h1>Adam X Eve Games</h1>
            <p>Choose your game</p>
          </header>
        </GamesCrossScroll>
      </main>
    </>
  );
}
