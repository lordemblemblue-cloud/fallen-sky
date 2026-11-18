// A small, testable bridge between precise 360 guards and the existing
// Force Evade / Counter systems. Only the offline Experimental ruleset uses it.
import { guardSectorFromHit } from './directionalGuard.js';
import { staminaBroken } from './experimentalStamina.js';

export const COUNTER_STEP_WINDOW = 0.9;
export const COUNTER_STEP_FORCE_PERCENT = 15; // same cost as the existing held-Q Force Evade
export const COUNTER_STEP_STAMINA_COST = 9;

export function preciseParry(defender, contactPoint, now) {
  const g = defender?.directionalGuard;
  return !!(g?.held && g.sector && Number.isFinite(g.until) && now <= g.until &&
    Array.isArray(contactPoint) && g.sector === guardSectorFromHit(defender, contactPoint));
}

export function counterStepIntent(cmd) {
  // WASD retains the existing directional evade semantics: W flanks behind,
  // W+A/D chooses the side, S retreats, A/D sidestep, and diagonals work.
  if (!cmd || !Number.isFinite(cmd.fwd) || !Number.isFinite(cmd.right)) return false;
  return Math.abs(cmd.fwd) > 0.1 || Math.abs(cmd.right) > 0.1;
}

export function mayCounterStep(fighter, force, now) {
  const opponent = fighter?.critTarget;
  if (!fighter?.isPlayer || fighter.remote || fighter.status !== 'normal' ||
      !fighter.onGround || fighter.dodge || fighter.kata || fighter.kicking ||
      fighter.executing || fighter.thrown || fighter.saber?.holstered ||
      fighter.saber?.inFlight || fighter.saber?.isActiveSwing?.() ||
      (fighter.dodgeReadyAt ?? 0) > now || (fighter.experimentalCounterUntil ?? 0) <= now ||
      (fighter.critUntil ?? 0) <= now ||
      !opponent || opponent.remote || opponent.status !== 'open' ||
      (opponent.openUntil ?? 0) <= now) return false;
  if (!force || force.holding || force.charging || force.dash ||
      force.fp < force.max * COUNTER_STEP_FORCE_PERCENT / 100) return false;
  const stamina = fighter.experimentalStamina;
  return !!(stamina && !staminaBroken(stamina, now) &&
    stamina.current >= COUNTER_STEP_STAMINA_COST);
}
