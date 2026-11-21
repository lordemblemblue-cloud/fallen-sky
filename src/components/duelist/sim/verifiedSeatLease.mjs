// Server-only transport adapter: bind an opaque connection object to one seat.
// This does not authenticate users or install a WebSocket handler. The host must
// verify the seat ownership before calling bindVerifiedConnection.
const validSeat = id => typeof id === 'string' && id.length > 0 && id.length <= 128;
const validConnection = connection => connection !== null &&
  (typeof connection === 'object' || typeof connection === 'function');

export function createVerifiedSeatLeaseRegistry() {
  const byConnection = new WeakMap();
  const bySeat = new Map();
  const generations = new Map();

  function bindVerifiedConnection(connection, verifiedSeatId) {
    if (!validConnection(connection) || !validSeat(verifiedSeatId)) {
      return { accepted: false, reason: 'invalid-binding' };
    }
    // A connection cannot silently assume another seat: it must be explicitly
    // released first, even when a stale socket remains open.
    const existing = byConnection.get(connection);
    if (existing && existing.seatId !== verifiedSeatId) {
      return { accepted: false, reason: 'connection-already-bound' };
    }
    if (existing && bySeat.get(verifiedSeatId) === connection) {
      return { accepted: true, seatId: verifiedSeatId, generation: existing.generation };
    }
    const previous = bySeat.get(verifiedSeatId);
    if (previous) byConnection.delete(previous);
    const generation = (generations.get(verifiedSeatId) || 0) + 1;
    generations.set(verifiedSeatId, generation);
    bySeat.set(verifiedSeatId, connection);
    byConnection.set(connection, { seatId: verifiedSeatId, generation });
    return { accepted: true, seatId: verifiedSeatId, generation };
  }

  function resolveVerifiedSeat(connection) {
    if (!validConnection(connection)) return null;
    const lease = byConnection.get(connection);
    if (!lease || bySeat.get(lease.seatId) !== connection ||
        generations.get(lease.seatId) !== lease.generation) return null;
    return lease.seatId;
  }

  function releaseConnection(connection) {
    if (!validConnection(connection)) return false;
    const lease = byConnection.get(connection);
    if (!lease) return false;
    byConnection.delete(connection);
    if (bySeat.get(lease.seatId) === connection) {
      bySeat.delete(lease.seatId);
      return true;
    }
    return false;
  }

  return Object.freeze({ bindVerifiedConnection, resolveVerifiedSeat, releaseConnection });
}
