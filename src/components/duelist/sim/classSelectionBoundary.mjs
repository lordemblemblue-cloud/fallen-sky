// A deliberately transport-agnostic boundary for future Duelist multiplayer.
// The connection's verified seat ID MUST be supplied by the server, never the packet.
import { classById } from '../core/classes.mjs';
import { queueMatchClass } from './match.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Accept only {type:'class.select', classId:<known id>}.
 * Reject extra fields, including identity, phase, dead, meter and class overrides.
 * This function does not authenticate a socket or wire a live WebSocket handler.
 */
export function parseClassSelectionPacket(packet) {
  if (!plain(packet) || Object.keys(packet).length !== 2 ||
      !own(packet, 'type') || !own(packet, 'classId') ||
      packet.type !== 'class.select' || !classById(packet.classId)) {
    return { ok: false, reason: 'invalid-class-request' };
  }
  return { ok: true, classId: packet.classId };
}

/**
 * Host must obtain verifiedSeatId from its authenticated connection/session
 * mapping. Never call this with packet.id or an unverified guest identifier.
 */
export function dispatchAuthenticatedClassSelection({ match, verifiedSeatId, packet } = {}) {
  const parsed = parseClassSelectionPacket(packet);
  if (!parsed.ok) return { accepted: false, reason: parsed.reason };
  if (typeof verifiedSeatId !== 'string' || !verifiedSeatId ||
      !match?.seats || typeof match.seats.get !== 'function' ||
      !match.world?.fighters || typeof match.world.fighters.get !== 'function') {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  const seat = match.seats.get(verifiedSeatId);
  if (!seat || seat.kind !== 'player') return { accepted: false, reason: 'unauthenticated-seat' };
  return queueMatchClass(match, verifiedSeatId, parsed.classId);
}
