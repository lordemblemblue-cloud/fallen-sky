// A landed move against one defender: the damage through the protection layers, then what the move does
// to them (stagger, knockback, being held or thrown, a Veil Breach) and what a parry does to the attacker.
// The world (or the match server) decides who is in reach; this decides what happens to them.
// Class abilities change it here too (core/abilities.mjs): stances and Rage scale damage, a Sanctuary shelters,
// Rage shrugs off control, Guard and Counter answers a strike, Empowered Strikes spend a charge, a hit ends a
// Veil Cloak, and an execution finishes its target outright.
import { BLOCK, KNOCKDOWN } from './tuning.mjs';
import { resolveHit } from './damage.mjs';
import { drainWill } from './vitals.mjs';
import { stagger, isInvulnerable, isBreachedBy, grantBreach, knockDown, press } from './fighter.mjs';
import { damageFor, controlImmune, knockbackTaken, spendEmpower, effectOn, endEffect } from './abilities.mjs';
import { moveFor } from './ranks.mjs';

// Is `attackerPos` inside the defender's guard arc? Positions { x, z }; facing = the defender's yaw
// (radians, 0 = +Z).
export function insideArc(fromPos, facingYaw, toPos, arcDeg) {
  const dx = toPos.x - fromPos.x;
  const dz = toPos.z - fromPos.z;
  if (dx * dx + dz * dz < 1e-8) return true;
  const angle = Math.atan2(dx, dz) - facingYaw;
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Math.abs(wrapped) <= (arcDeg * Math.PI) / 360;
}

// the Duelist's Guard and Counter: in its stance, a strike from the front is answered
const countering = (defender, move, facing) => {
  const a = defender.action;
  return a?.id === 'counter' && a.t <= a.move.active && facing && move.kind === 'attack' && move.damageKind === 'melee';
};

/**
 * @param attacker, defender  fighters (core/fighter.mjs)
 * @param moveId  the attacker's move whose hit landed ('grip' ticks pass { dt })
 * @param ctx  { now, defenderFacesAttacker: the attacker is inside the defender's guard arc, dt,
 *             behind: the attacker strikes from the defender's back, sheltered: the defender stands in an allied
 *             Sanctuary }
 * @returns { result (damage.mjs), effects: [{ type, ... }] } for presentation and the server's broadcast.
 */
export function strike(attacker, defender, moveId, { now, defenderFacesAttacker = true, dt = null, behind = false, sheltered = false } = {}) {
  const move = moveFor(attacker, moveId); // at the attacker's rank
  const effects = [];
  if (!move || defender.vitals.dead || defender === attacker) return { result: null, effects };

  // An execution (a class special) finishes its target outright; only invulnerability saves it.
  if (move.execute) {
    if (isInvulnerable(defender, now)) return { result: { outcome: 'evaded' }, effects };
    const hpDamage = defender.vitals.hp;
    defender.vitals.hp = 0;
    defender.vitals.dead = true;
    defender.heldBy = null;
    effects.push({ type: 'execution', move: moveId, attacker: attacker.id, defender: defender.id });
    effects.push({ type: 'defeat', defender: defender.id, by: attacker.id });
    effects.push({ type: 'impact', outcome: 'hit', move: moveId, attacker: attacker.id, defender: defender.id, veil: 'collapsed', shield: 0, will: 0, hp: hpDamage });
    return { result: { outcome: 'hit', killed: true, hpDamage }, effects };
  }

  // Breach opens the defender's Veil to this attacker for a moment; it does no damage itself.
  if (move.damageKind === 'breach') {
    if (isInvulnerable(defender, now)) return { result: { outcome: 'evaded' }, effects };
    grantBreach(defender, attacker.id, now);
    effects.push({ type: 'breach', attacker: attacker.id, defender: defender.id });
    return { result: { outcome: 'breach' }, effects };
  }

  // The grip takes hold of the defender (who can Resist), then crushes it while held. Rage cannot be held.
  if (moveId === 'grip' && dt === null) {
    if (isInvulnerable(defender, now)) return { result: { outcome: 'evaded' }, effects };
    if (controlImmune(defender, now)) { effects.push({ type: 'resisted', attacker: attacker.id, defender: defender.id }); return { result: { outcome: 'resisted' }, effects }; }
    defender.heldBy = attacker.id;
    effects.push({ type: 'held', attacker: attacker.id, defender: defender.id });
    return { result: { outcome: 'held' }, effects };
  }
  if (moveId === 'grip' && defender.heldBy !== attacker.id) return { result: null, effects }; // it broke free

  // Guard and Counter: the strike is turned aside and answered at once.
  if (!isInvulnerable(defender, now) && countering(defender, move, defenderFacesAttacker)) {
    stagger(attacker, 0.6, now);
    defender.action = null;
    press(defender, '#counterStrike', now);
    effects.push({ type: 'counter', attacker: attacker.id, defender: defender.id });
    return { result: { outcome: 'countered' }, effects };
  }

  const base = moveId === 'grip' ? move.damage * dt : move.damage;
  const damage = damageFor(attacker, move, base, { now, behind, sheltered });
  const defense = {
    vitals: defender.vitals,
    invulnerable: isInvulnerable(defender, now),
    guard: defender.guard ? { since: defender.guard.since, facing: defenderFacesAttacker } : null,
    breached: isBreachedBy(defender, attacker.id, now),
  };
  const result = resolveHit(defense, { damage, blockable: move.blockable, shieldMultiplier: move.shieldMultiplier,
    veilMultiplier: move.veilMultiplier, kind: move.damageKind }, now);

  if (result.outcome === 'parried') {
    stagger(attacker, BLOCK.parryStagger, now);
    effects.push({ type: 'parry', attacker: attacker.id, defender: defender.id });
    return { result, effects };
  }
  if (result.outcome === 'evaded' || result.outcome === 'ignored') return { result, effects };
  if (moveId === 'gripThrow' && defender.heldBy === attacker.id) defender.heldBy = null;

  // a strike that met its target spends an Empowered charge, draining Will; any hit ends a Veil Cloak
  if (move.kind === 'attack') {
    const drain = spendEmpower(attacker, now);
    if (drain > 0 && !defender.vitals.dead) drainWill(defender.vitals, drain, now);
  }
  if (effectOn(defender, 'cloak', now) && (result.hpDamage > 0 || result.willSpent > 0 || result.shieldDamage > 0)) {
    endEffect(defender, 'cloak');
    effects.push({ type: 'uncloak', fighter: defender.id });
  }

  // A blocked hit only pushes the guard back; anything that got past the guard staggers and knocks back.
  // Rage shrugs off stagger, knockback and knockdown; the Warrior's stance stands firmer.
  const immune = controlImmune(defender, now);
  const through = result.outcome === 'hit' || result.outcome === 'guardBreak';
  const staggerFor = immune ? 0 : Math.max(result.stagger || 0, through ? move.stagger : 0);
  if (staggerFor > 0 && moveId !== 'grip') stagger(defender, staggerFor, now);
  const knockback = immune ? 0 : (through ? move.knockback : move.knockback * 0.25) * knockbackTaken(defender);
  if (knockback) effects.push({ type: 'knockback', defender: defender.id, from: attacker.id, distance: knockback });
  // a push or a throw knocks down; a pull only drags the target into reach (to be hit, not to fall)
  if (!immune && through && move.knockback >= KNOCKDOWN.distance && !result.killed) {
    knockDown(defender, now);
    effects.push({ type: 'knockdown', defender: defender.id, by: attacker.id });
  }
  if (result.collapsed) effects.push({ type: 'veilCollapse', defender: defender.id });
  if (result.killed) effects.push({ type: 'defeat', defender: defender.id, by: attacker.id });
  effects.push({ type: 'impact', outcome: result.outcome, move: moveId, attacker: attacker.id, defender: defender.id, veil: result.veil,
    shield: result.shieldDamage, will: result.willSpent, hp: result.hpDamage });
  return { result, effects };
}
