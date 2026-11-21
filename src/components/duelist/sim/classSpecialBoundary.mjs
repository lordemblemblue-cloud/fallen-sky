// Transport-neutral, fail-closed packet boundary for future server-owned class specials.
// This does NOT execute powers, spend meter, or authenticate a network connection.
import { classById } from '../core/classes.mjs';

const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const seatId = v => typeof v === 'string' && v.length > 0 && v.length <= 128;

/** A client can request a target, but NEVER supply actor, class, charge or effect. */
export function parseClassSpecialPacket(packet) {
  if (!plain(packet) || !own(packet, 'type') || packet.type !== 'class.special' ||
      Object.keys(packet).some(key => key !== 'type' && key !== 'targetId')) {
    return { ok: false, reason: 'invalid-special-request' };
  }
  if (own(packet, 'targetId') && !seatId(packet.targetId)) {
    return { ok: false, reason: 'invalid-special-request' };
  }
  return { ok: true, targetId: own(packet, 'targetId') ? packet.targetId : null };
}

/** The caller supplies a verified connection-to-seat mapping, not packet identity.
 * No mutation is performed: server-side effects, costs, cooldowns and animations
 * must be added in a separately reviewed authoritative match transaction. */
export function validateAuthenticatedSpecialRequest({ match, verifiedSeatId, packet } = {}) {
  const parsed = parseClassSpecialPacket(packet);
  if (!parsed.ok) return { accepted: false, reason: parsed.reason };
  if (!seatId(verifiedSeatId) || !match?.seats || typeof match.seats.get !== 'function' ||
      !match.world?.fighters || typeof match.world.fighters.get !== 'function') {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  const seat = match.seats.get(verifiedSeatId);
  const fighter = match.world.fighters.get(verifiedSeatId);
  if (!seat || seat.kind !== 'player' || !fighter) return { accepted: false, reason: 'unauthenticated-seat' };
  if (match.phase !== 'live' || fighter.vitals?.dead) return { accepted: false, reason: 'not-active' };
  const def = classById(seat.classId);
  if (!def || !Number.isFinite(seat.specialMeter) ||
      seat.specialMeter < 0 || seat.specialMeter > 100) {
    return { accepted: false, reason: 'invalid-class-state' };
  }
  if (seat.specialMeter + 1e-8 < def.special.cost) return { accepted: false, reason: 'not-charged' };
  if (def.special.target === 'enemy') {
    if (!parsed.targetId || parsed.targetId === verifiedSeatId) return { accepted: false, reason: 'target-required' };
    const targetSeat = match.seats.get(parsed.targetId);
    const target = match.world.fighters.get(parsed.targetId);
    if (!targetSeat || !target || target.vitals?.dead ||
        (seat.team != null && targetSeat.team === seat.team)) {
      return { accepted: false, reason: 'invalid-target' };
    }
  } else if (parsed.targetId !== null) {
    return { accepted: false, reason: 'unexpected-target' };
  }
  return { accepted: false, reason: 'special-not-implemented' };
}
