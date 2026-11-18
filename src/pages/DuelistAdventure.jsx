import { ArrowLeft } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import Game2Duel from '@/components/game2/Game2Duel';

// Duelist Adventure workspace. It starts as the full Game 2 engine (character
// scripts, animation player, saber/Force combat) copied from atom-x-eve-os, and
// becomes its own game as new character models, animations and combat land.
export default function DuelistAdventure() {
  const navigate = useNavigate();
  return (
    <main className="flex h-screen min-h-0 flex-col bg-[#05080d] text-white">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-[#08111b] px-4">
        <button
          type="button"
          onClick={() => navigate({ to: '/' })}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/60 transition hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Adam X Eve Games
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div>
          <div className="text-sm font-semibold">Duelist Adventure</div>
          <div className="text-[10px] text-white/35">Workspace · built on the Game 2 duel engine</div>
        </div>
      </header>
      <section className="relative min-h-0 flex-1">
        <Game2Duel userId={null} displayName="" initialLaunch={null} />
      </section>
    </main>
  );
}
