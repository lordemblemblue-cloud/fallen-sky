// Duelist Adventure's menus, kept simple: a hub, a page for each mode, a Join page that puts you in any match
// with players in it, your fighter, settings, and the story mission. Each page says what it is in one line
// and offers one obvious button.
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, LogIn, Play, Settings, User, Users, Radio } from 'lucide-react';
import { BODIES } from '../client/assets.mjs';
import { usePrefs } from '../client/prefs.mjs';
import { MENU_MODES, MODE_ORDER, LEVELS } from './modes.js';
import { useLobby } from './useLobby.js';

const FIGHTER_NOTES = {
  maskedWarrior: 'Masked, leather-armoured, ponytail and scarf.',
  huntress: 'Bracers, belts and long head-tails.',
  female: 'Eve, from Fallen Sky.',
  male: 'Adam, from Fallen Sky.',
};

export function MenuShell({ title, subtitle = '', back = null, children }) {
  return (
    <main className="min-h-screen bg-[#05080d] text-white" style={{ backgroundImage: 'radial-gradient(1200px 600px at 15% -10%, rgba(80,160,255,0.16), transparent 60%), radial-gradient(900px 500px at 110% 10%, rgba(160,110,255,0.12), transparent 60%)' }}>
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-5">
        {back && (
          <Link to={back.to} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/55 transition hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {back.label}
          </Link>
        )}
      </header>
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-white/55">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}

const playing = (n) => (n ? `${n} playing` : null);

/** The hub: everything one click away. */
export function DuelistHub() {
  const lobby = useLobby();
  const [prefs] = usePrefs();
  const [panel, setPanel] = useState('play');
  const sections = [
    ['play', 'Play'], ['story', 'Story'], ['fighter', 'Fighter'], ['settings', 'Settings'],
  ];
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#030711] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 58% 40%, rgba(35,100,150,.38), transparent 42%), linear-gradient(120deg,#050a16 10%,#10253b 52%,#03050c 100%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-50" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 85px, rgba(100,205,245,.08) 86px 87px),linear-gradient(0deg,rgba(25,105,145,.2),transparent)' }} />
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-4 border-b border-cyan-100/15 bg-[#030814]/85 px-5 py-4 backdrop-blur-xl sm:px-10">
        <div>
          <div className="text-[10px] uppercase tracking-[.42em] text-cyan-200/65">Emblem Blue</div>
          <h1 className="text-xl font-bold tracking-[.18em] sm:text-2xl">DUELIST ADVENTURE</h1>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Duelist sections">
          {sections.map(([id, label]) => <button key={id} type="button" onClick={() => setPanel(panel === id ? null : id)}
            aria-pressed={panel === id}
            className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${panel === id ? 'border-cyan-300/65 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/5 text-white/65 hover:border-cyan-300/30 hover:text-white'}`}>{label}</button>)}
        </nav>
      </header>
      <section className="relative z-10 flex flex-1 items-center justify-end px-4 py-10 sm:px-10">
        <div className="pointer-events-none absolute bottom-[12%] left-[5%] max-w-sm">
          <p className="text-xs uppercase tracking-[.32em] text-cyan-200/70">Enter the arena</p>
          <p className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">Choose your path.</p>
          <p className="mt-3 text-sm text-white/50">Will. Precision. Power.</p>
        </div>
        {panel && <div className="relative z-20 w-full max-w-xl rounded-2xl border border-cyan-100/20 bg-[#07101e]/90 p-5 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold uppercase tracking-[.14em]">{sections.find(([id]) => id === panel)?.[1]}</h2>
            <button type="button" aria-label="Close panel" onClick={() => setPanel(null)} className="rounded-lg border border-white/15 px-3 py-1 text-white/70 hover:text-white">✕</button>
          </div>
          {panel === 'play' && <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            <JoinTile lobby={lobby} />
            {MODE_ORDER.filter(m => m !== 'practice').map(m => <ModeTile key={m} mode={m} badge={lobby.online ? playing(lobby.byMode[m]) : null} />)}
            <ModeTile mode="practice" />
          </div>}
          {panel === 'story' && <PageTile page="story" icon={BookOpen} title="Story: Contraband" line="Play the campaign solo or with a crew." accent="#c4a3ff" />}
          {panel === 'fighter' && <PageTile page="fighter" icon={User} title={BODIES[prefs.fighter]?.name || 'Choose your fighter'} line="Customize your character and loadout." accent="#ffd36a" />}
          {panel === 'settings' && <PageTile page="settings" icon={Settings} title="Settings" line="Sound, mouse and controls." accent="#b9c7d9" />}
        </div>}
      </section>
      <footer className="relative z-20 flex items-center justify-between border-t border-cyan-100/15 bg-[#030814]/85 px-5 py-4 text-[11px] uppercase tracking-[.2em] text-white/50 backdrop-blur-xl sm:px-10">
        <Link to="/" className="hover:text-cyan-200">← Games hub</Link>
        <span>Fighter · {BODIES[prefs.fighter]?.name || 'Select'}</span>
      </footer>
    </main>
  );
}

function ModeTile({ mode, badge = null }) {
  const m = MENU_MODES[mode];
  return <PageTile page={mode} icon={m.icon} title={m.title} line={m.blurb} accent={m.accent} badge={badge} />;
}

function PageTile({ page, icon: Icon, title, line, accent, badge = null, wide = false }) {
  return (
    <Link to="/duelist-next/$page" params={{ page }} className={`group relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-white/25 hover:bg-white/[0.06] ${wide ? 'sm:col-span-2' : ''}`}>
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl transition group-hover:opacity-40" style={{ background: accent }} />
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-5 w-5" style={{ color: accent }} />
        {badge && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/70">{badge}</span>}
      </div>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-white/55">{line}</div>
      </div>
    </Link>
  );
}

function JoinTile({ lobby }) {
  const line = !lobby.serverUrl ? 'Online play is not set up yet.' : !lobby.reachable ? 'The match server is not answering.'
    : lobby.players ? `${lobby.players} playing now: jump in.` : 'Nobody online yet: start a match others can join.';
  return <PageTile wide page="join" icon={LogIn} title="Join" line={line} accent="#ffb05a" badge={lobby.online ? 'Online' : null} />;
}

function Button({ children, onClick, primary = false, disabled = false, title = undefined }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${primary
        ? 'bg-cyan-300/90 text-[#05121c] hover:bg-cyan-200' : 'border border-white/15 text-white/85 hover:border-white/35 hover:text-white'}`}>
      {children}
    </button>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/55">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-[#0c1622] px-2 py-1.5 text-sm text-white/90 outline-none focus:border-cyan-300/40">
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function MatchRows({ matches, onJoin }) {
  if (!matches?.length) return <p className="text-sm text-white/45">No matches running right now.</p>;
  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
      {matches.map((m) => (
        <div key={m.id} className="flex items-center gap-3 bg-white/[0.02] px-4 py-2.5 text-sm">
          <Radio className="h-4 w-4" style={{ color: MENU_MODES[m.mode]?.accent }} />
          <span className="min-w-[8rem] font-medium">{MENU_MODES[m.mode]?.title || m.name}</span>
          <span className="text-white/55">{m.players} {m.players === 1 ? 'player' : 'players'} · {m.bots} {m.bots === 1 ? 'bot' : 'bots'}</span>
          <span className="text-white/35">{m.phase === 'over' ? 'finishing' : m.phase === 'live' ? 'in play' : 'starting'}</span>
          <span className="ml-auto">{onJoin && m.open && <Button onClick={() => onJoin(m.mode)}>Join</Button>}</span>
        </div>
      ))}
    </div>
  );
}

/** A mode's own page: what it is, and how to play it (online or against bots). */
export function ModePage({ mode }) {
  const m = MENU_MODES[mode];
  const navigate = useNavigate();
  const lobby = useLobby();
  const [prefs, update] = usePrefs();
  const play = (online) => navigate({ to: '/duelist-next/play', search: { mode, online: online ? 1 : 0 } });
  const Icon = m.icon;
  const here = (lobby.matches || []).filter((x) => x.mode === mode);
  return (
    <MenuShell title={m.title} subtitle={m.blurb} back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <ul className="space-y-2">
            {m.rules.map((r) => <li key={r} className="flex gap-2 text-sm text-white/75"><Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: m.accent }} />{r}</li>)}
          </ul>
          {m.online && mode !== 'online' && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-white/40">Online now</div>
              {lobby.online ? <MatchRows matches={here} onJoin={() => play(true)} /> : <p className="text-sm text-white/45">{lobby.serverUrl ? 'The match server is not answering.' : 'Online play is not set up yet.'}</p>}
            </div>
          )}
        </div>
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {mode === 'online' ? (
            <>
              <p className="text-sm text-white/60">The match server selects Team Deathmatch, Capture the Flag or Three-Point Control at random.</p>
              <Button primary disabled={!lobby.online} onClick={() => play(true)}>
                <LogIn className="h-4 w-4" /> Find Random Match
              </Button>
            </>
          ) : mode === 'practice' ? (
            <>
              <Choice label="Opponent" value={prefs.foe} onChange={(v) => update({ foe: v })} options={Object.entries(BODIES).map(([id, b]) => [id, b.name])} />
              <Choice label="Bots" value={String(prefs.bots)} onChange={(v) => update({ bots: Number(v) })} options={[['1', '1'], ['2', '2'], ['3', '3']]} />
              <Choice label="Level" value={prefs.level} onChange={(v) => update({ level: v })} options={LEVELS} />
              <Button primary onClick={() => play(false)}><Play className="h-4 w-4" /> Start practice</Button>
            </>
          ) : (
            <>
              <Button primary onClick={() => play(true)} disabled={!lobby.online} title={lobby.online ? undefined : 'The match server is not available'}>
                <LogIn className="h-4 w-4" /> Play online
              </Button>
              <div className="h-px bg-white/10" />
              <Choice label="Bots' level" value={prefs.level} onChange={(v) => update({ level: v })} options={LEVELS} />
              <Button onClick={() => play(false)}><Play className="h-4 w-4" /> Play against bots</Button>
            </>
          )}
          <p className="text-xs text-white/40">Fighter: {BODIES[prefs.fighter]?.name}. <Link to="/duelist-next/$page" params={{ page: 'fighter' }} className="text-cyan-200/80 hover:underline">Change</Link></p>
        </div>
      </div>
    </MenuShell>
  );
}

/** Join: one button that puts you in the busiest match that has players; or pick one. */
export function JoinPage() {
  const navigate = useNavigate();
  const lobby = useLobby();
  const join = (mode) => navigate({ to: '/duelist-next/play', search: { mode, online: 1 } });
  const withPlayers = (lobby.matches || []).filter((m) => m.players > 0);
  // the busiest place with players and room: a match (the server picks it) or an open story crew
  const busiest = withPlayers.find((m) => m.open);
  return (
    <MenuShell title="Join" subtitle="Jump into a match that has players in it. You take a bot's place." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      {!lobby.online ? (
        <div className="space-y-4">
          <p className="text-sm text-white/60">{lobby.serverUrl ? 'The match server is not answering right now.' : 'Online play is not set up yet: the match server is not deployed.'}</p>
          <Link to="/duelist-next/$page" params={{ page: 'practice' }}><Button primary><Play className="h-4 w-4" /> Practice instead</Button></Link>
        </div>
      ) : (
        <div className="space-y-6">
          <Button primary onClick={() => join(busiest?.mode === 'story' ? 'story' : 'any')}><LogIn className="h-4 w-4" /> {withPlayers.length ? 'Join a match' : 'Start a match others can join'}</Button>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-white/40">Matches</div>
            <MatchRows matches={lobby.matches} onJoin={join} />
          </div>
        </div>
      )}
    </MenuShell>
  );
}

export function FighterPage() {
  const [prefs, update] = usePrefs();
  return (
    <MenuShell title="Fighter" subtitle="Who you fight as, in every mode." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(BODIES).map(([id, b]) => {
          const on = prefs.fighter === id;
          return (
            <button key={id} type="button" onClick={() => update({ fighter: id })}
              className={`flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition ${on ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}>
              <span className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold ${on ? 'bg-cyan-300/90 text-[#05121c]' : 'bg-white/10 text-white/80'}`}>{b.name[0]}</span>
              <span className="text-base font-semibold">{b.name}</span>
              <span className="text-xs text-white/55">{FIGHTER_NOTES[id] || ''}</span>
              {on && <span className="text-[11px] text-cyan-200">Selected</span>}
            </button>
          );
        })}
      </div>
    </MenuShell>
  );
}

const CONTROLS = [
  ['Move', 'W A S D'], ['Sprint', 'Shift'], ['Light strike (chain three)', 'Left mouse'], ['Heavy strike', 'E'], ['Guard (a fresh guard parries)', 'Right mouse, hold'],
  ['Roll (into a push or a strike)', 'Space'], ['Dash', 'Ctrl'], ['Push', '1'], ['Pull', '2'], ['Telekinesis grip (let go to throw)', '3, hold'],
  ['Veil Breach', '4'], ['Resist (break a grip)', 'Z'], ['Lock on', 'Tab'], ['Use (story: crates, consoles, cores)', 'F, hold'],
];

function readAudio() {
  try { return { volume: 0.8, muted: false, ...JSON.parse(window.localStorage.getItem('duelist.audio') || '{}') }; } catch { return { volume: 0.8, muted: false }; }
}

export function SettingsPage() {
  const [prefs, update] = usePrefs();
  const [audio, setAudio] = useState(readAudio);
  const saveAudio = (patch) => {
    const next = { ...audio, ...patch };
    setAudio(next);
    try { window.localStorage.setItem('duelist.audio', JSON.stringify(next)); } catch { /* this visit only */ }
  };
  return (
    <MenuShell title="Settings" back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <label className="block space-y-2 text-sm">
            <span className="flex justify-between text-white/70"><span>Sound volume</span><span>{Math.round(audio.volume * 100)}%</span></span>
            <input type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={(e) => saveAudio({ volume: Number(e.target.value) })} className="w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={!audio.muted} onChange={(e) => saveAudio({ muted: !e.target.checked })} /> Sound on
          </label>
          <label className="block space-y-2 text-sm">
            <span className="flex justify-between text-white/70"><span>Mouse sensitivity</span><span>{prefs.sensitivity.toFixed(2)}×</span></span>
            <input type="range" min="0.3" max="2.5" step="0.05" value={prefs.sensitivity} onChange={(e) => update({ sensitivity: Number(e.target.value) })} className="w-full" />
          </label>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-3 text-xs uppercase tracking-wider text-white/40">Controls</div>
          <table className="w-full text-sm">
            <tbody>
              {CONTROLS.map(([what, key]) => <tr key={what} className="border-t border-white/5"><td className="py-1.5 text-white/70">{what}</td><td className="py-1.5 text-right text-cyan-100/90">{key}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </MenuShell>
  );
}

const ACTS = [
  ['Infiltration', 'Get into the Halvane Logistics freight depot and open the crates its manifest calls medical supplies.'],
  ['The Ledger', 'Three people sign every transfer: the quartermaster, the broker and the security chief. Find them and take their ledger cores.'],
  ['The Evidence', 'The depot locks down. Carry the cores to the cargo lift and hold it until it arrives.'],
  ['The Name', 'The buyer paid in Will-forged crystal. A recorded message plays in a voice you know.'],
];

export function StoryPage() {
  const navigate = useNavigate();
  const lobby = useLobby();
  const [prefs] = usePrefs();
  const [typed, setTyped] = useState('');
  const code = typed.toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 5);
  const play = (search) => navigate({ to: '/duelist-next/play', search: { mode: 'story', ...search } });
  const crews = (lobby.matches || []).filter((m) => m.mode === 'story' && m.open);
  const offline = lobby.serverUrl ? 'The match server is not answering.' : 'Online play is not set up yet.';
  return (
    <MenuShell title="Contraband" subtitle="A story mission for 1 to 4 players." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <ol className="grid gap-3 sm:grid-cols-2">
            {ACTS.map(([title, line], i) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-wider text-violet-200/70">Part {i + 1}</div>
                <div className="mt-1 text-base font-semibold">{title}</div>
                <div className="mt-1 text-sm text-white/60">{line}</div>
              </li>
            ))}
          </ol>
          <ul className="space-y-1.5 text-xs text-white/55">
            <li>About ten minutes. If the whole crew falls, the stage starts again from its checkpoint.</li>
            <li>The guards have no Veil but carry sidearms: a line of light shows where a shot will go. Roll or guard.</li>
            <li>Hold F to open crates, use consoles and take ledger cores. The depot is manned for the size of your crew.</li>
          </ul>
        </div>
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Button primary onClick={() => play({ online: 0 })}><Play className="h-4 w-4" /> Play solo</Button>
          <div className="h-px bg-white/10" />
          <div className="text-xs uppercase tracking-wider text-white/40">With a crew</div>
          <Button onClick={() => play({ online: 1, room: 'new' })} disabled={!lobby.online} title={lobby.online ? undefined : offline}>
            <Users className="h-4 w-4" /> Start a crew room
          </Button>
          <p className="text-xs text-white/40">You get a code to give to up to three friends.</p>
          <div className="flex items-center gap-2">
            <input value={code} onChange={(e) => setTyped(e.target.value)} placeholder="CODE" maxLength={5} aria-label="Crew code"
              className="w-24 rounded-lg border border-white/10 bg-[#0c1622] px-3 py-2 text-sm uppercase tracking-[0.25em] text-white/90 outline-none placeholder:text-white/25 focus:border-cyan-300/40" />
            <Button onClick={() => play({ online: 1, room: code })} disabled={!lobby.online || code.length !== 5}><LogIn className="h-4 w-4" /> Join with a code</Button>
          </div>
          <Button onClick={() => play({ online: 1 })} disabled={!lobby.online} title={lobby.online ? undefined : offline}>
            <LogIn className="h-4 w-4" /> {crews.length ? `Join an open crew (${crews.length})` : 'Start an open crew'}
          </Button>
          {!lobby.online && <p className="text-xs text-white/40">{offline}</p>}
          <p className="text-xs text-white/40">Fighter: {BODIES[prefs.fighter]?.name}. <Link to="/duelist-next/$page" params={{ page: 'fighter' }} className="text-cyan-200/80 hover:underline">Change</Link></p>
        </div>
      </div>
    </MenuShell>
  );
}
