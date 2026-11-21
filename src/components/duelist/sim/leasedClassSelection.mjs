// Transport-neutral server adapter: resolve an active verified connection lease
// before dispatching a class-selection packet. Never derive seat identity from
// client packet fields or an unverified guest/session identifier.
import { dispatchAuthenticatedClassSelection } from './classSelectionBoundary.mjs';

export function dispatchLeasedClassSelection({ match, leases, connection, packet } = {}) {
  // Resolve the current lease at dispatch time, not at connection setup.
  // Replaced sockets must fail even if they previously held this seat.
  const verifiedSeatId = leases?.resolveVerifiedSeat?.(connection);
  if (typeof verifiedSeatId !== 'string' || !verifiedSeatId) {
    return { accepted: false, reason: 'unauthenticated-seat' };
  }
  return dispatchAuthenticatedClassSelection({ match, verifiedSeatId, packet });
}
