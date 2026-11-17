import { useEffect, useState } from 'react';
import {
  clearPreviewMax, getPreviewMaxSnapshot, isSpiritualPreviewMode,
  maxAllPreviewSystems, setPreviewKills, setPreviewMax, subscribePreviewMax,
} from '../previewMaxMode';

const choices = [
  ['halo', 'Max Halo'],
  ['wings', 'Max Wings'],
  ['titles', 'Max Titles'],
];

// Visible only on an explicitly configured TEST backend / preview hostname.
// This is not an admin authorization surface for a production server.
export default function DevSpiritualMaxControls() {
  const [active, setActive] = useState(getPreviewMaxSnapshot);
  useEffect(() => subscribePreviewMax(setActive), []);
  if (!isSpiritualPreviewMode()) return null;
  return (
    <section aria-label="Spiritual test upgrades"
      className="mb-4 rounded-lg border border-sky-200/25 bg-black/30 p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[11px] uppercase tracking-widest text-sky-100">Test / Preview — Temporary Max Upgrades</strong>
        <span className="text-[10px] text-sky-100/70">Not saved · Test server only</span>
      </div>
      <p className="mt-1 text-[11px] text-sky-100/80">Max Kills displays 999,999 test kills, not saved or spendable. Turn off to see real kills.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={active[id]}
            onClick={() => setPreviewMax(id, !active[id])}
            className={`rounded border px-3 py-2 text-[11px] ${active[id]
              ? 'border-sky-300 bg-sky-900/60 text-white'
              : 'border-white/20 bg-white/5 text-white/80'}`}>
            {active[id] ? `${label} ✓` : label}
          </button>
        ))}
        <button type="button" aria-pressed={active.kills}
          onClick={() => setPreviewKills(!active.kills)}
          className={`rounded border px-3 py-2 text-[11px] ${active.kills
            ? 'border-cyan-300 bg-sky-900/60 text-white'
            : 'border-white/20 bg-white/5 text-white/80'}`}>{active.kills ? 'Max Kills ✓' : 'Max Kills (Preview)'}</button>
        <button type="button" onClick={maxAllPreviewSystems}
          className="rounded border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">Max All</button>
        <button type="button" onClick={clearPreviewMax}
          className="rounded border border-white/25 px-3 py-2 text-[11px] text-white/80">Clear Test Boosts</button>
      </div>
    </section>
  );
}
