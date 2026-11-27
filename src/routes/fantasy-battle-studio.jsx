import { createFileRoute } from '@tanstack/react-router';
import FantasyBattlePage from '@/components/fantasybattle/FantasyBattlePage';
import { FANTASY_BATTLE_RELEASED } from '@/components/games/hub/gamesHubCatalog.mjs';
import { fantasyBattleStudioOpen } from '@/components/fantasybattle/studioPageGate.mjs';

// Test page the owner asked to keep (2026-11-27): the first archer battle with its animation Studio (debug overlays,
// sliders, skin swaps, downloads). Not linked from the games menu; open under the same rule as /fantasy-battle.
function StudioPageClosed() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#050b18] px-6 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-slate-600/50 bg-[#0c1830] p-8 text-center" aria-labelledby="fantasy-battle-studio-closed">
        <h1 id="fantasy-battle-studio-closed" className="mb-3 text-3xl font-extrabold">Not available</h1>
        <p className="mb-8 text-slate-300">This Fantasy Battle test page opens when the game is released.</p>
        <a href="/" className="inline-flex rounded-lg border border-slate-400/50 px-6 py-3 font-semibold text-white hover:bg-slate-700">Back to Games</a>
      </section>
    </main>
  );
}

export const Route = createFileRoute('/fantasy-battle-studio')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Fantasy Battle studio · Adam X Eve Games' }] }),
  component: fantasyBattleStudioOpen({ released: FANTASY_BATTLE_RELEASED, dev: import.meta.env.DEV }) ? FantasyBattlePage : StudioPageClosed,
});
