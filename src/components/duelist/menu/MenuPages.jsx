// Duelist Adventure's menus, kept simple: a hub, a page for each mode, a Join page that puts you in any match
// with players in it, your fighter, settings, and the story mission. Each page says what it is in one line
// and offers one obvious button.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, LogIn, Play, Settings, User, Users, Radio, Swords, Flag, Truck, Shield, Target, Zap, Globe2, Trophy, X, CircleDot } from 'lucide-react';
import { BODIES } from '../client/assets.mjs';
import { usePrefs } from '../client/prefs.mjs';
import { MENU_MODES, LEVELS } from './modes.js';
import { useLobby } from './useLobby.js';
import DuelistHangarStage from './DuelistHangarStage.jsx';
import { HUB_MODE_CARDS, findHubMode } from './hubModeCatalog.mjs';
import './duelistHub.css';

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

/** Icons are intentionally presentation-only; route availability comes from the catalog. */
const HUB_GLYPHS = {
  swords: Swords, flag: Flag, truck: Truck, users: Users, target: Target,
  zap: Zap, circle: CircleDot, shield: Shield, globe: Globe2,
};

/**
 * A single persistent hangar stage behind the home and Play overlays.
 * The existing route pages remain responsible for match configuration,
 * matchmaking and gameplay: this home screen never bypasses those checks.
 */
export function DuelistHub() {
  const navigate = useNavigate();
  const lobby = useLobby();
  const [prefs, updatePrefs] = usePrefs();
  const [playOpen, setPlayOpen] = useState(false);
  const [playlist, setPlaylist] = useState('normal');
  const [selectedMode, setSelectedMode] = useState('duel');
  const selected = findHubMode(selectedMode);
  const fighter = BODIES[prefs.fighter]?.name || 'Duelist';
  // Online is a choice INSIDE each playable mode, not another top-level game mode.
  // Practice is an action, not a competing category. Ranked is visible, but
  // cannot launch until an authoritative ranked matchmaking queue exists.
  const visibleModes = HUB_MODE_CARDS.filter(mode => !['practice', 'online'].includes(mode.id));
  const playable = playlist === 'normal' && Boolean(selected?.route && MENU_MODES[selected.route]);
  const canPlayOnline = playable && MENU_MODES[selected.route]?.online && lobby.online;
  const canPractice = playable;
  const modeIcon = HUB_GLYPHS[selected?.symbol] || Swords;
  const SelectedIcon = modeIcon;
  const launch = online => {
    if (!playable || (online && !canPlayOnline)) return;
    navigate({ to: '/duelist-next/play', search: { mode: selected.route, online: online ? 1 : 0 } });
  };

  useEffect(() => {
    if (!playOpen) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') setPlayOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playOpen]);

  return (
    <main className="duelist-hub">
      <DuelistHangarStage fighter={prefs.fighter} />

      <header className="duelist-hub-header">
        <div className="duelist-hub-profile">
          <div className="duelist-hub-avatar"><User size={24} aria-hidden="true" /></div>
          <div>
            <div className="duelist-hub-player-name">GUEST DUELIST</div>
            <div className="duelist-hub-player-sub">{fighter}</div>
          </div>
        </div>
        <h1 className="duelist-hub-title"><small>EMBLEM BLUE</small>DUELIST ADVENTURE</h1>
        <div className="duelist-hub-header-end">
          <span>{lobby.online ? `${lobby.players} PLAYING` : 'OFFLINE / SOLO'}</span>
        </div>
      </header>

      <section className="duelist-hub-body" aria-label="Duelist home">
        <nav className="duelist-hub-nav" aria-label="Home actions">
          <button type="button" onClick={() => setPlayOpen(current => !current)}
            className="duelist-hub-nav-action" data-active={playOpen} aria-expanded={playOpen}
            aria-controls="duelist-play-drawer"><Play fill="currentColor" /> PLAY</button>
          <Link to="/duelist-next/$page" params={{ page: 'story' }}
            className="duelist-hub-nav-action"><BookOpen /> STORY CAMPAIGN</Link>
          <Link to="/duelist-next/$page" params={{ page: 'fighter' }}
            className="duelist-hub-nav-action"><User /> CHARACTER</Link>
        </nav>
      </section>

      {playOpen && (
        <section id="duelist-play-drawer" className="duelist-hub-overlay" aria-label="Play mode selection">
          <div className="duelist-hub-overlay-head">
            <div>
              <span className="duelist-hub-eyebrow">PLAY</span>
              <h2>Select mode</h2>
            </div>
            <button type="button" className="duelist-hub-small-button"
              onClick={() => setPlayOpen(false)} aria-label="Close play menu"><X size={18} /></button>
          </div>

          <div className="duelist-hub-play-layout">
            <div className="duelist-hub-playlists" aria-label="Play type">
              <button type="button" className="duelist-hub-category"
                data-selected={playlist === 'normal'} aria-pressed={playlist === 'normal'}
                onClick={() => setPlaylist('normal')}>
                <Users aria-hidden="true" />
                <span>NORMAL PLAY</span>
              </button>
              <button type="button" className="duelist-hub-category"
                data-selected={playlist === 'ranked'} aria-pressed={playlist === 'ranked'}
                onClick={() => setPlaylist('ranked')}>
                <Trophy aria-hidden="true" />
                <span>RANKED PLAY</span>
                <small>Planned</small>
              </button>
            </div>

            <div className="duelist-hub-mode-list" aria-label="Game modes">
              <h3>Game modes</h3>
              <div className="duelist-hub-modes">
                {visibleModes.map(mode => {
                  const Icon = HUB_GLYPHS[mode.symbol] || Target;
                  return (
                    <button key={mode.id} type="button" className="duelist-hub-mode"
                      data-selected={selectedMode === mode.id} aria-pressed={selectedMode === mode.id}
                      onClick={() => setSelectedMode(mode.id)}>
                      <Icon aria-hidden="true" />
                      <span>{mode.title}</span>
                      {!mode.route && <small>Planned</small>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="duelist-hub-mode-detail">
              <div className="duelist-hub-mode-art" aria-hidden="true">
                <span className="duelist-hub-mode-art-glow" />
                <SelectedIcon />
                <span>{selected?.title || 'Choose a mode'}</span>
              </div>
              <div className="duelist-hub-mode-content">
                <h3>{selected?.title || 'Select a mode'}</h3>
                <p>{selected?.description || 'Choose a battle mode to see its options.'}</p>
                {playlist === 'ranked' ? (
                  <div className="duelist-hub-mode-status" role="status">
                    Ranked matchmaking is planned. These will be the same battle modes, without practice.
                  </div>
                ) : !selected?.route ? (
                  <div className="duelist-hub-mode-status" role="status">
                    This mode is planned. Matchmaking will be available once its gameplay is ready.
                  </div>
                ) : (
                  <>
                    <div className="duelist-hub-match-actions">
                      <button type="button" onClick={() => launch(false)}
                        disabled={!canPractice}><Target /> PRACTICE</button>
                      <button type="button" data-primary="true" onClick={() => launch(true)}
                        disabled={!canPlayOnline}
                        title={!lobby.online ? 'Online server is unavailable' : undefined}>
                        <Play fill="currentColor" /> ONLINE PLAY
                      </button>
                    </div>
                    <div className="duelist-hub-match-settings">
                      <label>AI level
                        <select value={prefs.level} onChange={event => updatePrefs({ level: event.target.value })}>
                          {LEVELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                      </label>
                      <label>Opponent model
                        <select value={prefs.foe} onChange={event => updatePrefs({ foe: event.target.value })}>
                          {Object.entries(BODIES).map(([key, body]) => <option key={key} value={key}>{body.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="duelist-hub-action-footnote">
                      {!lobby.online ? 'Online play will be available when the match server connects.' : 'Choose practice for bots or online for matchmaking.'}
                      <Link to="/duelist-next/$page" params={{ page: selected.route }}>More mode details</Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="duelist-hub-footer" aria-label="Quick navigation">
        <Link to="/duelist-next/$page" params={{ page: 'settings' }}
          className="duelist-hub-footer-item"><Settings /> SETTINGS</Link>
        <button type="button" disabled className="duelist-hub-footer-item"
          title="Battle Pass is planned"><Trophy /> BATTLE PASS <small>PLANNED</small></button>
        <button type="button" disabled className="duelist-hub-footer-item"
          title="Plus is planned"><Zap /> PLUS</button>
      </footer>
    </main>
  );
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
