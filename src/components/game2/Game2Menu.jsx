import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, ChevronRight, DoorOpen, Gamepad2, GraduationCap, Keyboard, Monitor, Plus, Server, Settings2, Ship, Swords, Target, Users, Volume2 } from 'lucide-react';
import { GAME2_SKIRMISH_MAPS } from './engine/arenaMaps.js';
import { BOSS_WAY_CHOICES, bossWayChoice } from './engine/bossWay/bossSelection.js';
import { MISSION_RETURN_CHANNEL } from './missionWindow.js';
import { DEFAULT_SETTINGS, QUALITY_PRESETS, loadSettings, saveSettings } from './settings.js';
import Game2BindingEditor from './Game2BindingEditor';
import Game2OnlineCommand from './Game2OnlineCommand';
import RecreateCombat from './RecreateCombat';
import './Game2Menus.css';
import './game2-command-menu.css';
import {GAME2_CHARACTERS,readGame2Character,selectGame2Character} from './characters/game2Characters.js';

const ASSET_BASE = `${import.meta.env?.BASE_URL ?? '/'}game2/`;

// Game 2 main menu: the menu runs down the left, the item you click opens on the right, and behind it a live duel
// (two AI fighters in the Lightsaber Training arena, engine 'attract' mode) plays under a slow cinematic camera.
// Picking a fight calls onStart({ choice, mapId, saber }); Game2Duel.jsx runs it.
// The console-style rail exposes only five destinations.
const MENU_ITEMS = [
  { id: 'story', label: 'Story Campaign', icon: BookOpen },
  { id: 'multiplayer', label: 'Online Multiplayer', icon: Users },
  { id: 'training', label: 'Combat Training', icon: Target },
  { id: 'settings', label: 'Settings & Controls', icon: Settings2 },
  { id: 'exit', label: 'Exit to Games Hub', icon: DoorOpen },
];
// Existing features remain available from contextual panels instead of the rail.
const SECONDARY_ITEMS = [
  { id: 'characters', label: 'Change Character' },
  { id: 'recreate', label: 'Recreate Combat Lab' },
  { id: 'boss_way', label: 'Boss Encounters' },
  { id: 'fleet_assault', label: 'Fleet Assault' },
  { id: 'skirmish', label: 'Skirmish vs AI' },
  { id: 'practice', label: 'Duel Practice' },
  { id: 'tutorial', label: 'Arena Tutorial' },
  { id: 'online_arenas', label: 'Online Play' },
  { id: 'settings_graphics', label: 'Graphics & Gameplay' },
  { id: 'settings_audio', label: 'Audio' },
  { id: 'settings_keys', label: 'Key Bindings' },
  { id: 'settings_combat', label: 'Combat' },
  { id: 'controls', label: 'Combat Guide' },
];

// Context options live immediately to the right of the Jedi Duels rail;
// selecting or arrowing through an option changes only the detail on its right.
const COMMAND_SUBPAGES = {
  multiplayer: [
    { id: 'online_arenas', label: 'Online Play', icon: Server },
    { id: 'skirmish', label: 'Skirmish vs AI', icon: Swords },
    { id: 'practice', label: 'Duel Practice', icon: GraduationCap },
    { id: 'fleet_assault', label: 'Fleet Assault', icon: Ship },
  ],
  training: [
    { id: 'tutorial', label: 'Arena', icon: GraduationCap },
    { id: 'practice', label: 'Duel', icon: Swords },
    { id: 'boss_way', label: 'Boss Encounters', icon: Target },
  ],
  settings: [
    { id: 'settings_graphics', label: 'Graphics', icon: Monitor },
    { id: 'settings_audio', label: 'Audio', icon: Volume2 },
    { id: 'settings_keys', label: 'Key Binds', icon: Keyboard },
    { id: 'settings_combat', label: 'Combat', icon: Swords },
  ],
};
const COMMAND_SECTION_NAMES = {
  multiplayer: 'Multiplayer', training: 'Combat Training', settings: 'Settings',
};

// offline matches against AI fighters (engine/teamMatch.js)
const SKIRMISH_MODES = [
  { id: 'ffa', title: 'Free-for-all', size: '1 + 49 AI', blurb: 'Fifty fighters, every one for themselves. First to 15 defeats wins. Respawn after 3 s with 3 s of immunity.' },
  { id: 'tdm', title: 'Team Deathmatch', size: '25 v 25', blurb: 'Blue against red. The first team to 50 defeats takes the match. Respawn after 4 s with 3 s of immunity.' },
  { id: 'ctf', title: 'Capture the Flag', size: '15 v 15', blurb: "Steal the enemy flag, carry it home and defend your own. First to three captures." },
  { id: 'sudden', title: 'Sudden Death', size: '25 v 25', blurb: 'One life each, fifty fighters. Eliminate the entire opposing team.' },
];


const CONTROLS = [
  ['Move · walk · crouch / roll', 'W A S D · Shift · C'],
  ['Jump · Force Jump', 'Space · hold Space'],
  ['Saber attack · stance', 'Left mouse (flick to aim the swing) · Tab'],
  ['Saber throw', 'Hold right mouse: it homes in on the nearest foe and spins inside them'],
  ['Rolling thrust · roll throw', 'Attack with W held during a roll: up out of it into a lunge stab at the foe in front · hold right mouse mid-roll: the saber flies straight out ahead'],
  ['Saber kata', 'Left + right mouse together: a chain of your stance\'s attacks, pressing forward (50 Force)'],
  ['Saberstaff kicks', 'Right mouse + W / A / S / D with the saberstaff (Jedi Academy moves installed): a kick that way knocks them down'],
  ['Draw saber · Execute', 'R (when a foe glows red and the prompt shows, R executes)'],
  ['Force Push (charge)', 'Hold 1, release to throw: the longer the hold, the harder the push; the full 3 s pushes with both hands, twice as far'],
  ['Force Pull', '2 · jump first to yank them up in front of you; Push them while they hang there to blow them away'],
  ['Grip · Lightning · Heal', '3 · 4 · 5 (hold to channel)'],
  ['Lightning storm', 'Keep holding 4 for 1.5 s: raise your open hand and the lightning arcs up into the sky and strikes down on every foe within 45 m (drains Force fast)'],
  ['Speed · Mind Trick · Rage · Protect · Absorb', '6 · 7 · 8 · 9 · 0'],
  ['Force Levitate', 'G · lifts a foe helplessly; any hit on them, or an attack by you, drops them'],
  ['Force Repulse (special)', 'X at 80% of the special meter (filled by damage and defeats): rise, curl up, burst open; foes around you are blasted away and disintegrate'],
  ['Mind Dominance (special)', 'V at 55% of the meter: the foe in front of you (up to 15 m) turns their own lightsaber around and ignites it through themselves; Force Absorb resists it'],
  ['Combos', 'Push, then Speed: dash in front of them before they land · throw the saber, then Lightning: charge it'],
  ['Counter', 'Blocking a strike can parry the blade away (the attacker\'s arms fly up) and you strike back on your own (a click strikes sooner): a critical vertical strike, double damage; a killing one splits them in half. Left at a quarter of their health or less, R finishes them with the Speed cut: a dash right past them that cuts them in half'],
  ['Force Dodge · Evade', 'Automatic: 30% independent chance to flash-step an incoming saber strike before auto-parry, free of Force cost. Hold Q to guarantee an eligible incoming dodge, costing 15% of maximum Force per successful evade (1.5s cooldown). A/D pick side, S goes back, W circles the attacker. Q alone does not dodge or drain Force.'],
  ['Target lock-on', 'Click middle mouse wheel to lock onto an enemy in front of you. The camera and aim follow the target while you move and strafe. Click again to unlock; lock ends if the foe is defeated, too far away, or hidden behind cover. Remappable under Settings.'],
  ['Force clash', 'Push (or Lightning) right back at someone pushing (or zapping) you: click as fast as you can for 3 s; more clicks wins, and your blast drives through and throws them back'],
  ['Taunt', 'T'],
  ['Force selector', 'Mouse wheel or [ ] · F casts the highlighted power'],
  ['Controls · mute · zoom', 'F1 · M · Ctrl + wheel'],
];

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } });
  useEffect(() => {
    let mq; try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return undefined; }
    const on = () => setReduce(mq.matches); mq.addEventListener?.('change', on); return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

// Drifting stars and nebula, drawn while the live duel loads (and instead of it with reduced motion / menu motion off).
function Starfield({ animate }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return undefined;
    const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
    let raf = 0, w = 0, h = 0;
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6 }));
    const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, 2); w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const n1 = ctx.createRadialGradient(w * (0.72 + 0.03 * Math.sin(t * 0.00007)), h * 0.38, 0, w * 0.72, h * 0.38, Math.max(w, h) * 0.6);
      n1.addColorStop(0, 'rgba(48,90,115,0.22)'); n1.addColorStop(0.5, 'rgba(24,50,70,0.13)'); n1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = n1; ctx.fillRect(0, 0, w, h);
      const n2 = ctx.createRadialGradient(w * 0.86, h * (0.78 + 0.03 * Math.cos(t * 0.00005)), 0, w * 0.86, h * 0.78, Math.max(w, h) * 0.45);
      n2.addColorStop(0, 'rgba(152,117,75,0.11)'); n2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = n2; ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        const x = ((s.x + t * 0.000004 * s.z) % 1) * w, y = s.y * h, a = 0.35 + 0.45 * Math.abs(Math.sin(s.tw + t * 0.0012 * s.z));
        ctx.fillStyle = `rgba(200,220,255,${a * s.z})`; ctx.fillRect(x, y, 1.4 * s.z + 0.3, 1.4 * s.z + 0.3);
      }
    };
    const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
    resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
    if (animate) raf = requestAnimationFrame(loop); else draw(0);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [animate]);
  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

// The live duel behind the menu (engine 'attract' mode). Fades in on its first rendered frame; muted, no input.
// With the system's reduced-motion preference the camera holds still (calm) and only the fighters move; the Settings
// switch "Live menu background" turns it off entirely.
function LiveDuel({ onLive, calm }) {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    let cancelled = false, game = null, renderer = null, raf = 0;
    const canvas = document.createElement('canvas'), hud = document.createElement('canvas');
    for (const el of [canvas, hud]) Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
    canvas.setAttribute('aria-hidden', 'true'); hud.setAttribute('aria-hidden', 'true');
    host.append(canvas, hud);
    (async () => {
      try {
        const [{ Renderer }, { loadAll }, { Game }] = await Promise.all([import('./engine/gl.js'), import('./engine/assets.js'), import('./engine/game.js')]);
        if (cancelled) return;
        renderer = new Renderer(canvas); renderer.maxDpr = 1;
        const assets = await loadAll(ASSET_BASE, () => {}, { map: true, mapId: 'training' });
        if (cancelled) return;
        game = new Game(renderer, assets, canvas, hud, { mode: 'attract', calm, sfxBase: `${ASSET_BASE}sfx/` });
        let first = true;
        const loop = (time) => { if (cancelled) return; game.frame(time); if (first) { first = false; onLive(true); } raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      } catch (error) { console.warn('Game 2 menu backdrop unavailable', error); }
    })();
    return () => {
      cancelled = true; cancelAnimationFrame(raf); onLive(false);
      if (game) game.dispose();
      try { renderer?.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
      canvas.remove(); hud.remove();
    };
  }, [onLive, calm]);
  return <div ref={hostRef} aria-hidden="true" className="absolute inset-0" />;
}

function MenuBackdrop({ motion }) {
  const reduce = useReducedMotion(), [live, setLive] = useState(false);
  const onLive = useCallback((v) => setLive(v), []);
  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="game2-menu-backdrop" data-live={live ? 'true' : 'false'}>
      <Starfield animate={!reduce && !live} />
      {motion && <div className="absolute inset-0" style={{ opacity: live ? 1 : 0, transition: 'opacity 1.6s ease' }}><LiveDuel onLive={onLive} calm={reduce} /></div>}
      <div className="absolute inset-0 bg-gradient-to-r from-[#03101b]/80 via-[#06131d]/33 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#040e17]/58 to-transparent" />
    </div>
  );
}

function Panel({ kicker, title, children }) {
  return <div className="g2-shell g2-panel g2-command-panel">
    <div className="g2-command-panel__mark" aria-hidden="true">✧</div>
    <div className="g2-panel-kicker">{kicker}</div>
    <h2>{title}</h2>
    <div className="g2-command-panel__body">{children}</div>
  </div>;
}
function MapPicker({ value, onSelect }) {
  return <div className="g2-refined-map-picker" role="group" aria-label="Map">
    {Object.values(GAME2_SKIRMISH_MAPS).map(map => (
      <button type="button" key={map.id} aria-pressed={value === map.id}
        onClick={() => onSelect(map.id)} className="g2-refined-map-picker__option">
        <span>{map.label}</span><small>{map.size}</small>
      </button>
    ))}
  </div>;
}
function CommandBack({ label = 'Back', onClick }) {
  return <button type="button" className="g2-command-back" onClick={onClick}>
    <ArrowLeft size={15} aria-hidden="true" />{label}
  </button>;
}

function PlayButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="g2-play g2-command-continue group mt-6 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
      {children} <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </button>
  );
}

function Choice({ on, onClick, title, sub, blurb }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className="g2-refined-choice">
      <span className="g2-refined-choice__selection" aria-hidden="true" />
      <span className="g2-refined-choice__copy">
        <strong>{title}</strong>{blurb && <small>{blurb}</small>}
      </span>
      {sub && <span className="g2-refined-choice__tag">{sub}</span>}
    </button>
  );
}


function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-white/75">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} className="flex-1 accent-cyan-300" />
      <span className="w-12 text-right font-mono text-xs text-white/60">{format ? format(value) : value}</span>
    </label>
  );
}

function Toggle({ label, value, onChange, hint }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-white/75">{label}</span>
      <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition ${value ? 'bg-cyan-400/80' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
      {hint && <span className="text-xs text-white/40">{hint}</span>}
    </div>
  );
}

// The same stored settings and real binding editor, but divided into small
// focused pages so the player doesn't enter a wall of controls.
function SettingsPanel({ settings, setSettings, tab, onBack }) {
  const set = key => next => setSettings(previous => saveSettings({ ...previous, [key]: next }));
  const percent = value => Math.round(value * 100) + '%';
  return (
    <Panel kicker={tab === 'audio' ? 'Settings · Sound' : 'Settings · Visuals'}
      title={tab === 'audio' ? 'Audio' : 'Graphics & Gameplay'}>
      {onBack && <CommandBack label="Back to Settings" onClick={onBack} />}
      {tab === 'audio' ? <div className="g2-command-settings">
        <Slider label="Sound Effects Volume" value={settings.masterVolume} min={0} max={1} step={0.05}
          onChange={set('masterVolume')} format={percent} />
        <Slider label="Music Volume" value={settings.musicVolume} min={0} max={1} step={0.05}
          onChange={set('musicVolume')} format={percent} />
      </div> : <div className="g2-command-settings">
        <Slider label="Mouse Sensitivity" value={settings.sensitivity} min={0.25} max={3} step={0.05}
          onChange={set('sensitivity')} format={value => value.toFixed(2) + 'x'} />
        <Toggle label="Invert Mouse Y" value={settings.invertY} onChange={set('invertY')} />
        <Slider label="Field of View" value={settings.fov} min={50} max={90} step={1}
          onChange={set('fov')} format={value => value + '°'} />
        <div className="g2-command-field-row">
          <label htmlFor="g2-time">Training Time of Day</label>
          <select id="g2-time" value={settings.timeOfDay}
            onChange={event => set('timeOfDay')(event.target.value)}>
            <option value="morning">Morning</option>
            <option value="day">Day</option>
            <option value="sunset">Sunset</option>
            <option value="night">Night</option>
          </select>
        </div>
        <Slider label="Training Temperature" value={settings.temperatureC} min={-15} max={35} step={1}
          onChange={set('temperatureC')} format={value => value + '°C'} />
        <fieldset className="g2-command-fieldset">
          <legend>Render Quality</legend>
          <div className="g2-command-presets" role="group" aria-label="Render quality">
            {QUALITY_PRESETS.map(({ id:q, label }) => (
              <button key={q} type="button" aria-pressed={settings.quality === q}
                onClick={() => set('quality')(q)}>{label}</button>
            ))}
          </div>
        </fieldset>
        <Toggle label="Show FPS" value={settings.showFps} onChange={set('showFps')} />
        <Toggle label="Live Menu Background" value={settings.menuMotion} onChange={set('menuMotion')}
          hint="Show the real duel behind the menu" />
      </div>}
      <button type="button" onClick={() => setSettings(saveSettings(DEFAULT_SETTINGS))}
        className="g2-command-secondary g2-command-restore">Restore default settings</button>
    </Panel>
  );
}

export default function Game2Menu({ onStart,userId=null }) {
  const navigate = useNavigate();
  const offlineDesktop = typeof window !== 'undefined' && window.atomXEGame2?.mode === 'offline';
  const [item, setItem] = useState('story');
  const [section, setSection] = useState('story');
  const [multiplayerMode, setMultiplayerMode] = useState('online_arenas');
  const [trainingMode, setTrainingMode] = useState('tutorial');
  const [settingsTab, setSettingsTab] = useState('settings_graphics');
  const [avatar,setAvatar] = useState(()=>readGame2Character(undefined,userId));
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return undefined;
    const channel=new BroadcastChannel(MISSION_RETURN_CHANNEL);
    channel.onmessage=event=>{if(event.data?.type==='return-to-jedi-duels'){setSection('story');setItem('story');}};
    return ()=>channel.close();
  },[]);
  const [settings, setSettings] = useState(loadSettings);
  const [mode, setMode] = useState('ffa');
  const [mapId, setMapId] = useState('skybridge');
  const [selectedBoss,setSelectedBoss]=useState('rancor');
  const navRef = useRef(null);

  const start = (choice, extra = {}) => onStart({ choice, mapId, avatarId:avatar.id, ...extra });
  // Ignore stale or retired menu identifiers, including removed admin and archive items.
  const pick = (id) => { if (!MENU_ITEMS.some(entry => entry.id === id)) return; if (id === 'exit') { if (offlineDesktop) void window.atomXEGame2.returnToLauncher(); else navigate({ to: '/' }); } else setItem(id); if (id !== 'exit') setSection(id); };
  // Up / Down move through the menu, Enter opens an item (buttons already take Enter / Space)
  const onNavKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...navRef.current.querySelectorAll('[data-menu-item]')];
    const i = list.indexOf(document.activeElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
  };
  const activeItem = item === 'multiplayer' ? multiplayerMode
    : item === 'training' ? trainingMode
    : item === 'settings' ? settingsTab : item;
  const extensionSection = COMMAND_SUBPAGES[section] && item !== 'characters' ? section : null;
  const activeSubpage = COMMAND_SUBPAGES[section]?.some(option => option.id === activeItem)
    ? activeItem : COMMAND_SUBPAGES[section]?.[0]?.id;
  const chooseSubpage = id => {
    if (section === 'multiplayer') setMultiplayerMode(id);
    if (section === 'training') setTrainingMode(id);
    if (section === 'settings') setSettingsTab(id);
    // Returning from a previous nested view keeps the extension anchored.
    setItem(section);
  };
  const onSubpageKey = event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = COMMAND_SUBPAGES[section] || [];
    const index = options.findIndex(option => option.id === document.activeElement?.dataset?.game2Subpage);
    if (index < 0) return;
    event.preventDefault();
    const next = options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length];
    chooseSubpage(next.id);
    event.currentTarget.querySelector('[data-game2-subpage="' + next.id + '"]')?.focus();
  };
  let panel = null;
  if (activeItem === 'characters') panel = (
    <Panel kicker="Game 2 · Player identity" title="Choose your character">
      <p className="mb-4 text-sm leading-relaxed text-white/70">
        {offlineDesktop ? 'Offline mode includes the local Explorer model. Extra hosted character skins need an internet connection. ' : ''}
        All choices use the same existing movement, lightsaber, Force, combat
        and online rules. These uploaded models have different skeletons:
        Revan includes an idle clip, while the other three use approximate
        procedural visual gestures until fully retargeted motion banks exist.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Selectable Game 2 characters">
        {GAME2_CHARACTERS.filter(model=>!offlineDesktop||!model.url).map(model=>(
          <button type="button" key={model.id}
            data-testid={`game2-character-${model.id}`}
            aria-pressed={avatar.id===model.id}
            onClick={()=>setAvatar(selectGame2Character(model.id,undefined,userId))}
            className={`rounded-xl border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-cyan-300 ${avatar.id===model.id?'border-cyan-300/85 bg-cyan-300/15':'border-white/15 bg-white/[.035] hover:border-white/35'}`}>
            <strong className="block text-base text-white">{model.name}</strong>
            <span className="mt-1 block text-xs text-white/55">{model.label}</span>
            <span className="mt-2 block text-[11px] text-cyan-200/70">{model.skinJoints} joints · {model.clips}</span>
          </button>
        ))}
      </div>
      {avatar.attribution&&(
        <p className="mt-4 text-[11px] leading-relaxed text-white/55">
          Model: {avatar.author}. {avatar.license}.
          <a className="ml-2 underline decoration-cyan-200/50" href={avatar.attribution}
             target="_blank" rel="noopener noreferrer">Source and attribution</a>.
          Character names and likenesses remain subject to their respective owners' rights.
        </p>
      )}
      <p className="mt-4 text-xs text-cyan-200/85">Current selection: {avatar.name}. It carries into all Game 2 modes.</p>
      <PlayButton onClick={()=>{setSection('story');setItem('story');}}>Continue to game modes</PlayButton>
    </Panel>
  );
  else if (activeItem === 'story') panel = (
    <Panel kicker="Story Mode · Mission 1" title="Kejim Post">
      <p className="g2-command-intro">Infiltrate Kejim Post, uncover Imperial evidence, and reach extraction.</p>
      <details className="g2-command-disclosure">
        <summary>Read mission briefing</summary>
        <p className="text-sm leading-relaxed text-white/70">Land with Jan Ors, infiltrate the Imperial outpost, and follow the recovered evidence beyond the hangar into nine connected northern districts. Cross the fractured gorge, navigate the detention wing and reactor works, fight coordinated dark Jedi squads, and choose whether to redirect power or use a safer shutdown before transmitting the evidence at the relay. Reach the extraction apron with your discoveries intact. The expanded Kejim environment combines industrial grates, rock formations, atmospheric effects, and the original combat rules.</p>
      </details>
      <PlayButton onClick={() => start('single')}>Begin mission</PlayButton>
      <div className="mt-5"><button type="button" className="rounded-lg border border-cyan-200/30 px-4 py-2 text-sm text-cyan-100" onClick={() => setItem('recreate')}>Recreate · Combat Lab</button></div>
    </Panel>
  );
  else if (activeItem === 'recreate') panel = (
    <Panel kicker="Story · Experimental" title="Recreate · Combat Lab">
      <button type="button" className="mb-4 text-xs text-cyan-200 underline" onClick={() => setItem('story')}>Back to Story</button>
      <RecreateCombat />
    </Panel>
  );
  else if (activeItem === 'boss_way') panel = (
    <Panel kicker="Combat Training · Boss Encounters" title="Choose your opponent">
      <p className="g2-command-intro">Face a powerful opponent in the dedicated Boss Way arena.</p>
      <div className="g2-refined-layout g2-refined-layout--boss">
        <div className="g2-refined-layout__selection">
          <div className="g2-refined-section-label">Boss selection</div>
          <div className="g2-refined-vertical-options" role="group" aria-label="Choose boss">
            {Object.values(BOSS_WAY_CHOICES).map(boss => (
              <button key={boss.id} type="button"
                disabled={offlineDesktop && boss.id === 'dragon'} onClick={() => setSelectedBoss(boss.id)}
                aria-pressed={selectedBoss === boss.id} data-testid={`game2-boss-choice-${boss.id}`}
                className="g2-refined-vertical-options__option">
                <Target size={16} aria-hidden="true" />
                <span>{boss.label}</span><ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <div className="g2-refined-layout__details">
          <span className="g2-refined-detail-kicker">SELECTED ENCOUNTER</span>
          <h3>{bossWayChoice(selectedBoss).title}</h3>
          <p>{bossWayChoice(selectedBoss).description}</p>
          <div className="g2-refined-stats">
            <div><span>Boss Health</span><strong>50,000</strong></div>
            <div><span>Health Bars</span><strong>10 × 5,000</strong></div>
          </div>
          <p className="g2-refined-status">{selectedBoss === 'rancor'
            ? 'Playable with a temporary creature model; no rewards are granted.'
            : offlineDesktop
            ? 'Requires hosted assets; not available offline.'
            : 'Dragon visuals load from hosted game storage.'}</p>
          <details className="g2-command-disclosure">
            <summary>Encounter details &amp; asset information</summary>
            {selectedBoss === 'rancor' ? (
              <p className="mt-3 text-sm leading-relaxed text-amber-200/85">
                The Rancor fight works using the existing animated combat placeholder.
                If you install the original converted Rancor GLB at game2/bossway/rancor.glb in your local game,
                its actual mesh takes precedence. Until then this is not the authentic Raven Rancor appearance.
                No rewards are granted in this prototype.
              </p>
            ) : (
              <div className="mt-3">
                <p>Select Fight the Dragon to enter the arena. The dragon model and animation data load automatically from game storage. No player uploads or local setup are required.</p>
                <p>Dragon model by Oscar Creativo. Asset usage and distribution remain subject to the owner's license permissions.</p>
              </div>
            )}
          </details>
          <PlayButton onClick={() => start(bossWayChoice(selectedBoss).choice,{mapId:'rancor_pit'})}>
            {selectedBoss === 'rancor' ? 'Fight the Rancor' : 'Fight the Dragon'}
          </PlayButton>
        </div>
      </div>
    </Panel>
  );
  else if (activeItem === 'online_arenas') panel = (
    <Game2OnlineCommand
      offlineDesktop={offlineDesktop}
      onSwitchOnline={() => window.atomXEGame2?.chooseMode('online')}
      onEnter={session => start('online', { mapId:session.mapId, onlineSession:session })}
      onPractice={() => start('multi',{mapId:'training'})}
    />
  );
  else if (activeItem === 'fleet_assault') panel = (
    <Panel kicker="New mode · Republic vs Separatists · 40+ pilots" title="Fleet Assault">
      <p className="text-sm leading-relaxed text-white/70">Starfighter battle between cruiser fleets, each cruiser led by a Jedi commander. Boost and dogfight, strip shields and knock out subsystems, board the enemy cruisers once their shields fall, and win the planet's comms array for a buff while the losers lose team voice.</p>
      <p className="mt-3 text-xs leading-relaxed text-amber-200/75">The space fight is playable now: practice against AI pilots in this page, or online once the Game 2 server with Fleet Assault is deployed. Saber combat aboard the cruisers and on the planet comes later.</p>
      <PlayButton onClick={() => start('fleet_assault')}>Launch Fleet Assault</PlayButton>
    </Panel>
  );
  else if (activeItem === 'skirmish') panel = (
    <Panel kicker="Multiplayer · Offline AI" title="Skirmish vs AI">
      <p className="g2-command-intro">Choose your battle rules and map. Opponents are computer-controlled.</p>
      <div className="g2-refined-layout">
        <div className="g2-refined-layout__selection">
          <div className="g2-refined-section-label">Match Type</div>
          <div className="g2-refined-vertical-options" role="group" aria-label="Match type">
            {SKIRMISH_MODES.map(entry =>
              <div key={entry.id} className="g2-refined-choice-row">
                <Choice on={mode === entry.id} onClick={() => setMode(entry.id)}
                  title={entry.title} sub={entry.size} />
                <button type="button" className="g2-refined-choice-row__play"
                  aria-label={'Play ' + entry.title}
                  title={'Start ' + entry.title + ' now'}
                  onClick={() => { setMode(entry.id); start(entry.id); }}>
                  <ChevronRight size={15} aria-hidden="true" /> Play
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="g2-refined-layout__details">
          <span className="g2-refined-detail-kicker">MATCH SETUP</span>
          <h3>{SKIRMISH_MODES.find(entry => entry.id === mode).title}</h3>
          <p>{SKIRMISH_MODES.find(entry => entry.id === mode).blurb}</p>
          <div className="g2-refined-section-label">Choose Arena</div>
          <MapPicker value={mapId} onSelect={setMapId} />
          <div className="g2-refined-summary">
            <span>Selected Map</span><strong>{GAME2_SKIRMISH_MAPS[mapId]?.label || mapId}</strong>
          </div>
          <PlayButton onClick={() => start(mode)}>Start {SKIRMISH_MODES.find(entry => entry.id === mode).title}</PlayButton>
        </div>
      </div>
    </Panel>
  );
  else if (activeItem === 'practice') panel = (
    <Panel kicker="Combat Training · Duel" title="Duel Practice">
      <p className="g2-command-intro">Sharpen your saber and Force techniques against a single Reborn opponent.</p>
      <div className="g2-refined-layout g2-refined-layout--duel">
        <div className="g2-refined-layout__selection">
          <div className="g2-refined-section-label">Training Rules</div>
          <div className="g2-refined-duel-rule"><Swords size={21} aria-hidden="true" />
            <strong>1 vs 1</strong><span>One AI opponent</span>
          </div>
          <div className="g2-refined-duel-rule"><Target size={21} aria-hidden="true" />
            <strong>Infinite Practice</strong><span>Toggle in the arena to disable wins and losses</span>
          </div>
        </div>
        <div className="g2-refined-layout__details">
          <span className="g2-refined-detail-kicker">TRAINING ARENA</span>
          <h3>Choose your location</h3>
          <p>Move freely, experiment with combos and practice without a multiplayer queue.</p>
          <MapPicker value={mapId} onSelect={setMapId} />
          <div className="g2-refined-summary">
            <span>Selected Map</span><strong>{GAME2_SKIRMISH_MAPS[mapId]?.label || mapId}</strong>
          </div>
          <PlayButton onClick={() => start('multi')}>Enter Duel Practice</PlayButton>
        </div>
      </div>
    </Panel>
  );
  else if (activeItem === 'tutorial') panel = (
    <Panel kicker="Guided Training · offline" title="Learn every move in the arena">
      <p className="g2-command-intro">Choose a lesson, watch the instructor demonstrate it, then practice inside the arena.</p>
      <PlayButton onClick={() => start('tutorial', { mapId: 'training' })}>Enter tutorial arena</PlayButton>
    </Panel>
  );
  else if (activeItem === 'settings_graphics') panel = (
    <SettingsPanel settings={settings} setSettings={setSettings} tab="graphics" />
  );
  else if (activeItem === 'settings_audio') panel = (
    <SettingsPanel settings={settings} setSettings={setSettings} tab="audio" />
  );
  else if (activeItem === 'settings_keys') panel = (
    <Panel kicker="Settings · Controls" title="Key Bindings">
      <div className="g2-command-bindings">
        <Game2BindingEditor bindings={settings.bindings}
          onChange={bindings => setSettings(current => saveSettings({ ...current, bindings }))} />
      </div>
    </Panel>
  );
  else if (activeItem === 'settings_combat') panel = (
    <Panel kicker="Settings · Gameplay" title="Combat">
      <p className="g2-command-intro">Choose your combat rules and open the move reference when needed.</p>
      <fieldset className="g2-command-fieldset">
        <legend>Combat Ruleset</legend>
        <div className="g2-command-rule-options" role="group" aria-label="Combat ruleset">
          <Choice title="Classic Combat" on={settings.combatMode === 'classic'}
            blurb="Current combat mechanics."
            onClick={() => setSettings(previous => saveSettings({ ...previous, combatMode:'classic' }))} />
          <Choice title="360° Experimental" on={settings.combatMode === 'directional360'}
            sub="In development" blurb="Saves your preference; classic rules are still used."
            onClick={() => setSettings(previous => saveSettings({ ...previous, combatMode:'directional360' }))} />
        </div>
        <p className="g2-command-small-note">Online matches use classic rules. Experimental combat is not active yet.</p>
      </fieldset>
      <details className="g2-command-disclosure">
        <summary>Combat Guide &amp; Key Reference</summary>
        <dl className="g2-command-guide grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[minmax(0,13rem)_1fr]">
          {CONTROLS.map(([key, text]) => [
            <dt key={key + 'k'} className="font-semibold text-cyan-200/80">{key}</dt>,
            <dd key={key + 'v'} className="text-white/70">{text}</dd>,
          ])}
        </dl>
      </details>
    </Panel>
  );
  else if (activeItem === 'controls') panel = (
    <Panel kicker="Training · Reference" title="Combat Guide">
      <CommandBack label="Back to Settings" onClick={() => setItem('settings')} />
      <dl className="g2-command-guide grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[minmax(0,13rem)_1fr]">
        {CONTROLS.map(([k, v]) => [<dt key={k + 'k'} className="font-semibold text-cyan-200/80">{k}</dt>, <dd key={k + 'v'} className="text-white/70">{v}</dd>])}
      </dl>
    </Panel>
  );

  // Esc is a true console-style Back command for every nested menu. When
  // capturing an input binding the editor consumes the event in capture phase.
  const isNested = item !== section;
  const nestedBack = () => setItem(section);
  const currentPageName = SECONDARY_ITEMS.find(entry => entry.id === activeItem)?.label
    || MENU_ITEMS.find(entry => entry.id === section)?.label || 'Game Menu';
  useEffect(() => {
    if (!isNested) return undefined;
    const onEscape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
      event.preventDefault();
      setItem(section);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isNested, section]);

  return (
    <div className="g2-command-menu absolute inset-0 overflow-hidden bg-[#02040a] text-white"
      data-testid="game2-menu" data-game2-menu-design="command">
      <MenuBackdrop motion={settings.menuMotion} />
      <div className="g2-command-layout relative z-10 flex h-full flex-col md:flex-row">
        <nav ref={navRef} onKeyDown={onNavKey} aria-label="Game 2 main menu"
          className="g2-command-rail">
          <header className="g2-command-brand">
            <div className="g2-command-brand__eyebrow"><Gamepad2 size={17} aria-hidden="true" /> Game 2</div>
            <h1>JEDI DUELS</h1>
            <div className="g2-command-brand__rule" aria-hidden="true"><span>✧</span></div>
          </header>
          <ul className="g2-command-nav">
            {MENU_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <li key={id} className={id === 'exit' ? 'g2-command-nav__exit' : ''}>
                  <button type="button" onClick={() => pick(id)}
                    aria-current={active ? 'page' : undefined} data-menu-item={id}
                    className={'g2-command-nav__button' + (active ? ' is-active' : '')}>
                    <span className="g2-command-nav__bar" aria-hidden="true" />
                    <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                    <span>{offlineDesktop && id === 'exit' ? 'Back to Launcher' : label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="g2-command-rail__bottom">
            <div className="g2-command-character" data-testid="game2-selected-character">
              <span className="g2-command-character__heading">Selected Character</span>
              <div className="g2-command-character__row">
                <span className="g2-command-character__portrait" aria-hidden="true">
                  {String(avatar.name || 'E').slice(0,1)}
                </span>
                <div>
                  <strong>{avatar.name}</strong>
                  <button type="button" onClick={() => setItem('characters')}>Change Character</button>
                </div>
              </div>
            </div>
            <p className="g2-command-controls">
              <span><kbd>↑ ↓</kbd> Navigate</span>
              <span><kbd>Enter</kbd> Select</span>
              <span><kbd>Esc</kbd> Back</span>
            </p>
          </div>
        </nav>
        <section className="g2-command-main" aria-live="polite" aria-label={currentPageName}>
          <div className="g2-command-main__content">
            {extensionSection ? (
              <div className={'g2-command-extension' + (['multiplayer','training'].includes(extensionSection) ? ' g2-command-extension--wide' : '')}
                data-game2-extension={extensionSection}>
                {['multiplayer','training'].includes(extensionSection) && (
                  <header className="g2-command-extension__topline">
                    <div className="g2-command-extension__topline-title">{COMMAND_SECTION_NAMES[extensionSection]}</div>
                  </header>
                )}
                <aside className="g2-command-extension__options" aria-label={COMMAND_SECTION_NAMES[extensionSection] + ' options'}>
                  {!['multiplayer','training'].includes(extensionSection) &&
                    <div className="g2-command-extension__section-name">{COMMAND_SECTION_NAMES[extensionSection]}</div>}
                  <div className="g2-command-extension__items" role="group" aria-label={COMMAND_SECTION_NAMES[extensionSection] + ' selections'}
                    onKeyDown={onSubpageKey}>
                    {COMMAND_SUBPAGES[extensionSection].map(({ id, label, icon: Icon }) => (
                      <button type="button" key={id} data-game2-subpage={id}
                        aria-pressed={activeSubpage === id} onClick={() => chooseSubpage(id)}
                        onFocus={() => { if (activeSubpage !== id) chooseSubpage(id); }}
                        onMouseEnter={() => { if (activeSubpage !== id) chooseSubpage(id); }}
                        className={'g2-command-extension__option' + (activeSubpage === id ? ' is-selected' : '')}>
                        <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </aside>
                {!['multiplayer','training'].includes(extensionSection) &&
                  <span className="g2-command-extension__divider" aria-hidden="true" />}
                <div className="g2-command-extension__details" data-game2-active-detail={activeSubpage}>
                  {panel}
                </div>
              </div>
            ) : (
              <>
                {isNested && !['online_arenas','settings_graphics','settings_audio','settings_keys','settings_combat','controls'].includes(item) &&
                  <CommandBack label={'Back to ' + (MENU_ITEMS.find(entry => entry.id === section)?.label || 'Menu')}
                    onClick={nestedBack} />}
                {panel}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
