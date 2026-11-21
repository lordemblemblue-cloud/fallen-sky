// Transport-neutral server adapter. The host must authenticate ownership before
// binding a connection; a packet must never provide or override the player seat.
import { validateAuthenticatedSpecialRequest } from './classSpecialBoundary.mjs';

export function validateLeasedClassSpecialRequest({ match, leases, connection, packet } = {}) {
  // Resolve on EVERY request, not when the socket first connects: replacement
  // connections revoke stale leases, including after a delayed disconnect.
  const verifiedSeatId = leases?.resolveVerifiedSeat?.(connection);
  if (typeof verifiedSeatId !== 'string' || verifiedSeatId.length === 0) {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  return validateAuthenticatedSpecialRequest({ match, verifiedSeatId, packet });
}
