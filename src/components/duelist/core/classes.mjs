// Duelist Adventure class contracts. This module is intentionally headless:
// Local practice AND the authoritative match server must eventually import
// these definitions for class selection and special activation.
//
// This does not yet apply damage, spawn fighters, or load clips. It defines
// class data and request validation with zero trust in a client-supplied result.
export const SPECIAL_MAX = 100;
export const ABILITY_SLOTS = 3;
export const CLASS_IDS = Object.freeze(['assassin', 'duelist', 'juggernaut', 'healer']);
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
  healerFieldDurationSeconds: 5,
  healerPowerResistance: 0.8,
  healerDefenseMultiplier: 1.35,
});
const power = (id, name) => Object.freeze({
  id, name, animation: 'class.power.' + id,
  // A move not implemented in the existing core must never be
  // silently remapped to some unrelated power.
  implemented: false,
});
const entry = ({ id, name, weapon, stance, special, abilities, description }) =>
  Object.freeze({
    id, name, weapon, stance,
    special: Object.freeze(special),
    abilities: Object.freeze(abilities.map(([key, label]) => power(key, label))),
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
  assassin: entry({
    id: 'assassin', name: 'Assassin', weapon: 'staff', stance: 'staff',
    description: 'Double-bladed staff; evasive flanker with a behind-the-target execution.',
    abilities: [
      ['stealth', 'Invisibility'],
      ['push', 'Telekinetic Push'],
      ['enhance', 'Enhanced Strikes'],
      ['mindTrick', 'Mind Trick'],
    ],
    special: { id: 'shadowExecution', name: 'Shadow Execution', cost: 100, animation: 'class.assassin.special.execute', target: 'enemy' },
  }),
  duelist: entry({
    id: 'duelist', name: 'Duelist', weapon: 'dualBlades', stance: 'dualBlades',
    description: 'Dual crystal blades; fast offense and threshold-based executions.',
    abilities: [
      ['pull', 'Telekinetic Pull'],
      ['speed', 'Speed'],
      ['bladeThrow', 'Blade Throw'],
      ['counter', 'Guard and Counter'],
    ],
    special: { id: 'duelistExecution', name: 'Execution', cost: SPECIAL_MAX / 3, animation: 'class.duelist.special.execute', target: 'enemy' },
  }),
  juggernaut: entry({
    id: 'juggernaut', name: 'Juggernaut', weapon: 'sword', stance: 'heavy',
    description: 'Single crystal blade; heavy strikes and short Rage bursts.',
    abilities: [
      ['leap', 'Force Leap'],
      ['grip', 'Telekinetic Grip'],
      ['repulse', 'Repulse'],
      ['bladeThrow', 'Blade Throw'],
    ],
    special: { id: 'rage', name: 'Rage', cost: 100, animation: 'class.juggernaut.special.rage', target: 'self' },
  }),
  healer: entry({
    id: 'healer', name: 'Healer', weapon: 'sword', stance: 'swift',
    description: 'Single crystal blade; fast supportive fighter with an ally-protection field.',
    abilities: [
      ['mindTrick', 'Mind Trick'],
      ['speed', 'Speed'],
      ['levitate', 'Levitate'],
      ['push', 'Telekinetic Push'],
    ],
    special: { id: 'wardField', name: 'Protection and Absorption Field', cost: 100, animation: 'class.healer.special.ward', target: 'allies' },
  }),
});
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const validMeter = meter => Number.isFinite(meter) && meter >= 0 && meter <= SPECIAL_MAX;
export const classById = id => (typeof id === 'string' && Object.hasOwn(CLASSES, id) ? CLASSES[id] : null);

/** Three visible powers rotating one at a time, so all four are accessible. */
export function visibleClassAbilities(classId, first = 0) {
  const def = classById(classId);
  if (!def) return [];
  const offset = Number.isInteger(first) ? ((first % def.abilities.length) + def.abilities.length) % def.abilities.length : 0;
  return Object.freeze(Array.from({ length: ABILITY_SLOTS }, (_, i) => def.abilities[(offset + i) % def.abilities.length]));
}

/** Requests are allowed pre-match, between rounds or while defeated, with
 * the class change QUEUED for the next spawn (never mid-life).
 * Server must obtain phase/dead from match state, not from a client packet. */
export function requestClassSelection({ currentClass = 'duelist', pendingClass = null, requestedClass, phase = 'live', dead = false } = {}) {
  if (!classById(requestedClass)) return { accepted: false, reason: 'unknown-class', currentClass, pendingClass };
  if (phase !== 'countdown' && phase !== 'roundOver' && phase !== 'over' && !dead) {
    return { accepted: false, reason: 'alive-in-match', currentClass, pendingClass };
  }
  return { accepted: true, currentClass, pendingClass: requestedClass };
}

/** Only authoritative spawn handlers apply the player's pending selection. */
export function classAtSpawn({ currentClass = 'duelist', pendingClass = null } = {}) {
  const chosen = classById(pendingClass) ? pendingClass : classById(currentClass) ? currentClass : 'duelist';
  return { classId: chosen, weapon: CLASSES[chosen].weapon, pendingClass: null };
}

/** Award on server-confirmed events only, NEVER on client damage claims. */
export function awardSpecialCharge(meter, event) {
  if (!validMeter(meter) || typeof event !== 'string' || !Object.hasOwn(SPECIAL_CHARGE, event)) return null;
  return clamp(meter + SPECIAL_CHARGE[event], 0, SPECIAL_MAX);
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function behindTarget(attacker, target) {
  const dx = attacker.x - target.x;
  const dz = attacker.z - target.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6 || !Number.isFinite(target.yaw)) return false;
  const dot = (dx * Math.sin(target.yaw) + dz * Math.cos(target.yaw)) / len;
  return dot <= -Math.cos(SPECIAL_BALANCE.assassinRearArcDegrees / 2 * Math.PI / 180);
}

/** Validates the special's request and meter cost without applying an effect.
 * Actual execution, Rage and barrier effects still need server-side handling. */
export function evaluateSpecial({ classId, meter, actor, target = null, now = 0 } = {}) {
  const def = classById(classId);
  if (!def) return { allowed: false, reason: 'unknown-class' };
  if (!validMeter(meter)) return { allowed: false, reason: 'invalid-meter' };
  if (!actor || !Number.isFinite(actor.hp) || actor.hp <= 0 || !actor.position) return { allowed: false, reason: 'actor-defeated' };
  if (meter + 1e-8 < def.special.cost) return { allowed: false, reason: 'not-charged' };
  if (def.special.target === 'enemy') {
    if (!target?.position || !Number.isFinite(target.hp) || !Number.isFinite(target.maxHp) || target.maxHp <= 0) return { allowed: false, reason: 'target-required' };
    if (target.hp <= 0) return { allowed: false, reason: 'target-defeated' };
    if (actor.id && target.id && actor.id === target.id) return { allowed: false, reason: 'self-target' };
    if (actor.team != null && target.team === actor.team) return { allowed: false, reason: 'friendly-target' };
    if ((target.protectedUntil ?? -Infinity) > now || target.invulnerable) return { allowed: false, reason: 'target-protected' };
    const reach = classId === 'assassin' ? SPECIAL_BALANCE.assassinExecuteRange : SPECIAL_BALANCE.duelistExecuteRange;
    if (distance(actor.position, target.position) > reach) return { allowed: false, reason: 'out-of-range' };
    if (classId === 'duelist' && target.hp / target.maxHp > SPECIAL_BALANCE.duelistExecuteThreshold) return { allowed: false, reason: 'target-too-healthy' };
    if (classId === 'assassin' && !behindTarget(actor.position, target.position)) return { allowed: false, reason: 'not-behind' };
  }
  return { allowed: true, effect: def.special.id, cost: def.special.cost, meterAfter: clamp(meter - def.special.cost, 0, SPECIAL_MAX), animation: def.special.animation };
}
