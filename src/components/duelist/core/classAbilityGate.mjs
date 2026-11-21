// Pure, fail-closed class ability intent gate for the future authoritative match host.
// The host supplies its own seat/class, actor status and cooldown clock; none may
// come from an untrusted client packet. This module deliberately applies no effects.
import { classById, visibleClassAbilities } from './classes.mjs';

const validTime = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * Validate an ability request against a server-owned seat and fighter.
 * The client may request only a slot (0..2); the server owns the page offset,
 * active class, life state, cooldowns and whether an ability is implemented.
 */
export function evaluateClassAbility({ seat, fighter, slot, first = 0, now, cooldowns } = {}) {
  if (!seat || seat.kind !== 'player' || !classById(seat.classId)) return { allowed: false, reason: 'no-active-class' };
  if (!fighter || fighter.vitals?.dead || !Number.isFinite(fighter.vitals?.hp) || fighter.vitals.hp <= 0) {
    return { allowed: false, reason: 'actor-defeated' };
  }
  if (!Number.isInteger(slot) || slot < 0 || slot > 2 || !Number.isInteger(first) || first < 0 || first > 3 ||
      !validTime(now) || !cooldowns || typeof cooldowns !== 'object' || Array.isArray(cooldowns)) {
    return { allowed: false, reason: 'invalid-context' };
  }
  const ability = visibleClassAbilities(seat.classId, first)[slot];
  if (!ability) return { allowed: false, reason: 'unknown-ability' };
  const until = Object.hasOwn(cooldowns, ability.id) ? cooldowns[ability.id] : 0;
  if (!validTime(until)) return { allowed: false, reason: 'invalid-cooldown' };
  if (until > now) return { allowed: false, reason: 'cooldown' };
  // All current class powers are placeholders, not mapped to authoritative
  // world effects. Do not spend resources or emit animations for them.
  if (!ability.implemented) return { allowed: false, reason: 'not-implemented', abilityId: ability.id };
  return { allowed: true, abilityId: ability.id, animation: ability.animation };
}
