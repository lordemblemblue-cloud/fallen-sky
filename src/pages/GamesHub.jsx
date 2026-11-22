import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import InstallAppButton from '@/components/games/InstallAppButton';
import LiveAppIntro from '@/components/games/LiveAppIntro';
import { shouldShowLiveIntro } from '@/components/games/liveIntroEnvironment';

// Adam X Eve Games: the first page. Left half opens Fallen Sky Online
// (the Game 3D world at /gameview); right half opens Duelist Adventure (/duelist).
// The two halves meet on a slanted divider on wide screens and stack on phones.
const GAMES = [
  {
    id: 'fallen-sky',
    to: '/gameview',
    title: 'Fallen Sky Online',
    tagline: 'The living world of Adam and Eve: factions, companions, mounts and quests.',
    image: 'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/371ca9e0d_fallen_sky_riftbound_hero.png',
    fallback: 'linear-gradient(135deg,#0b1f3a 0%,#1d4f7a 55%,#7cc4e8 100%)',
    accent: '#7cc4e8',
  },
  {
    id: 'duelist',
    to: '/duelist',
    title: 'Duelist Adventure',
    tagline: 'Blade-to-blade duels: real-time combat, powers and story missions.',
    image: 'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/597788ade_emblem_blue_duelist_adventure.png',
    fallback: 'linear-gradient(225deg,#2a0b0b 0%,#7a1d1d 55%,#f0a050 100%)',
    accent: '#f0a050',
  },
];

function GamePanel({ game, side, onPlay }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${game.title}`}
      className={`games-hub-panel games-hub-${side} group relative flex min-h-0 flex-1 overflow-hidden text-left focus:outline-none`}
      style={{ backgroundImage: game.fallback }}
    >
      <img
        src={game.image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105 group-focus-visible:scale-105"
        onError={(event) => { event.currentTarget.style.display = 'none'; }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10 transition group-hover:from-black/70" />
      <div className={`games-hub-copy relative mt-auto flex w-full flex-col gap-3 p-6 sm:p-10 ${side === 'right' ? 'items-end text-right' : 'items-start'}`}>
        <h2 className="text-3xl font-black uppercase tracking-wide text-white drop-shadow-lg sm:text-5xl">{game.title}</h2>
        <p className="max-w-md text-sm text-white/75 sm:text-base">{game.tagline}</p>
        <span
          className="mt-1 inline-flex items-center rounded-full px-6 py-2 text-sm font-bold uppercase tracking-widest text-black transition group-hover:brightness-110 group-focus-visible:ring-4 group-focus-visible:ring-white/60"
          style={{ background: game.accent }}
        >
          Play
        </span>
      </div>
    </button>
  );
}

// A return from either game goes straight to the hub; a fresh page load plays
// the cinematic again only on the published site.
let cinematicPlayedOnThisPageLoad = false;

export default function GamesHub() {
  const navigate = useNavigate();
  const checkedIntroRef = useRef(false);
  const [introPhase, setIntroPhase] = useState('checking');
  const [left, right] = GAMES;

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
    return <main className="h-screen bg-black" aria-label="Loading Adam X Eve Games" />;
  }
  if (introPhase === 'playing') {
    return <LiveAppIntro onComplete={() => setIntroPhase('complete')} />;
  }

  return (
    <main className="relative flex h-screen min-h-0 flex-col bg-[#05070c] text-white">
      <style>{`
        @media (min-width: 768px) {
          .games-hub-left  { clip-path: polygon(0 0, 100% 0, 88% 100%, 0 100%); margin-right: -6%; }
          .games-hub-right { clip-path: polygon(12% 0, 100% 0, 100% 100%, 0 100%); margin-left: -6%; }
          .games-hub-left .games-hub-copy  { padding-right: 16%; }
          .games-hub-right .games-hub-copy { padding-left: 16%; }
        }
      `}</style>
      <InstallAppButton />
      <header className="shrink-0 pb-5 pt-16 text-center md:py-5">
        <h1 className="text-2xl font-black uppercase tracking-[0.35em] sm:text-4xl">Adam X Eve Games</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/45">Choose your game</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1 md:flex-row md:gap-0">
        <GamePanel game={left} side="left" onPlay={() => navigate({ to: left.to })} />
        <GamePanel game={right} side="right" onPlay={() => navigate({ to: right.to })} />
      </div>
    </main>
  );
}
