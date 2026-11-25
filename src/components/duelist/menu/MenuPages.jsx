import OnlineArenaPreview from './OnlineArenaPreview.jsx';
import {mapPicture} from './mapPictures.mjs';
// Duelist Adventure's menus, kept simple: a hub, a page for each mode, a Join page that puts you in any match
// with players in it, your fighter, settings, and the story mission. Each page says what it is in one line
// and offers one obvious button.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Home, ArrowLeft, BookOpen, LogIn, Play, Settings, User, Users, Radio, Swords, Flag, Truck, Shield, Target, Zap, Globe2, Trophy, X, CircleDot, Volume2, MousePointer2, Gamepad2, CheckCircle2 } from 'lucide-react';
import { BODIES } from '../client/assets.mjs';
import { usePrefs, classProgressOf } from '../client/prefs.mjs';
import { ACTIONS, DEFAULT_KEYS, keysFrom, rebind, keyLabel, bindable } from '../client/bindings.mjs';
import { MENU_MODES, LEVELS } from './modes.js';
import { STORY_MISSIONS } from './missions.js';
import { useLobby } from './useLobby.js';
import DuelistHangarStage from './DuelistHangarStage.jsx';
import GraphicsRuntimePanel from '../../shared/GraphicsRuntimePanel';
import { HUB_MODE_CARDS, findHubMode } from './hubModeCatalog.mjs';
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';
import { LEVEL_CAP, MILESTONES, levelFromXp, xpForLevel } from '../core/progression.mjs';
import './duelistHub.css';
import './duelistMenuTheme.css';
import './duelistOpenGlass.css';
import './duelistUnifiedVisual.css';
import './duelistMenuOverlays.css';
import './duelistTemplateUI.css';
import './duelistDarkBlueTheme.css';

const FIGHTER_NOTES = {
  maskedWarrior: 'Masked, leather-armoured, ponytail and scarf.',
  huntress: 'Bracers, belts and long head-tails.',
  female: 'Eve, from Fallen Sky.',
  male: 'Adam, from Fallen Sky.',
};

export function MenuShell({ title, subtitle = '', back = null, children, matchEntry = false }) {
  return (
    <main className={matchEntry ? "duelist-menu-page duelist-match-entry" : "duelist-menu-page"}>
      <header className="duelist-menu-topbar">
        <Link to="/duelist-next" className="duelist-menu-brand" aria-label="Duelist Adventure home">
          <span>EMBLEM BLUE</span>
          <strong>DUELIST ADVENTURE</strong>
        </Link>
        <span className="duelist-menu-header-status">DUELIST ADVENTURE</span>
      </header>
      <section className="duelist-menu-content">
        <div className="duelist-menu-breadcrumb">
          {back ? (
            <Link to={back.to}><ArrowLeft aria-hidden="true" /> {back.label}</Link>
          ) : <span>DUELIST ADVENTURE</span>}
          <span aria-hidden="true">/</span>
          <span className="duelist-menu-breadcrumb-current">{title}</span>
        </div>
        <div className="duelist-menu-hero">
          <span className="duelist-menu-eyebrow">EMBLEM BLUE · OPERATIONS</span>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="duelist-menu-page-body">{children}</div>
      </section>
      <footer className="duelist-menu-bottom-nav" aria-label="Duelist menu navigation">
        <Link to="/duelist-next" className="duelist-menu-bottom-link"><Home size={17}/> HOME</Link>
        <Link to="/duelist-next/$page" params={{ page: 'play-menu' }} className="duelist-menu-bottom-link"><Swords size={17}/> PLAY</Link>
        <Link to="/duelist-next/$page" params={{ page: 'online-play' }} className="duelist-menu-bottom-link"><Users size={17}/> ONLINE</Link>
        <Link to="/duelist-next/$page" params={{ page: 'character' }} className="duelist-menu-bottom-link"><User size={17}/> CHARACTER</Link>
        <Link to="/duelist-next/$page" params={{ page: 'story' }} className="duelist-menu-bottom-link"><BookOpen size={17}/> STORY</Link>
        <Link to="/duelist-next/$page" params={{ page: 'settings' }} className="duelist-menu-bottom-link"><Settings size={17}/> SETTINGS</Link>
      </footer>
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
export function DuelistHub({ initialPanel = null }) {
  const navigate = useNavigate();
  const lobby = useLobby();
  const [prefs, updatePrefs] = usePrefs();
  const [activePanel, setActivePanel] = useState(initialPanel);
  const closePanel = () => {
    setActivePanel(null);
    if (initialPanel) navigate({ to: '/duelist-next', replace: true });
  };
  const togglePanel = name => activePanel === name ? closePanel() : setActivePanel(name);
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
    if (!activePanel) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setActivePanel(null);
        if (initialPanel) navigate({ to: '/duelist-next', replace: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanel, initialPanel, navigate]);

  return (
    <main className={activePanel ? 'duelist-hub duelist-hub--panel-open' : 'duelist-hub'}>
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

      {activePanel && <button type="button" className="duelist-hub-scrim" onClick={closePanel} aria-label="Close the open menu" tabIndex={-1} />}

      <section className="duelist-hub-body" aria-label="Duelist home">
        <nav className="duelist-hub-nav" aria-label="Home actions">
          <div className="duelist-hub-nav-intro">
            <span>ENTER THE ARENA</span>
            <p>Master the blade. Shape the Veil.</p>
          </div>
          <button type="button" data-primary="true" onClick={() => togglePanel('play')}
            className="duelist-hub-nav-action" data-active={activePanel === 'play'} aria-expanded={activePanel === 'play'}
            aria-controls="duelist-play-drawer"><Play fill="currentColor" /> PLAY</button>
          <Link to="/duelist-next/$page" params={{ page: 'story' }}
            className="duelist-hub-nav-action"><BookOpen /> STORY CAMPAIGN</Link>
          <button type="button" onClick={() => togglePanel('character')}
            className="duelist-hub-nav-action" data-active={activePanel === 'character'} aria-expanded={activePanel === 'character'}
            aria-controls="duelist-character-panel"><User /> CHARACTER</button>
        </nav>
      </section>

      {activePanel === 'play' && (
        <section id="duelist-play-drawer" className="duelist-hub-overlay" aria-label="Play mode selection">
          <div className="duelist-hub-overlay-head">
            <div>
              <span className="duelist-hub-eyebrow">PLAY</span>
              <h2>Choose your game mode</h2>
              <p className="duelist-menu-note">Choose a battle, then enter practice or an available online match.</p>
            </div>
            <button type="button" className="duelist-hub-small-button"
              onClick={closePanel} aria-label="Close play menu"><X size={18} /></button>
          </div>

          <div className="duelist-hub-play-layout">
            <div className="duelist-hub-playlists" aria-label="Play type">
              <button type="button" className="duelist-hub-category"
                data-selected={playlist === 'normal'} aria-pressed={playlist === 'normal'}
                onClick={() => setPlaylist('normal')}>
                <Users aria-hidden="true" />
                <span>CASUAL</span>
              </button>
              <button type="button" className="duelist-hub-category"
                data-selected={playlist === 'ranked'} aria-pressed={playlist === 'ranked'}
                onClick={() => setPlaylist('ranked')}>
                <Trophy aria-hidden="true" />
                <span>RANKED PLAY</span>
                <small>Planned</small>
              </button>
              <Link to="/duelist-next/$page" params={{ page: 'practice' }} className="duelist-hub-category">
                <Shield aria-hidden="true" /><span>TRAINING</span>
              </Link>
              <button type="button" className="duelist-hub-category" disabled title="Custom lobbies are planned">
                <Settings aria-hidden="true" /><span>CUSTOM</span><small>Planned</small>
              </button>
            </div>

            <div className="duelist-hub-mode-list" aria-label="Game modes">
              <h3>Game modes</h3>
              <div className="duelist-hub-modes">
                {visibleModes.map(mode => {
                  const Icon = HUB_GLYPHS[mode.symbol] || Target;
                  return (
                    <button key={mode.id} type="button" className="duelist-hub-mode" data-mode={mode.id}
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
              <div className="duelist-hub-mode-art" aria-hidden="true" data-map-picture={Boolean(mapPicture(selected?.route))}>
                {mapPicture(selected?.route) ? <OnlineArenaPreview mode={selected.route} compact/> : <><span className="duelist-hub-mode-art-glow" /><SelectedIcon /><span>{selected?.title || 'Choose a mode'}</span></>}
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

      {activePanel === 'settings' && (
        <section id="duelist-settings-panel" className="duelist-hub-overlay duelist-hub-overlay--settings"
          role="region" aria-label="Settings overlay">
          <div className="duelist-hub-overlay-head">
            <div><span className="duelist-hub-eyebrow">PREFERENCES</span><h2>Settings</h2>
              <p className="duelist-menu-note">Graphics, audio, controls and local match options.</p></div>
            <button type="button" className="duelist-hub-small-button" onClick={closePanel} aria-label="Close settings"><X size={18} /></button>
          </div>
          <div className="duelist-menu-page duelist-hub-panel-content"><SettingsContent sharedPrefs={prefs} sharedUpdate={updatePrefs} /></div>
        </section>
      )}

      {activePanel === 'character' && (
        <section id="duelist-character-panel" className="duelist-hub-overlay duelist-hub-overlay--character"
          role="region" aria-label="Character progression overlay">
          <div className="duelist-hub-overlay-head">
            <div><span className="duelist-hub-eyebrow">CHARACTER</span><h2>Fighter &amp; progression</h2>
              <p className="duelist-menu-note">Select a fighter, view class levels and follow mastery milestones.</p></div>
            <button type="button" className="duelist-hub-small-button" onClick={closePanel} aria-label="Close character"><X size={18} /></button>
          </div>
          <div className="duelist-menu-page duelist-hub-panel-content"><FighterContent sharedPrefs={prefs} sharedUpdate={updatePrefs} /></div>
        </section>
      )}

      <footer className="duelist-hub-footer" aria-label="Quick navigation">
        <button type="button" onClick={() => togglePanel('settings')} className="duelist-hub-footer-item"
          data-active={activePanel === 'settings'} aria-expanded={activePanel === 'settings'} aria-controls="duelist-settings-panel">
          <Settings /> SETTINGS
        </button>
      </footer>
    </main>
  );
}

function Button({ children, onClick, primary = false, disabled = false, title = undefined }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`duelist-menu-button${primary ? ' is-primary' : ''}`}>
      {children}
    </button>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <label className="duelist-menu-choice">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function MatchRows({ matches, onJoin }) {
  if (!matches?.length) return <p className="text-sm text-white/45">No matches running right now.</p>;
  return (
    <div className="duelist-menu-match-list">
      {matches.map((m) => (
        <div key={m.id} className="duelist-menu-match-row flex items-center gap-3 px-4 py-2.5 text-sm">
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
  const play = (online) => online
    ? navigate({ to: '/duelist-next/$page', params: { page: 'online-play' }, search: { mode } })
    : navigate({ to: '/duelist-next/play', search: { mode, online: 0 } });
  const Icon = m.icon;
  const here = (lobby.matches || []).filter((x) => x.mode === mode);
  return (
    <MenuShell matchEntry title={m.title} subtitle={m.blurb} back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
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
        <div className="duelist-menu-panel space-y-4">
          {mode === 'online' ? (
            <>
              <p className="text-sm text-white/60">Browse public servers and choose a Duel, Transport, team battle, or another available match directly.</p>
              <Button primary onClick={() => play(true)}>
                <Users className="h-4 w-4" /> Browse servers
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
              <Button primary onClick={() => play(true)}>
                <Users className="h-4 w-4" /> Browse servers
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
    <MenuShell matchEntry title="Join" subtitle="Jump into a match that has players in it. You take a bot's place." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
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

export function FighterContent({ sharedPrefs, sharedUpdate } = {}) {
  const [localPrefs, localUpdate] = usePrefs();
  const prefs = sharedPrefs || localPrefs;
  const update = sharedUpdate || localUpdate;
  const selected = BODIES[prefs.fighter] || BODIES.maskedWarrior || Object.values(BODIES)[0];
  const selectedClassId = CLASS_IDS.includes(prefs.classId) ? prefs.classId : 'duelist';
  const classXp = classProgressOf(prefs);
  const totalXp = classXp[selectedClassId] || 0;
  const mastery = levelFromXp(totalXp);
  const selectedClass = CLASSES[selectedClassId];
  return (
    <>
      <section className="duelist-menu-panel duelist-fighter-current" aria-label="Current character">
        <div>
          <span className="duelist-menu-eyebrow-text">CURRENTLY SELECTED</span>
          <h2>{selected?.name || 'Fighter'}</h2>
          <p className="duelist-menu-helper">{FIGHTER_NOTES[prefs.fighter] || 'Your chosen fighter for every game mode.'}</p>
          <p className="duelist-menu-note">Your choice is remembered on this browser and used in practice and matches.</p>
        </div>
        <div className="duelist-fighter-mark" aria-hidden="true">{selected?.name?.[0] || 'D'}</div>
      </section>
      <section className="duelist-character-progress" aria-label="Class mastery progression">
        <div className="duelist-character-progress-head">
          <div>
            <span className="duelist-menu-eyebrow-text">CLASS MASTERY</span>
            <h3>{selectedClass.name} <span>LEVEL {mastery.level} / {LEVEL_CAP}</span></h3>
            <p className="duelist-menu-helper">Class mastery persists across matches. Changing the appearance does not reset EXP.</p>
          </div>
          <label className="duelist-character-class-choice">Combat class
            <select value={selectedClassId} onChange={event => update({ classId: event.target.value })}>
              {CLASS_IDS.map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}
            </select>
          </label>
        </div>
        <div className="duelist-character-xp-values">
          <span>{mastery.capped ? 'MAX LEVEL REACHED' : `${mastery.into.toLocaleString()} / ${mastery.need.toLocaleString()} EXP TO NEXT LEVEL`}</span>
          <strong>{Math.min(Math.max(0, totalXp), xpForLevel(LEVEL_CAP)).toLocaleString()} TOTAL EXP</strong>
        </div>
        <div className="duelist-character-xp-track" role="progressbar" aria-label="Progress to next class level"
          aria-valuemin={0} aria-valuemax={mastery.need || 1} aria-valuenow={mastery.capped ? 1 : mastery.into}
          aria-valuetext={mastery.capped ? 'Maximum level reached' : `Level ${mastery.level}, ${Math.round(mastery.progress * 100)}% to next level`}>
          <span style={{ width: `${Math.round(mastery.progress * 100)}%` }} />
        </div>
        <h4>Mastery milestones</h4>
        <div className="duelist-character-milestones" role="list">
          {Object.entries(MILESTONES).map(([level, reward]) => (
            <div key={level} role="listitem" className="duelist-character-milestone" data-earned={mastery.level >= Number(level)}>
              <strong>LV {level}</strong>
              <span>{reward.toUpperCase()}</span>
              <small>{mastery.level >= Number(level) ? 'REACHED' : 'LOCKED'}</small>
            </div>
          ))}
        </div>
        <p className="duelist-menu-note">Milestones recognize class mastery; no paid pass or claimable items are active.</p>
      </section>
      <div className="mt-7">
        <h3 className="duelist-menu-section-heading">Select your fighter</h3>
        <p className="duelist-menu-helper mt-1 mb-4">Choose a character below. The selection updates immediately; it does not change the combat class.</p>
        <div className="duelist-fighter-grid">
          {Object.entries(BODIES).map(([id, fighter]) => {
            const on = prefs.fighter === id;
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => update({ fighter: id })}
                className="duelist-menu-card duelist-fighter-option" data-selected={on}>
                <div className="duelist-fighter-option-visual" aria-hidden="true"><span>{fighter.name[0]}</span></div>
                <div className="duelist-fighter-option-name">
                  <span>{fighter.name}</span>
                  {on && <CheckCircle2 aria-label="Selected" />}
                </div>
                <p className="duelist-menu-helper">{FIGHTER_NOTES[id] || 'Select this fighter.'}</p>
                <span className="duelist-menu-eyebrow-text">{on ? 'SELECTED' : 'SELECT FIGHTER'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function FighterPage() {
  return <MenuShell title="Character" subtitle="Your fighter and class mastery." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}><FighterContent /></MenuShell>;
}

function readAudio() {
  try { return { volume: 0.8, muted: false, ...JSON.parse(window.localStorage.getItem('duelist.audio') || '{}') }; } catch { return { volume: 0.8, muted: false }; }
}

// an action's name without its hint ("Roll (into a push or a strike)" -> "Roll")
const ACTION_NAME = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label.replace(/\s*\(.*\)$/, '')]));

/** Change what a key does: pick an action, then press the key or mouse button for it (Esc to cancel). */
export function KeyBindings({ keys, onChange }) {
  const [waiting, setWaiting] = useState(null); // the action waiting for its new input
  const [note, setNote] = useState('');
  const bound = keysFrom(keys);
  useEffect(() => {
    if (!waiting) return undefined;
    const take = (code, e) => {
      e.preventDefault();
      e.stopPropagation();
      if (code === 'Escape') { setWaiting(null); setNote(''); return; }
      if (!bindable(code)) { setNote(`${keyLabel(code)} cannot be used. Pick another, or Esc to cancel.`); return; }
      const result = rebind(bound, waiting, code);
      onChange(result.keys);
      setNote(result.swapped ? `${keyLabel(code)} was ${ACTION_NAME[result.swapped]}: the two swapped.` : '');
      setWaiting(null);
    };
    const onKey = (e) => take(e.code, e);
    const onMouse = (e) => take(`Mouse${e.button}`, e);
    const onContext = (e) => e.preventDefault();
    // listening starts once the click that asked for a key is over (its mousedown came before it), so that click
    // is never taken as the key; and at once, so a key pressed straight after it is not missed
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('contextmenu', onContext, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('contextmenu', onContext, true);
    };
  }, [waiting, keys]);
  const changed = ACTIONS.some(({ id }) => bound[id] !== DEFAULT_KEYS[id]);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => { onChange({ ...DEFAULT_KEYS }); setNote('Back to the default keys.'); setWaiting(null); }} disabled={!changed}
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/35 hover:text-white disabled:opacity-40">Reset to defaults</button>
      </div>
      <div className="duelist-settings-keymap">
        {ACTIONS.map(({ id, label }) => (
          <div key={id} className="duelist-settings-keymap-row">
            <span>{label}</span>
                <button type="button" onClick={() => { setWaiting(waiting === id ? null : id); setNote(''); }} aria-label={`Change the key for ${label}`}
                  className={`min-w-[7.5rem] flex-none rounded-lg border px-2.5 py-1 text-xs transition ${waiting === id ? 'border-amber-300/70 bg-amber-300/10 text-amber-100' : 'border-white/10 text-cyan-100/90 hover:border-white/30'}`}>
                  {waiting === id ? 'Press a key…' : keyLabel(bound[id])}
                </button>
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-[1rem] text-xs text-white/50">{waiting ? `Press the key or mouse button for “${ACTION_NAME[waiting]}”. Esc cancels.` : note}</p>
    </div>
  );
}

export function SettingsContent({ sharedPrefs, sharedUpdate } = {}) {
  const [localPrefs, localUpdate] = usePrefs();
  const prefs = sharedPrefs || localPrefs;
  const update = sharedUpdate || localUpdate;
  const [audio, setAudio] = useState(readAudio);
  const saveAudio = (patch) => {
    const next = { ...audio, ...patch };
    setAudio(next);
    try { window.localStorage.setItem('duelist.audio', JSON.stringify(next)); } catch { /* this visit only */ }
  };
  return (
    <>
      <section className="duelist-menu-panel mb-5" aria-label="Graphics diagnostics">
        <GraphicsRuntimePanel sceneId="duelist-adventure"/>
      </section>
      <div className="duelist-settings-columns">
        <div className="duelist-settings-stack">
          <section className="duelist-menu-panel">
            <h2 className="duelist-menu-section-heading"><Volume2 aria-hidden="true" /> Audio</h2>
            <p className="duelist-menu-helper mt-2">Change the volume of in-game sounds, impacts and effects.</p>
            <label className="duelist-setting-row block">
              <span className="duelist-setting-label"><span>Master volume</span><span className="duelist-setting-value">{Math.round(audio.volume * 100)}%</span></span>
              <span className="duelist-menu-note">The overall level of game audio.</span>
              <input type="range" aria-label="Master volume" min="0" max="1" step="0.05" value={audio.volume}
                onChange={(event) => saveAudio({ volume: Number(event.target.value) })} />
            </label>
            <label className="duelist-setting-row duelist-setting-toggle">
              <input type="checkbox" checked={!audio.muted} onChange={(event) => saveAudio({ muted: !event.target.checked })} />
              <span><span className="duelist-setting-label">Sound enabled</span><span className="duelist-menu-note">Turn all game audio on or off without changing your saved volume.</span></span>
            </label>
            <label className="duelist-setting-row duelist-setting-toggle">
              <input type="checkbox" checked={prefs.voices !== false} onChange={(event) => update({ voices: event.target.checked })} />
              <span><span className="duelist-setting-label">Spoken comms</span><span className="duelist-menu-note">The story missions&apos; radio lines are read aloud, each speaker in a voice of their own. The words stay on screen either way.</span></span>
            </label>
          </section>
          <section className="duelist-menu-panel">
            <h2 className="duelist-menu-section-heading"><MousePointer2 aria-hidden="true" /> Controls</h2>
            <p className="duelist-menu-helper mt-2">Fine-tune how quickly the camera responds to mouse movement.</p>
            <label className="duelist-setting-row block">
              <span className="duelist-setting-label"><span>Mouse sensitivity</span><span className="duelist-setting-value">{prefs.sensitivity.toFixed(2)}×</span></span>
              <span className="duelist-menu-note">Lower for precision, higher for faster camera movement.</span>
              <input type="range" aria-label="Mouse sensitivity" min="0.3" max="2.5" step="0.05" value={prefs.sensitivity}
                onChange={(event) => update({ sensitivity: Number(event.target.value) })} />
            </label>
          </section>
        </div>
        <div className="duelist-settings-stack">
          <section className="duelist-menu-panel">
            <h2 className="duelist-menu-section-heading"><Gamepad2 aria-hidden="true" /> Bot matches</h2>
            <p className="duelist-menu-helper mt-2">These options apply when you start a local match against computer-controlled opponents.</p>
            <label className="duelist-setting-row block">
              <span className="duelist-setting-label">AI difficulty</span>
              <span className="duelist-menu-note">Trainee is the easiest opponent; Master is the most challenging.</span>
              <select value={prefs.level} onChange={(event) => update({ level: event.target.value })}>
                {LEVELS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="duelist-setting-row block">
              <span className="duelist-setting-label">Practice bots</span>
              <span className="duelist-menu-note">Number of computer-controlled fighters when using Practice mode.</span>
              <select value={String(prefs.bots)} onChange={(event) => update({ bots: Number(event.target.value) })}>
                {[1, 2, 3].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'bot' : 'bots'}</option>)}
              </select>
            </label>
          </section>
          <div className="duelist-menu-panel">
            <span className="duelist-menu-eyebrow-text">SAVED PREFERENCES</span>
            <p className="duelist-menu-helper mt-2">Changes take effect for new actions and matches and are saved in this browser. Audio and mouse settings do not alter multiplayer combat rules.</p>
          </div>
        </div>
      </div>
      <section className="duelist-menu-panel mt-5" aria-label="Keyboard and mouse controls">
        <h2 className="duelist-menu-section-heading">Keyboard &amp; mouse</h2>
        <p className="duelist-menu-helper mt-2">Choose a control, then press the key or mouse button you want for it. Two controls never share one: the control that had it takes the one you gave up.</p>
        <KeyBindings keys={prefs.keys || {}} onChange={(next) => update({ keys: next })} />
      </section>
    </>
  );
}

export function SettingsPage() {
  return <MenuShell title="Settings" subtitle="Audio, controls, graphics and practice." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}><SettingsContent /></MenuShell>;
}

/** The story: each mission with its parts and its buttons; one box joins a friend's crew, whatever it plays. */
export function StoryPage() {
  const navigate = useNavigate();
  const lobby = useLobby();
  const [prefs] = usePrefs();
  const [typed, setTyped] = useState('');
  const code = typed.toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 5);
  const play = (search) => navigate({ to: '/duelist-next/play', search: { mode: 'story', ...search } });
  const offline = lobby.serverUrl ? 'The match server is not answering.' : 'Online play is not set up yet.';
  return (
    <MenuShell title="Story Campaign" subtitle="Cooperative operations for one to four players, in order. A crew that finishes one goes on to the next." back={{ to: '/duelist-next', label: 'Duelist Adventure' }}>
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(255px,330px)]">
        <div className="space-y-10">
          {STORY_MISSIONS.map((m) => <MissionCard key={m.id} mission={m} lobby={lobby} offline={offline} play={play} />)}
          <p className="duelist-menu-note">About ten minutes each. If the crew falls, play resumes from the stage&apos;s checkpoint. A line of light shows where a shot will go: roll or guard. Hold F to use crates, consoles, cores and bells.</p>
        </div>
        <aside className="duelist-menu-panel duelist-story-crew-actions" aria-label="Join a crew">
          <span className="duelist-menu-eyebrow-text">PLAY WITH A CREW</span>
          <div>
            <h2 className="duelist-menu-section-heading">Join a friend&apos;s crew</h2>
            <p className="duelist-menu-helper mt-2">Their room code takes you to their crew, whichever operation it is playing.</p>
          </div>
          <div className="duelist-story-code-row">
            <input type="text" value={code} onChange={(event) => setTyped(event.target.value)}
              placeholder="CODE" maxLength={5} aria-label="Five-character crew code"
              className="text-sm uppercase tracking-widest" />
            <Button onClick={() => play({ online: 1, room: code })} disabled={!lobby.online || code.length !== 5}>
              <LogIn className="h-4 w-4" /> Join by code
            </Button>
          </div>
          {!lobby.online && <p className="duelist-menu-note" role="status">{offline} Solo play is still available.</p>}
          <div className="h-px bg-white/10" />
          <div className="duelist-story-summary">
            <Users size={16} aria-hidden="true" />
            <span>1–4 fighters · each operation is manned for the size of your crew</span>
          </div>
          <p className="duelist-menu-note">Current fighter: <strong>{BODIES[prefs.fighter]?.name}</strong>. <Link to="/duelist-next/$page" params={{ page: 'fighter' }} className="text-cyan-200 hover:underline">Change fighter</Link></p>
        </aside>
      </div>
    </MenuShell>
  );
}

// One operation of the campaign: its brief, its stages as a timeline, and its own ways in.
function MissionCard({ mission, lobby, offline, play }) {
  const crews = (lobby.matches || []).filter((x) => x.mode === 'story' && x.mission === mission.id && x.open);
  return (
    <section aria-label={`Operation ${mission.number}: ${mission.title}`}>
      <div className="duelist-story-brief">
        <span className="duelist-menu-eyebrow-text">OPERATION {String(mission.number).padStart(2, '0')} / {mission.title.toUpperCase()}</span>
        <h2>{mission.tagline}</h2>
        <p className="duelist-menu-helper">{mission.line}</p>
      </div>
      <ol className="duelist-story-milestones">
        {mission.parts.map(([title, line], index) => (
          <li key={title} className="duelist-story-milestone">
            <span className="duelist-story-step" aria-label={'Stage ' + (index + 1)}>{String(index + 1).padStart(2, '0')}</span>
            <div className="duelist-story-milestone-copy">
              <h3>{title}</h3>
              <p>{line}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button primary onClick={() => play({ mission: mission.id, online: 0 })}><Play className="h-4 w-4" /> Play solo</Button>
        <Button onClick={() => play({ mission: mission.id, online: 1, room: 'new' })} disabled={!lobby.online} title={lobby.online ? 'You receive a room code to share with up to three friends' : offline}>
          <Users className="h-4 w-4" /> Create private crew
        </Button>
        <Button onClick={() => play({ mission: mission.id, online: 1 })} disabled={!lobby.online} title={lobby.online ? undefined : offline}>
          <LogIn className="h-4 w-4" /> {crews.length ? `Join an open crew (${crews.length})` : 'Start an open crew'}
        </Button>
      </div>
    </section>
  );
}
