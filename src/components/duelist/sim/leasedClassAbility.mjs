// Server-only transport-neutral adapter. The host authenticates the connection
// before binding its seat lease; this module never authenticates a socket.
import { validateAuthenticatedAbilityRequest } from './classAbilityBoundary.mjs';

export function validateLeasedClassAbility({
  match, leases, connection, packet, first, now, cooldowns,
} = {}) {
  // Resolve on every packet: a superseded socket must not reuse a cached seat.
  const verifiedSeatId = leases?.resolveVerifiedSeat?.(connection);
  if (typeof verifiedSeatId !== 'string' || !verifiedSeatId) {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  return validateAuthenticatedAbilityRequest({
    match, verifiedSeatId, packet, first, now, cooldowns,
  });
}
