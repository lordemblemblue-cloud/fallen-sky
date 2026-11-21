// The lasting effects of the class abilities (Quickstep, Rage, Veil Cloak, Empowered Strikes, Misdirect, Mend,
// Levitate) and the class passives, as the rules core and the world apply them. Pure: callers pass the time.
//
// A fighter's effects live in f.effects: { [kind]: { until, ...data } }. Sanctuary is a place, not an effect on
// a fighter: sim/world.mjs keeps its domes in world.zones.
import { SPECIAL_BALANCE } from './classes.mjs';
import { passiveFor } from './ranks.mjs';

export const EFFECTS = Object.freeze({
  quick: Object.freeze({ move: 1.4, rate: 1.2 }),
  rage: Object.freeze({ damage: SPECIAL_BALANCE.rageDamageMultiplier, move: SPECIAL_BALANCE.rageMoveMultiplier, rate: SPECIAL_BALANCE.rageAttackSpeedMultiplier }),
  empower: Object.freeze({ damage: 1.4 }),
  levitate: Object.freeze({ height: 2.1, move: 0.6 }),
  cloak: Object.freeze({ seenWithin: 3 }), // metres: closer than this, a cloaked fighter shimmers into view
});
// effect kinds as bits, for snapshots (net/protocol.mjs)
export const EFFECT_BITS = Object.freeze({ quick: 1, rage: 2, cloak: 4, levitate: 8, mend: 16, empower: 32, misdirected: 64 });

export function addEffect(f, kind, until, data = {}) {
  if (!f.effects) f.effects = {};
  f.effects[kind] = { until, ...data };
}
export const effectOn = (f, kind, now) => {
  const e = f.effects?.[kind];
  return e && e.until > now ? e : null;
};
export function endEffect(f, kind) {
  if (f.effects) delete f.effects[kind];
}
export function expireEffects(f, now) {
  if (!f.effects) return;
  for (const [kind, e] of Object.entries(f.effects)) if (!(e.until > now)) delete f.effects[kind];
}

// the class's passive, with its numbers at the fighter's ability rank (core/ranks.mjs)
const passiveOf = (f) => passiveFor(f);

/** How fast a fighter's actions play (1 = as written): class stance, Quickstep, Rage. */
export function actionRate(f, now) {
  let rate = passiveOf(f)?.attackRate ?? 1;
  if (effectOn(f, 'quick', now)) rate *= EFFECTS.quick.rate;
  if (effectOn(f, 'rage', now)) rate *= EFFECTS.rage.rate;
  return rate;
}

/** How fast a fighter walks and runs: Quickstep and Rage speed it up; floating slows it. */
export function moveRate(f, now) {
  let rate = 1;
  if (effectOn(f, 'quick', now)) rate *= EFFECTS.quick.move;
  if (effectOn(f, 'rage', now)) rate *= EFFECTS.rage.move;
  if (effectOn(f, 'levitate', now)) rate *= EFFECTS.levitate.move;
  if (f.shopSpeedUntil > now) rate *= 1 + (f.shopStats?.passive?.onAllyHealHaste || 0);
  return rate;
}

/** How far a roll carries this fighter (the Assassin's Shadow Step rolls further). */
export const rollReach = (f) => passiveOf(f)?.rollDistance ?? 1;

/**
 * The damage a landed move does before the defender's protection: the attacker's stance, a strike from behind
 * (the Assassin), Rage, Empowered Strikes. sheltered: the defender stands in an allied Sanctuary.
 */
export function damageFor(attacker, move, base, { now, behind = false, sheltered = false } = {}) {
  let damage = base;
  const passive = passiveOf(attacker);
  const strike = move.kind === 'attack';
  if (strike && passive?.strikeDamage) damage *= passive.strikeDamage;
  if (strike && behind && passive?.backstab) damage *= passive.backstab;
  // Twin Rhythm: each link of a chain hits harder than the one before it
  if (strike && passive?.chainDamage && attacker.action?.link > 1) damage *= 1 + passive.chainDamage * (attacker.action.link - 1);
  if (effectOn(attacker, 'rage', now)) damage *= EFFECTS.rage.damage;
  if (strike && effectOn(attacker, 'empower', now)) damage *= EFFECTS.empower.damage;
  if (attacker.shopStats?.power) damage *= 1 + attacker.shopStats.power;
  if (sheltered) {
    damage *= move.damageKind === 'telekinesis' || move.damageKind === 'breach'
      ? 1 - SPECIAL_BALANCE.sanctuaryPowerResistance
      : 1 - SPECIAL_BALANCE.sanctuaryStrikeResistance;
  }
  return damage;
}

/** HP a second a fighter mends on its own right now (the Healer's Swift Stance, once it has gone unhurt a while). */
export function selfMend(f, now) {
  const passive = passiveOf(f);
  const since = now - Math.max(f.vitals.lastShieldHit ?? -Infinity, f.vitals.lastHurt ?? -Infinity);
  const classRegen = passive?.regen && since >= passive.regenAfter ? passive.regen : 0;
  const itemRegen = since >= 5 ? (f.shopStats?.passive?.regen || 0) : 0;
  return classRegen + itemRegen;
}

/** Rage: nothing staggers, grips or knocks this fighter down. */
export const controlImmune = (f, now) => !!effectOn(f, 'rage', now);

/** How much of a knockback moves this fighter (the Warrior's Heavy Stance stands firmer). */
export const knockbackTaken = (f) => (passiveOf(f)?.knockbackTaken ?? 1) * (1 - (f.shopStats?.passive?.knockbackResist || 0));

/** A landed strike spends one Empowered damage-boost charge, never the target's Force/Will. */
export function spendEmpower(attacker, now) {
  const e = effectOn(attacker, 'empower', now);
  if (!e) return false;
  e.charges = (e.charges ?? 1) - 1;
  if (e.charges <= 0) endEffect(attacker, 'empower');
  return true;
}

/** Is `f` hidden from `viewer` (a Veil Cloak, farther than its shimmer)? Teammates always see each other. */
export function hiddenFrom(f, fBody, viewer, viewerBody, now) {
  if (!effectOn(f, 'cloak', now) || !viewer || viewer === f) return false;
  if (f.team !== null && f.team === viewer.team) return false;
  const revealRadius = Math.max(EFFECTS.cloak.seenWithin, viewer.shopStats?.passive?.trueSight || 0);
  return Math.hypot(fBody.x - viewerBody.x, fBody.z - viewerBody.z) > revealRadius;
}

/** May `viewer` lock on to (or a bot target) `f`? Not while hidden from it, nor while `f` misdirected it. */
export function targetable(f, fBody, viewer, viewerBody, now) {
  if (hiddenFrom(f, fBody, viewer, viewerBody, now)) return false;
  const m = effectOn(viewer, 'misdirected', now);
  return !(m && m.by === f.id);
}

/** The effects as snapshot bits, and back (the browser only needs which are on). */
export function effectBits(f, now) {
  let bits = 0;
  for (const [kind, bit] of Object.entries(EFFECT_BITS)) if (effectOn(f, kind, now)) bits |= bit;
  return bits;
}
export function effectsFromBits(bits) {
  const out = {};
  for (const [kind, bit] of Object.entries(EFFECT_BITS)) if (bits & bit) out[kind] = { until: Infinity };
  return out;
}
