// Future multiplayer class-ability packet boundary. No network binding or effects.
import { evaluateClassAbility } from '../core/classAbilityGate.mjs';

const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const validSeatId = id => typeof id === 'string' && id.length > 0 && id.length <= 128;

/** Only a visible slot index is client-supplied. Never trust identity, page,
 * class, time, cooldowns, damage, meter, animation or outcome in packets. */
export function parseClassAbilityPacket(packet) {
  if (!plain(packet) || packet.type !== 'class.ability' || !own(packet, 'slot') ||
      Object.keys(packet).some(key => key !== 'type' && key !== 'slot') ||
      !Number.isInteger(packet.slot) || packet.slot < 0 || packet.slot > 2) {
    return { ok: false, reason: 'invalid-ability-request' };
  }
  return { ok: true, slot: packet.slot };
}

/** Host must derive verifiedSeatId from the authenticated connection and own
 * page offsets, clocks and cooldowns. Fail closed until effects are implemented.
 * This is a transport-neutral helper; no live socket handler is changed. */
export function validateAuthenticatedAbilityRequest({
  match, verifiedSeatId, packet, first, now, cooldowns,
} = {}) {
  const parsed = parseClassAbilityPacket(packet);
  if (!parsed.ok) return { accepted: false, reason: parsed.reason };
  if (!validSeatId(verifiedSeatId) || !match?.seats ||
      typeof match.seats.get !== 'function' ||
      !match.world?.fighters || typeof match.world.fighters.get !== 'function') {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  const seat = match.seats.get(verifiedSeatId);
  const fighter = match.world.fighters.get(verifiedSeatId);
  if (!seat || seat.kind !== 'player' || !fighter) {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  if (match.phase !== 'live') return { accepted: false, reason: 'not-active' };
  const result = evaluateClassAbility({ seat, fighter, slot: parsed.slot, first, now, cooldowns });
  return result.allowed
    ? { accepted: false, reason: 'ability-execution-not-wired' }
    : { accepted: false, reason: result.reason };
}
