import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import DuelistGame from '@/components/duelist/client/DuelistGame';
import { BODIES } from '@/components/duelist/client/assets.mjs';

function BodySelect({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-white/45">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-[#0c1622] px-1.5 py-1 text-xs text-white/85 outline-none focus:border-cyan-300/40">
        {Object.entries(BODIES).map(([id, b]) => <option key={id} value={id}>{b.name}</option>)}
      </select>
    </label>
  );
}

// Duelist Adventure, new build: the from-scratch rebuild on the Will system (docs/duelist/REBUILD_PLAN.md).
// It runs beside the current /duelist page until it replaces it.
export default function DuelistNext() {
  const navigate = useNavigate();
  const [you, setYou] = useState('maskedWarrior');
  const [foe, setFoe] = useState('huntress');
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
        <div className="ml-auto flex items-center gap-3">
          <BodySelect label="You" value={you} onChange={setYou} />
          <BodySelect label="Opponent" value={foe} onChange={setFoe} />
        </div>
      </header>
      <section className="relative min-h-0 flex-1">
        <DuelistGame key={you + foe} you={you} foe={foe} />
      </section>
    </main>
  );
}
