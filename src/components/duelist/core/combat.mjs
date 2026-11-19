// A landed move against one defender: the damage through the protection layers, then what the move does
// to them (stagger, knockback, being held or thrown, a Veil Breach) and what a parry does to the attacker.
// The world (or the match server) decides who is in reach; this decides what happens to them.
import { moveById } from './moves.mjs';
import { BLOCK, KNOCKDOWN } from './tuning.mjs';
import { resolveHit } from './damage.mjs';
import { stagger, isInvulnerable, isBreachedBy, grantBreach, knockDown } from './fighter.mjs';

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

/**
 * @param attacker, defender  fighters (core/fighter.mjs)
 * @param moveId  the attacker's move whose hit landed ('grip' ticks pass { dt })
 * @param ctx  { now, attackerFacingDefender: bool (defender inside the defender's own guard arc as seen
 *             from the attacker, i.e. the defender faces the attacker), dt }
 * @returns { result (damage.mjs), effects: [{ type, ... }] } for presentation and the server's broadcast.
 */
export function strike(attacker, defender, moveId, { now, defenderFacesAttacker = true, dt = null } = {}) {
  const move = moveById(moveId);
  const effects = [];
  if (!move || defender.vitals.dead || defender === attacker) return { result: null, effects };

  // Breach opens the defender's Veil to this attacker for a moment; it does no damage itself.
  if (move.damageKind === 'breach') {
    if (isInvulnerable(defender, now)) return { result: { outcome: 'evaded' }, effects };
    grantBreach(defender, attacker.id, now);
    effects.push({ type: 'breach', attacker: attacker.id, defender: defender.id });
    return { result: { outcome: 'breach' }, effects };
  }

  // The grip takes hold of the defender (who can Resist), then crushes it while held.
  if (moveId === 'grip' && dt === null) {
    if (isInvulnerable(defender, now)) return { result: { outcome: 'evaded' }, effects };
    defender.heldBy = attacker.id;
    effects.push({ type: 'held', attacker: attacker.id, defender: defender.id });
    return { result: { outcome: 'held' }, effects };
  }
  const damage = moveId === 'grip' ? move.damage * dt : move.damage;
  if (moveId === 'grip' && defender.heldBy !== attacker.id) return { result: null, effects }; // it broke free

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

  // A blocked hit only pushes the guard back; anything that got past the guard staggers and knocks back.
  const through = result.outcome === 'hit' || result.outcome === 'guardBreak';
  const staggerFor = Math.max(result.stagger || 0, through ? move.stagger : 0);
  if (staggerFor > 0 && moveId !== 'grip') stagger(defender, staggerFor, now);
  const knockback = through ? move.knockback : move.knockback * 0.25;
  if (knockback) effects.push({ type: 'knockback', defender: defender.id, from: attacker.id, distance: knockback });
  // a push or a throw knocks down; a pull only drags the target into reach (to be hit, not to fall)
  if (through && move.knockback >= KNOCKDOWN.distance && !result.killed) {
    knockDown(defender, now);
    effects.push({ type: 'knockdown', defender: defender.id, by: attacker.id });
  }
  if (result.collapsed) effects.push({ type: 'veilCollapse', defender: defender.id });
  if (result.killed) effects.push({ type: 'defeat', defender: defender.id, by: attacker.id });
  effects.push({ type: 'impact', outcome: result.outcome, move: moveId, defender: defender.id, veil: result.veil,
    shield: result.shieldDamage, will: result.willSpent, hp: result.hpDamage });
  return { result, effects };
}
