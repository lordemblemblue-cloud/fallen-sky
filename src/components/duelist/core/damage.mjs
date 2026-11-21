// One hit through the defender's protection: evade, guard, shield/armor, then HP.
// Incoming damage NEVER spends Force/Will. Will is reserved for using powers and abilities.
import { BLOCK, VEIL } from './tuning.mjs';
import { drainStamina } from './vitals.mjs';

/**
 * @param {object} defender  { vitals, invulnerable, guard: null | { since, facing: boolean }, breached }
 *   invulnerable: inside a roll or dash's i-frames. guard.since: when the guard went up (seconds).
 *   guard.facing: the attacker is inside the guard's front arc. breached: this attacker holds a Veil Breach
 *   on the defender, allowing the attacker to pierce their shield/armor directly.
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

  // Shield and armor plating take the hit first. Breach directly exposes the body without touching Will.
  const shieldMul = Math.max(0.01, Number(hit.shieldMultiplier) || 1);
  if (damage > 0 && v.shield > 0 && !defender.breached) {
    const absorbed = Math.min(v.shield, damage * shieldMul);
    v.shield -= absorbed;
    v.lastShieldHit = now;
    result.shieldDamage = absorbed;
    damage -= absorbed / shieldMul;
  }

  // Do NOT divert the incoming hit to Force/Will. After shielding, the remaining damage reaches HP.
  // Veil stability still follows Will spent on abilities, but never drains from receiving damage.

  // The body.
  if (damage > 0) {
    const taken = Math.min(v.hp, damage);
    v.hp -= taken;
    v.lastHurt = now;
    result.hpDamage = taken;
    if (v.hp <= 1e-9) { v.hp = 0; v.dead = true; result.killed = true; }
  }
  result.veil = v.collapsed ? 'collapsed' : v.will < v.max.will * VEIL.unstableBelow ? 'unstable' : 'stable';
  return result;
}
