// Duelist Adventure's match HUD (the owner's spec of 2026-11-20). Two systems:
//   the universal HUD, the same in every mode: portrait, level, class, HP and EXP (bottom left); the special's
//     charge (bottom centre); skills, Will / stamina / shield and the weapon (bottom right); kill count and kill
//     feed (top right);
//   the mode's own scoreboard at the top centre (chosen from the match's mode, which online is the server's), with
//     the banners that announce flag, point and streak events under it.
// The frames are the transparent templates in public/ui/duelist/hud (tools/duelist/hud-templates.mjs); every value
// here is live UI drawn over them. Sizes are reference pixels (a 1920 x 1080 screen): each cluster is anchored to
// its corner and scaled with the screen, and narrow screens stack the bottom clusters.
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight, Cross, EyeOff, Feather, Flag, Flame, Focus, Hand, HeartPulse, Magnet, Radar, RotateCw, ShieldCheck, ShieldPlus, Shuffle,
  Skull, Sparkles, Sword, Swords, VenetianMask, Waves, Zap,
} from 'lucide-react';
import { BODIES } from './assets.mjs';
import { CLASSES } from '../core/classes.mjs';
import { equippedHudSlots } from './equippedHudItems.mjs';
import { canPressAbility, healthNumbers, pointState, specialPercent } from './glassHud.mjs';
import { FLAG_STATE_TEXT } from './hudFeed.mjs';
import './duelistHud.css';

const ABILITY_ICONS = { leapStrike: ArrowUpRight, grip: Hand, repulse: Radar, bladeThrow: RotateCw, pull: Magnet, quickstep: Zap, quickstepAura: Zap,
  counter: ShieldCheck, cloak: EyeOff, push: Waves, empower: Flame, dominate: Shuffle,mend: HeartPulse, levitate: Feather, breach: Focus };
const SPECIAL_ICONS = { rage: Flame, execution: Swords, shadowExecution: Skull, sanctuary: ShieldPlus };
export const CLASS_ICONS = { warrior: Sword, duelist: Swords, assassin: VenetianMask, healer: Cross };
const WEAPON_NAMES = { sword: 'Crystal blade', dualBlades: 'Twin blades', staff: 'Bladed staff' };
const LEGACY_NAMES = { push: 'Push', pull: 'Pull', grip: 'Grip', breach: 'Veil Breach' };
// under a skill slot there is room for a word or two
const SHORT_NAMES = { grip: 'Grip', push: 'Push', pull: 'Pull', empower: 'Empower', counter: 'Counter', quickstepAura: 'Quickstep' };
const TEAM_NAMES = { blue: 'Blue', red: 'Red' };

const clock = (seconds) => {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (n) => `${Math.round(Math.max(0, Math.min(100, n || 0)))}%`;

/** How big the HUD is drawn for a screen: { scale, layout: 'wide' | 'compact' } (reference: 1920 x 1080). */
export function hudScale(width, height) {
  if (!(width > 0) || !(height > 0)) return { scale: 1, layout: 'wide' };
  if (width < 860) return { scale: Math.max(0.42, Math.min(0.8, (width - 16) / 680, height / 1000)), layout: 'compact' };
  return { scale: Math.max(0.5, Math.min(1.3, Math.min(width / 1920, height / 1080))), layout: 'wide' };
}

// ---- the universal HUD

function Vitals({ you, fighter, classId, portrait, level, onClass, items = null }) {
  const cls = CLASSES[classId] || null;
  const ClassIcon = CLASS_ICONS[classId] || Sparkles;
  const hp = Math.max(0, Math.min(1, you.hp));
  const tone = you.dead ? 'dead' : hp > 0.5 ? 'high' : hp > 0.25 ? 'mid' : 'low';
  const equipped = items === null ? null : equippedHudSlots(items);
  return (
    <section className="dh-anchor dh-bl" aria-label="Your fighter">
      <div className="dh-part dh-portrait">
        {portrait ? <img className="dh-portrait-img" src={portrait} alt="" /> : <ClassIcon className="dh-portrait-icon" aria-hidden="true" />}
        <span className="dh-level" data-max={level.capped || undefined}
          title={level.capped ? `Level ${level.level}: this class is at its highest` : `Level ${level.level}: ${level.into} / ${level.need} EXP`}>{level.level}</span>
      </div>
      <div className="dh-part dh-vitals">
        {equipped && <div className="dh-equipped" role="list" aria-label="Equipped items" data-testid="duelist-equipped-items">
          {equipped.map((item, slot) => <div
            key={slot} role="listitem" className="dh-equipped-slot"
            data-filled={!!item} data-tier={item?.tier ?? 0}
            aria-label={item ? `Slot ${slot + 1}: ${item.name}, Tier ${item.tier}` : `Slot ${slot + 1}: Empty`}
            title={item ? `${item.name} · Tier ${item.tier}${item.passive ? ` · ${item.passive}` : ''}` : 'Empty item slot'}>
            {item && <>
              <img src={item.art} alt="" loading="lazy" draggable={false} />
              <span className="dh-equipped-tier" aria-hidden="true">{item.tier}</span>
            </>}
          </div>)}
        </div>}
        <button type="button" className="dh-class" onClick={onClass || undefined} disabled={!onClass} data-class={classId || 'none'}
          title={cls ? `${cls.name}: change class` : 'No class'} aria-label={cls ? `${cls.name}. Change class` : 'No class'}>
          <ClassIcon aria-hidden="true" />
        </button>
        <span className="dh-hp-text">HP: <b>{healthNumbers(you.hpValue, you.hpMax)}</b></span>
        <span className="dh-who">{cls ? cls.name : BODIES[fighter]?.name || 'Duelist'}{you.dead ? ' · down' : ''}</span>
        <div className="dh-hp" data-tone={tone} role="progressbar" aria-label="Health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hp * 100)}>
          {Array.from({ length: 10 }, (_, i) => <i key={i}><b style={{ width: `${Math.max(0, Math.min(1, hp * 10 - i)) * 100}%` }} /></i>)}
        </div>
        <span className="dh-exp-label">EXP</span>
        <div className="dh-exp" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)}>
          <b style={{ width: `${level.progress * 100}%` }} />
        </div>
      </div>
    </section>
  );
}

function Special({ hud, onPower }) {
  const cls = CLASSES[hud.classId];
  if (!cls) return null;
  const value = specialPercent(hud.specialMeter);
  const cost = cls.special.cost;
  const ready = value !== null && hud.specialMeter + 1e-6 >= cost && !hud.dead && !hud.specialState;
  const Icon = SPECIAL_ICONS[cls.special.id] || Sparkles;
  // a special that costs less than the whole meter marks each charge on it
  const marks = cost < 100 ? Array.from({ length: Math.floor(100 / cost + 1e-6) - 1 }, (_, i) => ((i + 1) * cost) / 100) : [];
  return (
    <section className="dh-anchor dh-bc" aria-label="Special ability">
      {hud.lockOn && <div className="dh-lock">Locked on</div>}
      <div className="dh-part dh-special" data-ready={ready}>
        <button type="button" className="dh-special-emblem" disabled={!ready} onClick={() => onPower?.('special')}
          title={cls.special.text} aria-label={`${cls.special.name}${ready ? ', ready' : ''}`}>
          <Icon aria-hidden="true" />
        </button>
        <span className="dh-special-name">{cls.special.name}</span>
        <span className="dh-special-pct">{value === null ? '' : `${value}%`}</span>
        <div className="dh-special-meter" role="progressbar" aria-label="Special charge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0}>
          <b style={{ width: `${value ?? 0}%` }} />
          {marks.map((k) => <i key={k} style={{ left: `${k * 100}%` }} />)}
        </div>
        <span className="dh-special-key"><kbd>{hud.specialKey}</kbd>{hud.specialState === 'pending' ? 'Activating…' : hud.specialState === 'active' ? 'Active' : ready ? 'Ready' : ''}</span>
      </div>
    </section>
  );
}

function Skills({ hud, onPower }) {
  const you = hud.you;
  const gripping = useRef(false);
  // a class's four abilities; without a class (the story's crews), the first build's four
  const slots = hud.abilities
    || (hud.powers || []).slice(0, 4).map((p, i) => ({ id: p.id, name: LEGACY_NAMES[p.id] || p.id, slot: i + 1, key: p.key, ready: p.ready, cost: p.cost, total: 0 }));
  const press = (a) => {
    if (!canPressAbility(a, you.dead)) return;
    if (a.id === 'grip') { // a touch holds the grip until the next touch lets go
      onPower?.(gripping.current ? 'release' : `ability${a.slot}`);
      gripping.current = !gripping.current;
    } else { gripping.current = false; onPower?.(`ability${a.slot}`); }
  };
  const weapon = CLASSES[hud.classId] ? WEAPON_NAMES[CLASSES[hud.classId].weapon] : 'Crystal blade';
  const veil = you.noVeil ? 'none' : you.veil;
  return (
    <section className="dh-anchor dh-br" aria-label="Skills and weapon">
      <div className="dh-part dh-skills">
        {slots.map((a, i) => {
          const Icon = ABILITY_ICONS[a.id] || Sparkles;
          const cooling = a.ready > 0;
          const short = !cooling && Number.isFinite(you.willValue) && a.cost > you.willValue;
          return (
            <div key={a.id} className="dh-slot" style={{ left: 8 + i * 96 }}>
              <button type="button" className="dh-skill" data-cooling={cooling} data-short={short} data-testid={`duelist-skill-${a.id}`}
                disabled={!canPressAbility(a, you.dead)} onClick={() => press(a)}
                aria-label={`${a.name}, key ${a.key}${cooling ? `, ${a.ready.toFixed(1)} seconds` : ''}`}>
                <Icon aria-hidden="true" />
                {cooling && a.total > 0 && <span className="dh-skill-sweep" style={{ height: `${Math.min(1, a.ready / a.total) * 100}%` }} />}
                {cooling && <span className="dh-skill-cd">{a.ready >= 10 ? Math.ceil(a.ready) : a.ready.toFixed(1)}</span>}
                <kbd>{a.key}</kbd>
                {a.rank > 0 && <span className="dh-skill-rank" title={`Rank ${a.rank} of 5`} aria-label={`Rank ${a.rank} of 5`}>{'I II III IV V'.split(' ')[a.rank - 1]}</span>}
              </button>
              <span className="dh-skill-name" title={a.name}>{SHORT_NAMES[a.id] || a.name}</span>
            </div>
          );
        })}
        <div className="dh-bar dh-bar-will" data-veil={veil} style={{ top: 22 }}><span>Will</span><b style={{ width: `${Math.max(0, Math.min(1, you.will)) * 100}%` }} /></div>
        <div className="dh-bar dh-bar-stamina" data-winded={!!you.winded} style={{ top: 44 }}><span>Stamina</span><b style={{ width: `${Math.max(0, Math.min(1, you.stamina)) * 100}%` }} /></div>
        <div className="dh-bar dh-bar-shield" style={{ top: 66 }}><span>Shield</span><b style={{ width: `${Math.max(0, Math.min(1, you.shield)) * 100}%` }} /></div>
        <span className="dh-weapon">{weapon}{hud.classId ? ` · Boost ${hud.matchBoost ?? 0}/3` : ''}</span>
        {hud.mode && (
          <span className="dh-mode" data-mode={hud.mode} title="Sword mode: swift, balanced or heavy">
            {['swift', 'balanced', 'heavy'].map((m) => <i key={m} data-on={m === hud.mode || undefined} />)}
            <b>{hud.mode}</b>{hud.modeKey ? <kbd>{hud.modeKey}</kbd> : null}
          </span>
        )}
      </div>
    </section>
  );
}

function Kills({ rows, count }) {
  return (
    <section className="dh-anchor dh-tr" aria-label="Eliminations">
      <div className="dh-part dh-kills">
        <span className="dh-kills-label">Kill count</span>
        <span className="dh-kills-count">{count ?? 0}</span>
        <div className="dh-kill-rows" aria-live="polite">
          {(rows || []).map((k, i) => {
            const By = CLASS_ICONS[k.byClass] || Sparkles;
            const Who = CLASS_ICONS[k.whoClass] || Sparkles;
            return (
              <div key={k.id} className="dh-kill" style={{ top: 46 + i * 33 }} data-mine={k.mine}>
                <By aria-hidden="true" /><b data-team={k.byTeam || 'none'}>{k.byName}</b>
                <Swords className="dh-kill-mark" aria-label="eliminated" />
                <b data-team={k.whoTeam || 'none'}>{k.whoName}</b><Who aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---- the mode's scoreboard (top centre)

const Side = ({ team, mine, children }) => (
  <div className={`dh-side dh-side-${team}`} data-mine={mine}>
    <span className="dh-side-name">{TEAM_NAMES[team]}{mine ? ' · you' : ''}</span>
    {children}
  </div>
);

function CtfBoard({ view, myTeam, flagStates }) {
  const need = view.scoreToWin || 3;
  return (
    <div className="dh-part dh-board dh-ctf" data-testid="duelist-board-ctf">
      <span className="dh-timer">{view.overtime?"OVERTIME":clock(view.clockLeft)}</span>
      {['blue', 'red'].map((t) => (
        <Side key={t} team={t} mine={myTeam === t}><span className="dh-score">{view.teamScores?.[t] ?? 0}<small>/ {need}</small></span></Side>
      ))}
      {['blue', 'red'].map((t) => {
        const raw = flagStates?.[t] || view.flags?.[t]?.state || 'home';
        const state = raw === 'carried' ? 'taken' : raw;
        return (
          <span key={t} className={`dh-flag dh-flag-${t}`} data-state={state} title={`${TEAM_NAMES[t]} flag: ${FLAG_STATE_TEXT[state]}`}>
            <Flag aria-hidden="true" /><small>{FLAG_STATE_TEXT[state]}</small>
          </span>
        );
      })}
    </div>
  );
}

function ControlBoard({ view, myTeam }) {
  return (
    <div className="dh-part dh-board dh-control3" data-testid="duelist-board-control">
      {['blue', 'red'].map((t) => (
        <Side key={t} team={t} mine={myTeam === t}>
          <span className="dh-score">{pct(view.teamScores?.[t])}</span>
          <span className="dh-progress"><b style={{ width: pct(view.teamScores?.[t]) }} /></span>
        </Side>
      ))}
      {(view.controlPoints || []).slice(0, 3).map((p, i) => (
        <span key={p.id} className="dh-point" style={{ left: 262 + i * 48 }} data-state={pointState(p)} data-owner={p.owner || 'none'} data-capturing={p.capturing || 'none'}
          title={`Point ${p.id}: ${pointState(p)}`}>
          <i style={{ height: `${Math.round((p.capturing ? p.progress || 0 : 0) * 100)}%` }} />
          <b>{p.id}</b>
        </span>
      ))}
    </div>
  );
}

// one active point (a mode that gives view.singlePoint: { id, owner, capturing, progress, contested })
function SingleBoard({ view, myTeam }) {
  const p = view.singlePoint;
  return (
    <div className="dh-part dh-board dh-control1" data-testid="duelist-board-single">
      {['blue', 'red'].map((t) => <Side key={t} team={t} mine={myTeam === t}><span className="dh-score">{pct(view.teamScores?.[t])}</span></Side>)}
      <span className="dh-point dh-point-single" data-state={pointState(p)} data-owner={p.owner || 'none'} data-capturing={p.capturing || 'none'}>
        <i style={{ height: `${Math.round((p.capturing ? p.progress || 0 : 0) * 100)}%` }} />
        <b>{p.id}</b>
      </span>
    </div>
  );
}

function TeamBoard({ view, myTeam, unit }) {
  return (
    <div className="dh-part dh-board dh-tdm" data-testid={`duelist-board-${view.mode}`}>
      <span className="dh-timer">{clock(view.clockLeft)}</span>
      {['blue', 'red'].map((t) => <Side key={t} team={t} mine={myTeam === t}><span className="dh-score">{view.teamScores?.[t] ?? 0}</span></Side>)}
      {view.scoreToWin ? <span className="dh-target">First to {view.scoreToWin}{unit ? ` ${unit}` : ''}</span> : null}
    </div>
  );
}

function DuelBoard({ view, me }) {
  const mine = view.people?.find((p) => p.id === me) || view.people?.[0];
  const foe = view.people?.find((p) => p.id !== mine?.id);
  const toWin = Math.max(1, Math.ceil((view.rounds || 1) / 2));
  const pips = (n) => Array.from({ length: Math.min(3, toWin) }, (_, i) => <i key={i} data-won={i < n} />);
  return (
    <div className="dh-part dh-board dh-duel" data-testid="duelist-board-duel">
      {view.clockLeft !== null && <span className="dh-timer dh-timer-plain">{clock(view.clockLeft)}</span>}
      <div className="dh-side dh-side-blue" data-mine="true"><span className="dh-side-name">{mine?.name || 'You'}</span><span className="dh-score">{mine?.roundWins ?? 0}</span><span className="dh-pips">{pips(mine?.roundWins ?? 0)}</span></div>
      <span className="dh-round"><small>Round</small>{view.round || 1}</span>
      <div className="dh-side dh-side-red"><span className="dh-side-name">{foe?.name || 'Opponent'}</span><span className="dh-score">{foe?.roundWins ?? 0}</span><span className="dh-pips">{pips(foe?.roundWins ?? 0)}</span></div>
    </div>
  );
}

// free for all: you against the best of the rest
function FfaBoard({ view, me }) {
  const mine = view.people?.find((p) => p.id === me);
  const rival = (view.people || []).filter((p) => p.id !== me).sort((a, b) => b.defeats - a.defeats)[0];
  return (
    <div className="dh-part dh-board dh-duel" data-testid="duelist-board-ffa">
      {view.clockLeft !== null && <span className="dh-timer dh-timer-plain">{clock(view.clockLeft)}</span>}
      <div className="dh-side dh-side-blue" data-mine="true"><span className="dh-side-name">You</span><span className="dh-score">{mine?.defeats ?? 0}</span></div>
      <span className="dh-round"><small>First to</small>{view.scoreToWin || '—'}</span>
      <div className="dh-side dh-side-red"><span className="dh-side-name">{rival?.name || 'Rival'}</span><span className="dh-score">{rival?.defeats ?? 0}</span></div>
    </div>
  );
}

function Scoreboard({ view, me, myTeam, flagStates }) {
  if (view.singlePoint) return <SingleBoard view={view} myTeam={myTeam} />;
  switch (view.mode) {
    case 'escort': return view.escort && <div className="dh-part dh-board dh-escort" data-testid="duelist-board-escort">
      <strong>{myTeam === 'red' ? 'Escort the carrier' : 'Defend the gate'}</strong>
      <span>{view.escort.overtime ? 'OVERTIME' : clock(view.clockLeft)}</span>
      <progress aria-label="Delivery progress" value={view.escort.progress} max={100}/>
      <span>{Math.floor(view.escort.progress)}%</span>
      <small>{view.phase === 'over' ? view.winner === 'red' ? 'Delivered' : 'Defense held' :
        !view.escort.pointACaptured ? (view.escort.contested?'Point A contested':'Capture Point A '+Math.floor(view.escort.captureProgress||0)+'%') : (view.escort.contested ? 'Contested' : view.escort.moving ? 'Advancing' : 'Carrier stopped')+' · CP '+(view.escort.stage||0)+'/2'}</small>
    </div>;
    case 'ctf': return <CtfBoard view={view} myTeam={myTeam} flagStates={flagStates} />;
    case 'control': return <ControlBoard view={view} myTeam={myTeam} />;
    case 'tdm': return <TeamBoard view={view} myTeam={myTeam} />;
    case 'football': return <TeamBoard view={view} myTeam={myTeam} unit="goals" />;
    case 'duel': return <DuelBoard view={view} me={me} />;
    case 'ffa': return <FfaBoard view={view} me={me} />;
    default: return null; // practice: nothing to score
  }
}

function Banner({ banner, slot }) {
  if (!banner) return null;
  return (
    <div key={banner.id} className={`dh-part dh-banner dh-banner-${slot}`} data-tone={banner.tone} role="status"
      style={{ '--dh-life': `${Math.max(0.6, banner.until - banner.at)}s` }}>
      <span>{banner.text}</span>
    </div>
  );
}

// Same text-free sapphire PNG for every kill and milestone. The text remains live,
// readable and independent of the texture, and never intercepts gameplay input.
function KillAnnouncement({ banner }) {
  if (!banner) return null;
  return <div key={banner.id} className="dh-kill-announcement" role="status" aria-live="polite"
    style={{ '--dh-life': `${banner.until - banner.at}s` }}>
    <div className="dh-kill-announcement-copy">
      <strong>{banner.text}</strong>
      {banner.subtitle && <small>{banner.subtitle}</small>}
    </div>
  </div>;
}

/**
 * hud: the game view's 10 Hz state (client/DuelistGame.jsx): you, view, myTeam, classId, abilities, specialMeter,
 * specialKey, dead, lockOn, powers, plus kills, banners, flagStates, level and meId. portrait: a picture of the
 * player's fighter (a data URL) or null. story: a story mission is being played (its own objective and crew panels
 * are up: no scoreboard, no kill feed). help: the keys line, shown until the mouse is captured.
 */
export default function DuelistHud({ hud, fighter = 'maskedWarrior', portrait = null, story = false, help = '', onPower, onClass = null, pickerOpen = false }) {
  const rootRef = useRef(null);
  const [captured, setCaptured] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const game = root?.parentElement;
    if (!root || !game || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => {
      const { scale, layout } = hudScale(root.clientWidth, root.clientHeight);
      game.style.setProperty('--dh-s', String(scale)); // the game's other overlays keep clear of the HUD with it
      game.dataset.hud = layout;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(root);
    const onLock = () => setCaptured(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', onLock);
    return () => { observer.disconnect(); document.removeEventListener('pointerlockchange', onLock); game.style.removeProperty('--dh-s'); delete game.dataset.hud; };
  }, []);
  if (!hud?.you) return <div className="dh-root" ref={rootRef} />;
  const view = hud.view && !hud.view.mission ? hud.view : null;
  const level = hud.level || { level: 1, into: 0, need: 100, progress: 0 };
  return (
    <div className="dh-root" ref={rootRef} data-testid="duelist-hud" data-mode={view?.mode || (story ? 'story' : 'none')}>
      <Vitals you={hud.you} fighter={fighter} classId={hud.classId} portrait={portrait} level={level} onClass={onClass}
        items={view ? view.me?.items || [] : null} />
      {/* F11 changes viewport dimensions, not the match's HUD. Never restore the pre-match
          character/skill rail after class confirmation; retain HP and all combat controls. */}
      {!pickerOpen && <>
        <Special hud={hud} onPower={onPower} />
        <Skills hud={hud} onPower={onPower} />
      </>}
      {view && !story && <Kills rows={hud.kills} count={view.me?.defeats ?? view.people?.find((p) => p.id === hud.meId)?.defeats} />}
      {view && !story && (
        <section className="dh-anchor dh-tc" aria-label={`${view.name || 'Match'} score`}>
          <Scoreboard view={view} me={hud.meId} myTeam={hud.myTeam} flagStates={hud.flagStates} />
          <Banner banner={hud.banners?.objective} slot="objective" />
          <Banner banner={hud.banners?.event} slot="event" />
          {!pickerOpen && <KillAnnouncement banner={hud.banners?.kill} />}
        </section>
      )}
      {help && !captured && <div className="dh-help">{help}</div>}
    </div>
  );
}
