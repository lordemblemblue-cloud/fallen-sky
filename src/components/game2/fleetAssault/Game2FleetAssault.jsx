import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Globe, Loader2, Radio, Rocket, Satellite, Ship, Swords, Users } from 'lucide-react';
import { getAccessToken } from '@base44/sdk';
import { base44 } from '@/api/base44Client';
import { getAppParams } from '@/lib/app-params';
const appParams = getAppParams();
import { makePeerId } from '../net/signaling.js';
import { MATCH, ROLES, ROLE_IDS } from '../../../../server/game2/fleet/rules.mjs';
import FleetFlight from './FleetFlight';

// Fleet Assault: Republic and Imperial capital ships, 100 combatants. The match itself runs on the server
// (server/game2/fleet, docs/game2/FLEET_ASSAULT_PLAN.md); this page picks a role and starts either practice (the same
// server code in this page, with AI pilots) or an online match on the Game 2 Railway server.
const store = {
  get(k, d) { try { return window.localStorage.getItem(k) || d; } catch { return d; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const FRONTS = [
  { icon: Ship, name: 'Space', text: 'Pilot your original-asset starfighters with engine-off drift reversals, 360° barrel rolls and rechargeable shields. Strip cruiser shields, then disable their weapons, generators, hyperdrive and comms.' },
  { icon: Swords, name: 'Boarding', text: 'Three missions break in once the shields are down: sabotage, a boarding party, and a strike team for the Jedi commander.' },
  { icon: Satellite, name: 'Planet', text: 'The first strike team to destroy the enemy comms array wins a buff for the match; the losers lose team voice.' },
];

export default function Game2FleetAssault({ onExit, selectedPilot=null }) {
  const [role, setRole] = useState(() => store.get('atomxe.game2.fleet.role', 'pilot'));
  const [side, setSide] = useState(() => store.get('atomxe.game2.fleet.side', 'any'));
  const [name, setName] = useState(() => store.get('atomxe.game2.callsign', 'Pilot'));
  const [drill, setDrill] = useState(() => store.get('atomxe.game2.fleet.drill', '') === '1');
  const [session, setSession] = useState(null); // { mode, profile }
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    base44.auth.me().then(u => { if (!off) setUser(u || null); }).catch(() => { if (!off) setUser(null); });
    return () => { off = true; };
  }, []);
  const begin = mode => {
    setError('');
    const callsign = name.trim().slice(0, 20) || 'Pilot';
    store.set('atomxe.game2.fleet.role', role); store.set('atomxe.game2.fleet.side', side); store.set('atomxe.game2.callsign', callsign); store.set('atomxe.game2.fleet.drill', drill ? '1' : '');
    const profile = { name: callsign, role, side: side === 'any' ? undefined : side, drill: mode === 'local' && drill, avatarId:selectedPilot?.id || 'explorer' };
    if (mode === 'online') {
      const token = getAccessToken() || appParams.token;
      if (!user || !token) { setError('Sign in to your Atom X Eve account to play online.'); return; }
      Object.assign(profile, { token, selfId: makePeerId(user.id) });
    }
    setSession({ mode, profile });
  };
  if (session) return <FleetFlight mode={session.mode} profile={session.profile} onExit={() => setSession(null)} />;

  return <div data-testid="game2-fleet-assault" className="absolute inset-0 overflow-y-auto bg-[#030713] text-white">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_30%,rgba(22,86,139,0.25),transparent_55%)]" />
    <div className="relative mx-auto max-w-5xl px-5 py-8 sm:px-10 sm:py-10">
      <button onClick={onExit} className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-white"><ArrowLeft size={15} /> Back to Game 2</button>
      <div className="text-[11px] font-semibold uppercase tracking-[.32em] text-cyan-300">Republic vs Empire · 50 vs 50 starfighters · {MATCH.cruisersPerSide} capital ships per faction</div>
      <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">FLEET <span className="text-cyan-300">ASSAULT</span></h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">A full three-dimensional fleet war: 50 fighters versus 50, distributed among seven Republic and seven Imperial capital ships across a 360° battlefield. Asteroids provide cover and flanking lanes. Join as a pilot, boarder, trooper, or Jedi; capture objectives or destroy enemy capital ships.</p>
      <p className="mt-3 text-xs text-cyan-100/75" data-testid="game2-fleet-selected-character">
        Character identity: <strong>{selectedPilot?.name || 'Explorer'}</strong>.
        Your selected look is saved for ground combat; starfighters continue
        to use ship meshes while you pilot.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">{FRONTS.map(({ icon: Icon, name: n, text }) => <div key={n} className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
        <div className="mb-2 flex items-center gap-2 font-bold"><Icon size={18} className="text-cyan-300" />{n}</div><div className="text-xs leading-relaxed text-white/55">{text}</div></div>)}</div>

      <div className="mt-8 text-[11px] font-semibold uppercase tracking-[.2em] text-white/45">Your role</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{ROLE_IDS.map(r => <button key={r} onClick={() => setRole(r)} aria-pressed={role === r}
        className={'rounded-xl p-3 text-left transition ' + (role === r ? 'bg-cyan-300/15 ring-1 ring-cyan-300/65' : 'bg-white/[.045] ring-1 ring-white/10 hover:bg-white/10')}>
        <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{ROLES[r].name}</span>{role === r && <Check size={15} className="text-cyan-200" />}</div>
        <div className="mt-1 text-[11px] leading-snug text-white/45">{ROLES[r].blurb}</div></button>)}</div>
      <p className="mt-2 text-[11px] text-white/40">Roles have limits per side; when one is full you fly as a pilot and can switch from the in-match menu (Esc).</p>

      <div className="mt-6 flex flex-wrap items-end gap-6">
        <label className="text-xs text-white/55">Callsign<input value={name} maxLength={20} onChange={e => setName(e.target.value)} className="mt-1 block w-48 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-cyan-300/60" /></label>
        <div className="text-xs text-white/55">Side<div className="mt-1 flex gap-1">{[['any', 'Either'], ['republic', 'Republic'], ['separatist', 'Empire']].map(([id, label]) =>
          <button key={id} onClick={() => setSide(id)} aria-pressed={side === id} className={'rounded-lg px-3 py-2 text-xs ' + (side === id ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/10 text-white/60')}>{label}</button>)}</div></div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button data-testid="fleet-practice" onClick={() => begin('local')} className="inline-flex items-center gap-3 rounded-xl bg-cyan-300 px-6 py-3.5 text-sm font-extrabold tracking-wider text-slate-950 hover:bg-cyan-200"><Rocket size={17} /> PRACTICE VS AI PILOTS <ChevronRight size={17} /></button>
        <button data-testid="fleet-online" onClick={() => begin('online')} disabled={user === undefined} className="inline-flex items-center gap-3 rounded-xl bg-white/10 px-6 py-3.5 text-sm font-bold tracking-wider hover:bg-white/15 disabled:opacity-50">{user === undefined ? <Loader2 size={17} className="animate-spin" /> : <Globe size={17} />} ONLINE MATCH</button>
      </div>
      <label className="mt-3 flex max-w-2xl cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-white/55">
        <input type="checkbox" checked={drill} onChange={e => setDrill(e.target.checked)} className="mt-0.5 accent-cyan-300" />
        <span><span className="font-semibold text-white/75">Boarding drill</span> (practice only): the enemy shield generators start knocked out, so a saboteur, boarding party or strike team can fly straight into an enemy hangar.</span>
      </label>
      {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
      <div className="mt-4 flex max-w-2xl gap-2 text-[11px] leading-relaxed text-white/45"><Users size={14} className="mt-0.5 shrink-0" /><span>Practice runs the real match rules in this page against AI pilots. Online needs a signed-in account and the Game 2 server with Fleet Assault; until that server is deployed the online button says so and practice still works.</span></div>
      <div className="mt-2 flex max-w-2xl gap-2 text-[11px] leading-relaxed text-white/45"><Radio size={14} className="mt-0.5 shrink-0" /><span>Aboard a cruiser you fight on foot with Game 2's Jedi Outcast lightsaber and Force combat: the trooper garrison, the defenders and the Jedi commander on the bridge. The planet is still a schematic.</span></div>
    </div>
  </div>;
}
