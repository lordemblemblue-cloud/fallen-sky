import { ArrowLeft } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import DuelistGame from '@/components/duelist/client/DuelistGame';

// Duelist Adventure, new build: the from-scratch rebuild on the Will system (docs/duelist/REBUILD_PLAN.md).
// It runs beside the current /duelist page until it replaces it.
export default function DuelistNext() {
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
          <div className="text-[10px] text-white/35">New build · Practice duel</div>
        </div>
      </header>
      <section className="relative min-h-0 flex-1">
        <DuelistGame />
      </section>
    </main>
  );
}
