// A duelist's action state: what it is doing, when each part lands, what it may do next.
// Pure and deterministic: the caller passes the time. The same code runs in the browser (prediction,
// practice) and on the match server (authority).
//
// Fair play is built in: one action at a time; a press during an action either continues a chain or cancels
// in its window, or waits (one buffered press, for INPUT.bufferSeconds); cooldowns per move; costs paid up
// front; stagger and grips lock out everything but Resist.
import { BINDINGS, POWER_BINDINGS, FLOW, moveById } from './moves.mjs';
import { INPUT, BREACH } from './tuning.mjs';
import { createVitals, spendStamina, spendWill, drainWill, regenerate, veilState } from './vitals.mjs';
import { KNOCKDOWN } from './tuning.mjs';
import { classAbilityMove, classById } from './classes.mjs';
import { expireEffects } from './abilities.mjs';
import { moveFor } from './ranks.mjs';
import { cleanBoost } from './progression.mjs';
import { equipItems } from './shop.mjs';

// Without a class, ability keys 1-4 are the Telekinesis of the first build (story crews, old matches).
const LEGACY_SLOTS = Object.freeze(['push', 'pull', 'grip', 'breach']);
// with a class, Telekinesis comes from the kit; Veil Breach, roll, dash and resist are everyone's
const LEGACY_POWERS = new Set(['push', 'pull', 'grip']);
// abilities only a class's kit gives (core/classes.mjs)
export const CLASS_ABILITIES = new Set(['leapStrike', 'repulse', 'bladeThrow', 'quickstep', 'quickstepAura', 'counter', 'cloak',
  'empower', 'misdirect', 'mend', 'levitate']);
const kitHas = (f, id) => !!classById(f.classId)?.abilities.some((a) => a.id === id);

/**
 * classId: one of core/classes.mjs CLASS_IDS, or null (no class: the six powers of the first build).
 * effects: lasting effects (core/abilities.mjs); meter: the special meter as the match last gave it (the match's
 * seat owns it; sim/world.mjs reads it to allow a special and reports what one spent).
 */
// level: the class's level (core/progression.mjs), which sets its abilities' rank and its special's tier
export function createFighter({ id, team = null, weapon = 'sword', vitals = null, classId = null, level = 1, matchBoost = 0, items = [] } = {}) {
  const fighter = {
    id,
    team,
    weapon,
    classId: classById(classId) ? classId : null,
    level: Math.max(1, Math.floor(level) || 1),
    matchBoost: cleanBoost(matchBoost),
    effects: {},
    meter: 0,
    vitals: createVitals(vitals || {}),
    action: null, // { id, move, t, nextHit, held, chainedFrom, link }
    cooldowns: {}, // move id -> seconds when it may start again
    buffer: null, // { command, at }
    guard: null, // { since }
    stunnedUntil: -Infinity, // stagger, guard break, parried
    protectedUntil: -Infinity, // just respawned: nothing reaches it until then, or until it acts
    downUntil: -Infinity, // knocked down: lying until then, then rising until riseUntil
    riseUntil: -Infinity,
    heldBy: null, // the fighter holding this one with Telekinesis
    breaches: {}, // attacker id -> until: whose hits reach this fighter through its Veil
    events: [],
    healReduction: 0, healReducedUntil: -Infinity,
    shopSpeedUntil: -Infinity, shopProcAt: -Infinity, shopHealProcAt: -Infinity,
  };
  equipItems(fighter, items);
  return fighter;
}

const busy = (f) => !!f.action;
export const isStunned = (f, now) => now < f.stunnedUntil;
export const isDown = (f, now) => now < f.riseUntil;

// Is the current strike's chain window open, and with links left in the chain?
function chaining(f) {
  const a = f.action;
  const c = a?.move.chain;
  if (!c || a.t < c.from || a.t > c.to) return false;
  const flow = FLOW[f.weapon];
  return !flow || !flow.strikes.has(a.id) || (a.link || 1) < flow.chain.length;
}

// Which light strike a press starts (moves.mjs FLOW): the one for the direction held, else the next link of the
// chain; never the strike being chained out of.
function lightStrike(f, direction) {
  const a = f.action;
  const open = chaining(f);
  const flow = FLOW[f.weapon];
  if (!flow) return open ? a.move.chain.next : BINDINGS[f.weapon]?.light || null;
  const from = open ? a.id : null;
  const link = open ? (a.link || 1) : 0; // strikes made so far in this chain
  const turned = direction ? flow[direction] : null;
  if (turned && turned !== from) return turned;
  const next = flow.chain[link % flow.chain.length];
  return next !== from ? next : flow.chain[(link + 1) % flow.chain.length];
}

// Does the current strike chain into `id` right now?
function chainsInto(f, id) {
  if (!chaining(f)) return false;
  const a = f.action;
  const flow = FLOW[f.weapon];
  if (!flow || !flow.strikes.has(a.id)) return a.move.chain.next === id;
  return id !== a.id && flow.strikes.has(id);
}

// Which move a command starts right now (direction: the way the stick is held, for a light strike).
function moveForCommand(f, command, direction = null) {
  if (command === 'light') return lightStrike(f, direction);
  if (command === 'heavy') return BINDINGS[f.weapon]?.heavy || null;
  // '#move': a move by its id, for the rules' own callers (guards' AI, specials); never accepted from a client
  if (command[0] === '#') return moveById(command.slice(1)) ? command.slice(1) : null;
  const slot = /^ability([1-4])$/.exec(command);
  if (slot) return f.classId ? classAbilityMove(f.classId, Number(slot[1]) - 1) : LEGACY_SLOTS[Number(slot[1]) - 1];
  const id = POWER_BINDINGS[command] || null;
  // a class fights with its own kit: Telekinesis only where its kit has it (roll, dash and resist are everyone's)
  if (id && f.classId && LEGACY_POWERS.has(id) && !kitHas(f, id)) return null;
  return id;
}

// Why a move cannot start now (null = it can).
export function blockedReason(f, id, now) {
  const move = moveFor(f, id);
  if (!move) return 'unknown';
  if (f.vitals.dead) return 'dead';
  if (move.weapon && move.weapon !== f.weapon) return 'weapon';
  // a class fights with its own kit and its own special, however the move was asked for
  if (CLASS_ABILITIES.has(id) && !kitHas(f, id)) return 'class';
  if (f.classId && LEGACY_POWERS.has(id) && !kitHas(f, id)) return 'class';
  if (move.special && classById(f.classId)?.special.id !== id) return 'class';
  if (isDown(f, now)) return 'down';
  const restrained = isStunned(f, now) || f.heldBy;
  if (restrained && id !== 'resist') return f.heldBy ? 'held' : 'stunned';
  if (now < (f.cooldowns[id] ?? -Infinity)) return 'cooldown';
  if (move.stamina > 0 && (f.vitals.winded || f.vitals.stamina < move.stamina)) return 'stamina';
  if (move.will > 0 && (f.vitals.collapsed || f.vitals.will < move.will)) return 'will';
  return null;
}

function startMove(f, id, now, chainedFrom = null, link = 1) {
  const move = moveFor(f, id); // an ability at its rank, the special at its tier
  if (move.kind === 'attack' || move.kind === 'power') f.protectedUntil = -Infinity; // acting ends spawn protection
  spendStamina(f.vitals, move.stamina, now);
  spendWill(f.vitals, move.will, now);
  if (move.cooldown > 0) f.cooldowns[id] = now + move.cooldown;
  f.guard = null;
  f.action = { id, move, t: 0, nextHit: 0, held: move.channel, chainedFrom, link };
  f.events.push({ type: 'start', id, at: now, chainedFrom });
  if (id === 'resist') { // throws off a grip and every breach at once
    if (f.heldBy) f.events.push({ type: 'freed', at: now, from: f.heldBy });
    f.heldBy = null;
    f.breaches = {};
    f.stunnedUntil = Math.min(f.stunnedUntil, now);
  }
  return { accepted: true, id };
}

// Can the current action be left for `move` right now: a chain, or a cancel window that allows its kind.
function canInterrupt(f, id) {
  const a = f.action;
  if (!a) return true;
  // Only the server-authorized aerial follow-up interrupts an ongoing jump.
  // The client can send only 'dash' presses; the world verifies the double-tap.
  if (id === 'airDash' && a.id === 'jump') return true;
  const move = moveById(id);
  if (!move) return false; // a buffered guard waits for the action to end
  if (chainsInto(f, id)) return true;
  return a.t >= a.move.cancelFrom && a.move.cancelInto.includes(move.kind);
}

/**
 * A player's (or bot's) press. command: light | heavy | push | pull | grip | breach | resist | roll | dash |
 * blockDown | blockUp | release (lets go of a held grip, throwing the target).
 * Returns { accepted, id?, reason? }; reason 'buffered' means it will start when the current action allows.
 */
// direction: forward | side | back | null, the way the stick is held relative to the facing (a light strike takes it)
export function press(f, command, now, { fromBuffer = false, direction = null } = {}) {
  if (command === 'blockUp') { f.guard = null; return { accepted: true }; }
  if (command === 'blockDown') {
    if (f.vitals.dead || isStunned(f, now) || f.heldBy) return { accepted: false, reason: 'restrained' };
    if (busy(f)) return bufferPress(f, command, now, fromBuffer, null);
    if (!f.guard) f.guard = { since: now };
    return { accepted: true };
  }
  if (command === 'release') {
    const a = f.action;
    if (a?.move.channel && a.held) { a.held = false; return { accepted: true }; }
    return { accepted: false, reason: 'nothing-held' };
  }
  const id = moveForCommand(f, command, direction);
  if (!id) return { accepted: false, reason: 'unknown' };
  const reason = blockedReason(f, id, now);
  // resist is the one move that breaks into anything, including an action of one's own
  if (!reason && id === 'resist') { f.action = null; return startMove(f, id, now); }
  if (reason) return { accepted: false, reason };
  if (busy(f) && !canInterrupt(f, id)) return bufferPress(f, command, now, fromBuffer, direction);
  const chainedFrom = chainsInto(f, id) ? f.action.id : null;
  const link = chainedFrom ? (f.action.link || 1) + 1 : 1;
  if (f.action) f.events.push({ type: 'interrupt', id: f.action.id, by: id, at: now });
  f.action = null;
  return startMove(f, id, now, chainedFrom, link);
}

function bufferPress(f, command, now, fromBuffer, direction) {
  if (fromBuffer) return { accepted: false, reason: 'busy' }; // a buffered press never re-buffers itself
  f.buffer = { command, at: now, direction: direction || null };
  return { accepted: false, reason: 'buffered' };
}

/** Interrupt whatever the fighter is doing (a landed stagger, a parry, a guard break). */
export function stagger(f, seconds, now) {
  if (seconds <= 0) return;
  if (f.action) f.events.push({ type: 'interrupt', id: f.action.id, by: 'stagger', at: now });
  f.action = null;
  f.guard = null;
  f.buffer = null;
  f.stunnedUntil = Math.max(f.stunnedUntil, now + seconds * (1 - (f.shopStats?.tenacity || 0)));
}

// i-frames of a roll, or knocked down and not yet standing (now omitted: only the move's i-frames count)
export const isInvulnerable = (f, now) => {
  if (now !== undefined && (isDown(f, now) || now < f.protectedUntil)) return true;
  const a = f.action;
  return !!(a?.move.iframes && a.t >= a.move.iframes[0] && a.t <= a.move.iframes[1]);
};

/** Knocked off the feet by a hard push or throw: lies for KNOCKDOWN.lie, rises for KNOCKDOWN.rise. */
export function knockDown(f, now) {
  stagger(f, KNOCKDOWN.lie + KNOCKDOWN.rise, now);
  const resistance = 1 - (f.shopStats?.tenacity || 0);
  f.downUntil = now + KNOCKDOWN.lie * resistance;
  f.riseUntil = f.downUntil + KNOCKDOWN.rise * resistance;
  f.events.push({ type: 'knockdown', at: now });
}

export function grantBreach(defender, attackerId, now) {
  defender.breaches[attackerId] = now + BREACH.seconds;
}
export const isBreachedBy = (defender, attackerId, now) => (defender.breaches[attackerId] ?? -Infinity) > now;

/**
 * Advance by dt seconds (now = the time at the end of the step). Emits, into f.events:
 *   { type: 'hit', id, index }: a hit lands now (the world resolves it against whoever is in reach)
 *   { type: 'tick', id, dt }: a held channel (grip) works for dt seconds
 *   { type: 'end', id }, { type: 'dropped', id } (a channel lost its Will)
 * rate: how fast the action plays (core/abilities.mjs actionRate: stance, Quickstep, Rage).
 */
export function update(f, dt, now, rate = 1) {
  regenerate(f.vitals, dt, now);
  expireEffects(f, now);
  for (const [attacker, until] of Object.entries(f.breaches)) if (until <= now) delete f.breaches[attacker];
  const a = f.action;
  if (a) {
    const move = a.move;
    const before = a.t;
    a.t += dt * rate;
    if (move.channel) {
      const activeStart = move.startup;
      // the grip takes hold (the world picks the target in reach)
      if (a.nextHit === 0 && a.t >= activeStart) { f.events.push({ type: 'hit', id: a.id, index: 0, at: now }); a.nextHit = 1; }
      if (a.t > activeStart) {
        const working = Math.min(a.t, activeStart + move.active) - Math.max(before, activeStart);
        if (a.held && working > 0) {
          const cost = move.willPerSec * working;
          const paid = drainWill(f.vitals, cost, now);
          if (paid > 0) f.events.push({ type: 'tick', id: a.id, dt: working * (cost > 0 ? paid / cost : 1) });
          if (f.vitals.collapsed) { a.held = false; f.events.push({ type: 'dropped', id: a.id, at: now }); }
        }
        // let go or held to the end: the target is thrown, unless the grip died with the Will that held it
        if (!a.held || a.t >= activeStart + move.active) {
          f.action = null;
          f.events.push({ type: 'end', id: a.id, at: now });
          if (!f.vitals.collapsed) { startMove(f, 'gripThrow', now); update(f, 0, now); }
          return true;
        }
      }
    } else {
      while (a.nextHit < move.hitAt.length && a.t >= move.startup + move.hitAt[a.nextHit]) {
        f.events.push({ type: 'hit', id: a.id, index: a.nextHit, at: now });
        a.nextHit += 1;
      }
      if (a.t >= move.duration) {
        f.action = null;
        f.events.push({ type: 'end', id: a.id, at: now });
      }
    }
  }
  // a buffered press starts as soon as it may, or is dropped once it is too old
  if (f.buffer) {
    if (now - f.buffer.at > INPUT.bufferSeconds) f.buffer = null;
    else if (!f.action || canInterrupt(f, moveForCommand(f, f.buffer.command, f.buffer.direction) || '')) {
      const { command, direction } = f.buffer;
      f.buffer = null;
      press(f, command, now, { fromBuffer: true, direction });
    }
  }
  return true;
}

export function takeEvents(f) {
  const out = f.events;
  f.events = [];
  return out;
}

export const fighterVeil = (f) => veilState(f.vitals);
