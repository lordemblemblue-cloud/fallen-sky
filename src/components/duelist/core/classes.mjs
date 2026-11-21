// Duelist Adventure's four classes: Warrior, Duelist, Assassin and Healer (docs/duelist/CLASSES_PLAN_20261120.md).
// Headless and shared: local practice and the authoritative match server read the same table. Each class has a
// crystal form (weapon) and colour, a passive, four abilities (moves in core/moves.mjs, on keys 1-4; the HUD
// shows three at a time and rotates to the fourth) and a special paid for by the server-owned meter.
// A client never changes its class mid-fight, never charges the meter and never decides what a special does.
import { tierValue } from './progression.mjs';

export const SPECIAL_MAX = 100;
export const ABILITY_SLOTS = 3;
export const CLASS_IDS = Object.freeze(['warrior', 'duelist', 'assassin', 'healer']);
export const DEFAULT_CLASS = 'duelist';
export const SPECIAL_CHARGE = Object.freeze({
  landedHit: 5,
  elimination: 12,
  assist: 7,
  allyHeal: 6,
  objective: 10,
});
// Tunable playtest proposals; not a statement of finalized balance.
export const SPECIAL_BALANCE = Object.freeze({
  duelistExecuteThreshold: 0.25, // target at or below 25% body HP
  assassinRearArcDegrees: 120,
  assassinExecuteRange: 2.3, // metres
  duelistExecuteRange: 2.1,
  rageDurationSeconds: 5,
  rageDamageMultiplier: 2,
  rageMoveMultiplier: 1.3,
  rageAttackSpeedMultiplier: 1.3,
  sanctuaryDurationSeconds: 5,
  sanctuaryRadius: 6,
  sanctuaryPowerResistance: 0.8, // allies inside take 80% less from powers
  sanctuaryStrikeResistance: 0.35, // and 35% less from strikes
  sanctuaryHealPerSecond: 5,
});

// What a class's passive changes (core/abilities.mjs applies them). A list of five is the value at each ability
// rank (core/progression.mjs: a rank every fifth level), so a passive grows with its class; `text` is the short form
// (core/ranks.mjs kitAt() writes it out with the numbers of a level).
const five = (...values) => Object.freeze(values);
const PASSIVES = Object.freeze({
  // the Warrior hits harder and stands firmer the further it has come
  warrior: Object.freeze({ id: 'heavyStance', name: 'Heavy Stance', strikeDamage: five(1.15, 1.17, 1.19, 1.21, 1.24),
    knockbackTaken: five(0.85, 0.8, 0.75, 0.7, 0.65), attackRate: 0.92,
    text: 'Strikes hit harder and knockback moves you less; swings are a little slower.' }),
  // the Duelist is rewarded for keeping a chain going: each link hits harder than the one before
  duelist: Object.freeze({ id: 'twinRhythm', name: 'Twin Rhythm', chainDamage: five(0.03, 0.04, 0.05, 0.06, 0.07),
    text: 'A four-hit chain whose every link hits harder than the last; every strike drains the Veil faster.' }),
  // the Assassin gets in and out: longer rolls, and more from a strike in the back
  assassin: Object.freeze({ id: 'shadowStep', name: 'Shadow Step', rollDistance: five(1.25, 1.28, 1.31, 1.34, 1.38),
    backstab: five(1.1, 1.14, 1.18, 1.22, 1.26), text: 'Longer rolls; strikes from behind hit harder.' }),
  // the Healer stays in the fight: left alone for a moment, it mends itself
  healer: Object.freeze({ id: 'swiftStance', name: 'Swift Stance', strikeDamage: 0.9, attackRate: 1.15, regen: five(1, 1.25, 1.5, 1.75, 2),
    regenAfter: 4, text: 'Faster, lighter swings; unhurt for a moment, you mend yourself; healing an ally charges your special.' }),
});

const ability = (id, name, text) => Object.freeze({ id, name, text, animation: 'class.power.' + id, implemented: true });
const entry = ({ id, name, role, weapon, color, stance, abilities, special, description }) =>
  Object.freeze({
    id, name, role, weapon, color, stance,
    passive: PASSIVES[id],
    special: Object.freeze({ ...special, animation: 'class.' + id + '.special.' + special.id }),
    abilities: Object.freeze(abilities.map(([key, label, text]) => ability(key, label, text))),
    animationSlots: Object.freeze({
      idle: 'class.' + id + '.idle',
      light: 'class.' + id + '.attack.light',
      heavy: 'class.' + id + '.attack.heavy',
      dodge: 'class.' + id + '.dodge',
      special: 'class.' + id + '.special',
      death: 'class.' + id + '.death',
      spawn: 'class.' + id + '.spawn',
    }),
    description,
  });

export const CLASSES = Object.freeze({
  warrior: entry({
    id: 'warrior', name: 'Warrior', role: 'Front line', weapon: 'sword', color: 0xff4a3d, stance: 'heavy',
    description: 'One red crystal blade, heavy strikes, and Rage.',
    abilities: [
      ['leapStrike', 'Leap Strike', 'Jump up to 8 m ahead and slam down, staggering everyone around the landing.'],
      ['grip', 'Telekinetic Grip', 'Lift an enemy, crush it while you hold, throw it when you let go.'],
      ['repulse', 'Repulse', 'Throw everyone around you back and off their feet.'],
      ['bladeThrow', 'Blade Throw', 'Your blade flies out and back, cutting whoever it meets.'],
    ],
    special: { id: 'rage', name: 'Rage', cost: SPECIAL_MAX, target: 'self',
      text: 'For 5 s: double damage, 30% faster, and nothing staggers, grips or knocks you down.' },
  }),
  duelist: entry({
    id: 'duelist', name: 'Duelist', role: 'Duel specialist', weapon: 'dualBlades', color: 0xffcf6a, stance: 'twin',
    description: 'Twin crystal blades, fast chains, and finishing executions.',
    abilities: [
      ['pull', 'Telekinetic Pull', 'Drag an enemy into reach.'],
      ['quickstep', 'Quickstep', 'For 3 s: 40% faster on your feet and 20% faster strikes.'],
      ['bladeThrow', 'Blade Throw', 'One blade flies out and back, cutting whoever it meets.'],
      ['counter', 'Guard and Counter', 'A short parry stance: a strike that meets it is answered with a free riposte.'],
    ],
    special: { id: 'execution', name: 'Execution', cost: SPECIAL_MAX / 3, target: 'enemy', reach: SPECIAL_BALANCE.duelistExecuteRange,
      rule: 'threshold', text: 'Finish an enemy at 25% HP or less within reach. Costs a third of the meter.' },
  }),
  assassin: entry({
    id: 'assassin', name: 'Assassin', role: 'Flanker', weapon: 'staff', color: 0xb779ff, stance: 'staff',
    description: 'A double-bladed staff, unseen approaches, and executions from behind.',
    abilities: [
      ['cloak', 'Veil Cloak', 'Unseen for 4 s (a shimmer up close). Striking or being hit ends it.'],
      ['push', 'Telekinetic Push', 'Throw everyone in front of you back.'],
      ['empower', 'Empowered Strikes', 'Your next 3 strikes hit 40% harder and drain the target\'s Will.'],
      ['misdirect', 'Misdirect', 'One enemy loses its lock on you and cannot target you for 3 s.'],
    ],
    special: { id: 'shadowExecution', name: 'Shadow Execution', cost: SPECIAL_MAX, target: 'enemy', reach: SPECIAL_BALANCE.assassinExecuteRange,
      rule: 'behind', text: 'Finish any enemy from behind, whatever its health.' },
  }),
  healer: entry({
    id: 'healer', name: 'Healer', role: 'Support', weapon: 'sword', color: 0x6cc8ff, stance: 'swift',
    description: 'One blue crystal blade, healing, and a dome that shelters allies.',
    abilities: [
      ['mend', 'Mend', 'Heal the ally in front of you (or yourself) 30 HP over 3 s.'],
      ['quickstepAura', 'Quickstep', 'You and allies within 6 m: 40% faster on your feet and 20% faster strikes for 3 s.'],
      ['levitate', 'Levitate', 'Rise and float for 2 s.'],
      ['push', 'Telekinetic Push', 'Throw everyone in front of you back.'],
    ],
    special: { id: 'sanctuary', name: 'Sanctuary', cost: SPECIAL_MAX, target: 'allies',
      text: 'A 6 m dome for 5 s: allies inside take 80% less from powers and 35% less from strikes, and heal.' },
  }),
});

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const validMeter = (meter) => Number.isFinite(meter) && meter >= 0 && meter <= SPECIAL_MAX;
export const classById = (id) => (typeof id === 'string' && Object.hasOwn(CLASSES, id) ? CLASSES[id] : null);

/** The move a class's ability slot (0-3) starts, or null. */
export function classAbilityMove(classId, slot) {
  const def = classById(classId);
  return def && Number.isInteger(slot) && slot >= 0 && slot < def.abilities.length ? def.abilities[slot].id : null;
}

/** Three visible abilities rotating one at a time, so all four are reachable on a small HUD. */
export function visibleClassAbilities(classId, first = 0) {
  const def = classById(classId);
  if (!def) return [];
  const offset = Number.isInteger(first) ? ((first % def.abilities.length) + def.abilities.length) % def.abilities.length : 0;
  return Object.freeze(Array.from({ length: ABILITY_SLOTS }, (_, i) => def.abilities[(offset + i) % def.abilities.length]));
}

/**
 * Requests are allowed pre-match, between rounds or while defeated, with the change QUEUED for the next spawn
 * (never mid-life). The server takes phase and death from the match, not from a client packet.
 */
export function requestClassSelection({ currentClass = DEFAULT_CLASS, pendingClass = null, requestedClass, phase = 'live', dead = false } = {}) {
  if (!classById(requestedClass)) return { accepted: false, reason: 'unknown-class', currentClass, pendingClass };
  if (phase !== 'countdown' && phase !== 'roundOver' && phase !== 'over' && !dead) {
    return { accepted: false, reason: 'alive-in-match', currentClass, pendingClass };
  }
  return { accepted: true, currentClass, pendingClass: requestedClass };
}

/** Only authoritative spawn handlers apply the player's pending selection. */
export function classAtSpawn({ currentClass = DEFAULT_CLASS, pendingClass = null } = {}) {
  const chosen = classById(pendingClass) ? pendingClass : classById(currentClass) ? currentClass : DEFAULT_CLASS;
  return { classId: chosen, weapon: CLASSES[chosen].weapon, pendingClass: null };
}

/** Award on server-confirmed events only, NEVER on client damage claims. */
export function awardSpecialCharge(meter, event) {
  if (!validMeter(meter) || typeof event !== 'string' || !Object.hasOwn(SPECIAL_CHARGE, event)) return null;
  return clamp(meter + SPECIAL_CHARGE[event], 0, SPECIAL_MAX);
}

const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Is `attacker` within the rear arc of a target facing `target.yaw`? */
export function behindTarget(attacker, target, arcDegrees = SPECIAL_BALANCE.assassinRearArcDegrees) {
  const dx = attacker.x - target.x;
  const dz = attacker.z - target.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6 || !Number.isFinite(target.yaw)) return false;
  const dot = (dx * Math.sin(target.yaw) + dz * Math.cos(target.yaw)) / len;
  return dot <= -Math.cos(arcDegrees / 2 * Math.PI / 180) + 1e-9;
}

/**
 * Validates a special's request and meter cost without applying it (sim/world.mjs applies it).
 * actor: { id, team, hp, position: { x, z } }; target (executions): { id, team, hp, maxHp, position: { x, z, yaw },
 * protectedUntil, invulnerable }. level: the class's level (the special's tier: core/progression.mjs).
 */
export function evaluateSpecial({ classId, meter, actor, target = null, now = 0, level = 1 } = {}) {
  const def = classById(classId);
  if (!def) return { allowed: false, reason: 'unknown-class' };
  if (!validMeter(meter)) return { allowed: false, reason: 'invalid-meter' };
  if (!actor || !Number.isFinite(actor.hp) || actor.hp <= 0) return { allowed: false, reason: 'actor-defeated' };
  if (!finitePoint(actor.position) || !Number.isFinite(now)) return { allowed: false, reason: 'invalid-context' };
  if (meter + 1e-8 < def.special.cost) return { allowed: false, reason: 'not-charged' };
  if (def.special.target === 'enemy') {
    if (!target?.position || !Number.isFinite(target.hp) || !Number.isFinite(target.maxHp) || target.maxHp <= 0) return { allowed: false, reason: 'target-required' };
    if (!finitePoint(target.position)) return { allowed: false, reason: 'invalid-context' };
    if (target.hp <= 0) return { allowed: false, reason: 'target-defeated' };
    if (actor.id && target.id && actor.id === target.id) return { allowed: false, reason: 'self-target' };
    if (actor.team != null && target.team === actor.team) return { allowed: false, reason: 'friendly-target' };
    if ((target.protectedUntil ?? -Infinity) > now || target.invulnerable) return { allowed: false, reason: 'target-protected' };
    const id = def.special.id;
    if (distance(actor.position, target.position) > tierValue(id, 'reach', level, def.special.reach)) return { allowed: false, reason: 'out-of-range' };
    if (def.special.rule === 'threshold' && target.hp / target.maxHp > tierValue(id, 'threshold', level, SPECIAL_BALANCE.duelistExecuteThreshold)) return { allowed: false, reason: 'target-too-healthy' };
    if (def.special.rule === 'behind' && !behindTarget(actor.position, target.position, tierValue(id, 'rearArc', level, SPECIAL_BALANCE.assassinRearArcDegrees))) return { allowed: false, reason: 'not-behind' };
  }
  return { allowed: true, effect: def.special.id, cost: def.special.cost, meterAfter: clamp(meter - def.special.cost, 0, SPECIAL_MAX), animation: def.special.animation };
}
