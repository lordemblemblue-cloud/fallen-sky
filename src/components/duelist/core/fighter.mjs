// A duelist's action state: what it is doing, when each part lands, what it may do next.
// Pure and deterministic: the caller passes the time. The same code runs in the browser (prediction,
// practice) and on the match server (authority).
//
// Fair play is built in: one action at a time; a press during an action either continues a chain or cancels
// in its window, or waits (one buffered press, for INPUT.bufferSeconds); cooldowns per move; costs paid up
// front; stagger and grips lock out everything but Resist.
import { BINDINGS, POWER_BINDINGS, moveById } from './moves.mjs';
import { INPUT, BREACH } from './tuning.mjs';
import { createVitals, spendStamina, spendWill, drainWill, regenerate, veilState } from './vitals.mjs';
import { KNOCKDOWN } from './tuning.mjs';

export function createFighter({ id, team = null, weapon = 'sword', vitals = null } = {}) {
  return {
    id,
    team,
    weapon,
    vitals: createVitals(vitals || {}),
    action: null, // { id, move, t, nextHit, held, chainedFrom }
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
  };
}

const busy = (f) => !!f.action;
export const isStunned = (f, now) => now < f.stunnedUntil;
export const isDown = (f, now) => now < f.riseUntil;

// Which move a command starts right now (a chain continues the current move's chain).
function moveForCommand(f, command) {
  if (command === 'light' || command === 'heavy') {
    const first = BINDINGS[f.weapon]?.[command] || null;
    const a = f.action;
    if (command === 'light' && a?.move.chain && a.t >= a.move.chain.from && a.t <= a.move.chain.to) return a.move.chain.next;
    return first;
  }
  // '#move': a move by its id, for the rules' own callers (guards' AI); never accepted from a client
  if (command[0] === '#') return moveById(command.slice(1)) ? command.slice(1) : null;
  return POWER_BINDINGS[command] || null;
}

// Why a move cannot start now (null = it can).
export function blockedReason(f, id, now) {
  const move = moveById(id);
  if (!move) return 'unknown';
  if (f.vitals.dead) return 'dead';
  if (move.weapon && move.weapon !== f.weapon) return 'weapon';
  if (isDown(f, now)) return 'down';
  const restrained = isStunned(f, now) || f.heldBy;
  if (restrained && id !== 'resist') return f.heldBy ? 'held' : 'stunned';
  if (now < (f.cooldowns[id] ?? -Infinity)) return 'cooldown';
  if (move.stamina > 0 && (f.vitals.winded || f.vitals.stamina < move.stamina)) return 'stamina';
  if (move.will > 0 && (f.vitals.collapsed || f.vitals.will < move.will)) return 'will';
  return null;
}

function startMove(f, id, now, chainedFrom = null) {
  const move = moveById(id);
  if (move.kind === 'attack' || move.kind === 'power') f.protectedUntil = -Infinity; // acting ends spawn protection
  spendStamina(f.vitals, move.stamina, now);
  spendWill(f.vitals, move.will, now);
  if (move.cooldown > 0) f.cooldowns[id] = now + move.cooldown;
  f.guard = null;
  f.action = { id, move, t: 0, nextHit: 0, held: move.channel, chainedFrom };
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
  const move = moveById(id);
  if (!move) return false; // a buffered guard waits for the action to end
  if (a.move.chain?.next === id && a.t >= a.move.chain.from && a.t <= a.move.chain.to) return true;
  return a.t >= a.move.cancelFrom && a.move.cancelInto.includes(move.kind);
}

/**
 * A player's (or bot's) press. command: light | heavy | push | pull | grip | breach | resist | roll | dash |
 * blockDown | blockUp | release (lets go of a held grip, throwing the target).
 * Returns { accepted, id?, reason? }; reason 'buffered' means it will start when the current action allows.
 */
export function press(f, command, now, { fromBuffer = false } = {}) {
  if (command === 'blockUp') { f.guard = null; return { accepted: true }; }
  if (command === 'blockDown') {
    if (f.vitals.dead || isStunned(f, now) || f.heldBy) return { accepted: false, reason: 'restrained' };
    if (busy(f)) return bufferPress(f, command, now, fromBuffer);
    if (!f.guard) f.guard = { since: now };
    return { accepted: true };
  }
  if (command === 'release') {
    const a = f.action;
    if (a?.move.channel && a.held) { a.held = false; return { accepted: true }; }
    return { accepted: false, reason: 'nothing-held' };
  }
  const id = moveForCommand(f, command);
  if (!id) return { accepted: false, reason: 'unknown' };
  const reason = blockedReason(f, id, now);
  // resist is the one move that breaks into anything, including an action of one's own
  if (!reason && id === 'resist') { f.action = null; return startMove(f, id, now); }
  if (reason) return { accepted: false, reason };
  if (busy(f) && !canInterrupt(f, id)) return bufferPress(f, command, now, fromBuffer);
  const chainedFrom = f.action?.move.chain?.next === id ? f.action.id : null;
  if (f.action) f.events.push({ type: 'interrupt', id: f.action.id, by: id, at: now });
  f.action = null;
  return startMove(f, id, now, chainedFrom);
}

function bufferPress(f, command, now, fromBuffer) {
  if (fromBuffer) return { accepted: false, reason: 'busy' }; // a buffered press never re-buffers itself
  f.buffer = { command, at: now };
  return { accepted: false, reason: 'buffered' };
}

/** Interrupt whatever the fighter is doing (a landed stagger, a parry, a guard break). */
export function stagger(f, seconds, now) {
  if (seconds <= 0) return;
  if (f.action) f.events.push({ type: 'interrupt', id: f.action.id, by: 'stagger', at: now });
  f.action = null;
  f.guard = null;
  f.buffer = null;
  f.stunnedUntil = Math.max(f.stunnedUntil, now + seconds);
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
  f.downUntil = now + KNOCKDOWN.lie;
  f.riseUntil = f.downUntil + KNOCKDOWN.rise;
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
 */
export function update(f, dt, now) {
  regenerate(f.vitals, dt, now);
  for (const [attacker, until] of Object.entries(f.breaches)) if (until <= now) delete f.breaches[attacker];
  const a = f.action;
  if (a) {
    const move = a.move;
    const before = a.t;
    a.t += dt;
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
    else if (!f.action || canInterrupt(f, moveForCommand(f, f.buffer.command) || '')) {
      const { command } = f.buffer;
      f.buffer = null;
      press(f, command, now, { fromBuffer: true });
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
