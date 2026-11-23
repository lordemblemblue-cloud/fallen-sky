import { createFileRoute } from '@tanstack/react-router';
import FantasyBattlePage from '@/components/fantasybattle/FantasyBattlePage';
import { FANTASY_BATTLE_RELEASED } from '@/components/games/hub/gamesHubCatalog.mjs';

// Block both hub launches and direct links while the third game is unfinished.
function FantasyBattleComingSoon() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#050b18] px-6 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-slate-600/50 bg-[#0c1830] p-8 text-center shadow-2xl" aria-labelledby="fantasy-battle-coming-soon">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-sky-200">Adam X Eve Games</p>
        <h1 id="fantasy-battle-coming-soon" className="mb-3 text-4xl font-extrabold">Coming Soon</h1>
        <p className="mb-8 text-slate-300">Fantasy Battle is still in development and cannot be played yet.</p>
        <a href="/" className="inline-flex rounded-lg border border-slate-400/50 px-6 py-3 font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Back to Games</a>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/fantasy-battle')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Fantasy Battle · Adam X Eve Games' }] }),
  component: FANTASY_BATTLE_RELEASED ? FantasyBattlePage : FantasyBattleComingSoon,
});
