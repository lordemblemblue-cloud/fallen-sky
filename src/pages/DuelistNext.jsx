import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import DuelistGame from '@/components/duelist/client/DuelistGame';
import { BODIES } from '@/components/duelist/client/assets.mjs';
import { MODES } from '@/components/duelist/sim/match.mjs';
import { duelistServerUrl } from '@/components/duelist/net/client.mjs';

const MODE_ORDER = ['practice', 'duel', 'ffa', 'tdm', 'ctf'];
const SHORT = { practice: 'Practice', duel: 'Duel', ffa: 'Free for all', tdm: 'Team deathmatch', ctf: 'Capture the flag' };

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-white/45">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-[#0c1622] px-1.5 py-1 text-xs text-white/85 outline-none focus:border-cyan-300/40">
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

const BODY_OPTIONS = Object.entries(BODIES).map(([id, b]) => [id, b.name]);

// Duelist Adventure, new build: the from-scratch rebuild on the Will system (docs/duelist/REBUILD_PLAN.md).
// It runs beside the current /duelist page until it replaces it. The bar above the arena picks the mode,
// your fighter and the bots until the full menus (a page per mode, Join) arrive.
export default function DuelistNext() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('practice');
  const [you, setYou] = useState('maskedWarrior');
  const [foe, setFoe] = useState('huntress');
  const [level, setLevel] = useState('duelist');
  const [bots, setBots] = useState('1');
  const [online, setOnline] = useState(false);
  const [joinAny, setJoinAny] = useState(false);
  const serverUrl = typeof window === 'undefined' ? null : duelistServerUrl();
  // online play is for the four match modes; Join puts you in any match that has players
  const playingOnline = !!serverUrl && (joinAny || (online && mode !== 'practice'));
  const oneOnOne = !playingOnline && (mode === 'practice' || mode === 'duel');
  const pick = (id) => { setMode(id); setJoinAny(false); };
  const chip = (on, tone = 'cyan') => `rounded-full border px-2.5 py-1 text-[11px] transition disabled:opacity-40 ${on
    ? (tone === 'cyan' ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-amber-300/60 bg-amber-400/15 text-amber-100')
    : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white'}`;
  return (
    <main className="flex h-screen min-h-0 flex-col bg-[#05080d] text-white">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/10 bg-[#08111b] px-4 py-1.5">
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
          <div className="text-[10px] text-white/35">New build · {joinAny ? 'Join any match' : MODES[mode].name}{playingOnline ? ' · online' : ''}</div>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Mode">
          {MODE_ORDER.map((id) => (
            <button key={id} type="button" onClick={() => pick(id)} className={chip(id === mode && !joinAny)}>
              {SHORT[id]}
            </button>
          ))}
          <button type="button" onClick={() => setJoinAny(true)} disabled={!serverUrl} className={chip(joinAny, 'amber')}
            title={serverUrl ? 'Join any online match that has players in it' : 'The match server is not set up yet'}>
            Join
          </button>
        </nav>
        <label className={`flex items-center gap-1.5 text-[11px] ${serverUrl ? 'text-white/55' : 'text-white/25'}`}
          title={serverUrl ? 'Play this mode on the match server' : 'The match server is not set up yet'}>
          <input type="checkbox" checked={online && !!serverUrl} disabled={!serverUrl || mode === 'practice'} onChange={(e) => setOnline(e.target.checked)} />
          Online
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Select label="You" value={you} onChange={setYou} options={BODY_OPTIONS} />
          {oneOnOne && <Select label="Opponent" value={foe} onChange={setFoe} options={BODY_OPTIONS} />}
          {mode === 'practice' && !playingOnline && <Select label="Bots" value={bots} onChange={setBots} options={[['1', '1'], ['2', '2'], ['3', '3']]} />}
          {!playingOnline && <Select label="Level" value={level} onChange={setLevel} options={[['trainee', 'Trainee'], ['duelist', 'Duelist'], ['master', 'Master']]} />}
        </div>
      </header>
      <section className="relative min-h-0 flex-1">
        <DuelistGame key={[mode, you, foe, level, bots, playingOnline, joinAny].join('|')} mode={joinAny ? 'any' : mode} you={you} foe={foe}
          botLevel={level} bots={Number(bots)} online={playingOnline} serverUrl={serverUrl} />
      </section>
    </main>
  );
}
