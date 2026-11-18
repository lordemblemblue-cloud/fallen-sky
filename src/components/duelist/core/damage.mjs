// One hit through the defender's protection, in order: evade (roll), guard (parry / block / guard break),
// shield and armor plating, the Dimensional Veil (Will), and finally the body (HP).
import { BLOCK, VEIL } from './tuning.mjs';
import { drainStamina, drainWill } from './vitals.mjs';

/**
 * @param {object} defender  { vitals, invulnerable, guard: null | { since, facing: boolean }, breached }
 *   invulnerable: inside a roll or dash's i-frames. guard.since: when the guard went up (seconds).
 *   guard.facing: the attacker is inside the guard's front arc. breached: this attacker holds a Veil Breach
 *   on the defender, so the Veil does not stop their hits.
 * @param {object} hit  { damage, blockable, shieldMultiplier, veilMultiplier, kind }
 * @param {number} now  seconds
 * @returns {{ outcome, shieldDamage, willSpent, hpDamage, staminaSpent, veil, collapsed, killed, stagger }}
 *   outcome: 'evaded' | 'parried' | 'blocked' | 'guardBreak' | 'hit' | 'ignored' (already dead)
 *   collapsed: this hit collapsed the Veil. stagger: seconds of stagger the defender suffers from the guard
 *   (guard break) — move stagger is applied by the caller.
 */
export function resolveHit(defender, hit, now) {
  const v = defender.vitals;
  const result = { outcome: 'hit', shieldDamage: 0, willSpent: 0, hpDamage: 0, staminaSpent: 0, veil: null, collapsed: false, killed: false, stagger: 0 };
  if (v.dead) return { ...result, outcome: 'ignored' };
  if (defender.invulnerable) return { ...result, outcome: 'evaded' };
  let damage = Math.max(0, Number(hit.damage) || 0);

  // Guard: a fresh guard parries; a held guard blocks, paying stamina; an empty guard breaks.
  const guard = defender.guard;
  if (hit.blockable !== false && guard && guard.facing) {
    if (now - guard.since <= BLOCK.parryWindow) return { ...result, outcome: 'parried' };
    const cost = damage * BLOCK.staminaPerDamage;
    if (!v.winded && v.stamina >= cost) {
      result.staminaSpent = drainStamina(v, cost, now);
      result.outcome = 'blocked';
      damage *= BLOCK.chip;
    } else {
      result.staminaSpent = drainStamina(v, v.stamina, now);
      result.outcome = 'guardBreak';
      result.stagger = BLOCK.guardBreakStagger;
    }
  }

  // Shield and armor plating take the hit first. Weapons that break shields count for more against them.
  const shieldMul = Math.max(0.01, Number(hit.shieldMultiplier) || 1);
  if (damage > 0 && v.shield > 0) {
    const absorbed = Math.min(v.shield, damage * shieldMul);
    v.shield -= absorbed;
    v.lastShieldHit = now;
    result.shieldDamage = absorbed;
    damage -= absorbed / shieldMul;
  }

  // The Veil spends Will to stop what is left; an unstable Veil leaks part of it; a collapsed or breached
  // Veil stops nothing.
  if (damage > 0 && !v.collapsed && !defender.breached) {
    const wasUnstable = v.will < v.max.will * VEIL.unstableBelow;
    const leak = wasUnstable ? damage * VEIL.unstableLeak : 0;
    const toVeil = damage - leak;
    const cost = toVeil * VEIL.willPerDamage * Math.max(0.01, Number(hit.veilMultiplier) || 1);
    const paid = drainWill(v, cost, now);
    result.willSpent = paid;
    const stopped = cost > 0 ? toVeil * (paid / cost) : toVeil;
    damage = leak + (toVeil - stopped);
    if (v.collapsed) result.collapsed = true;
  }

  // The body.
  if (damage > 0) {
    const taken = Math.min(v.hp, damage);
    v.hp -= taken;
    result.hpDamage = taken;
    if (v.hp <= 1e-9) { v.hp = 0; v.dead = true; result.killed = true; }
  }
  result.veil = v.collapsed ? 'collapsed' : v.will < v.max.will * VEIL.unstableBelow ? 'unstable' : 'stable';
  return result;
}
