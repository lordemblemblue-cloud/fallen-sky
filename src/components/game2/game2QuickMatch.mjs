// Game 2 public matchmaking policy. We can only auto-join room types that
// the deployed Game 2 relay actually supports: ffa and teams. Duel and CTF
// are separate offline rules until their network authority is implemented.
export const GAME2_LIVE_QUEUE_MODES = Object.freeze(['ffa', 'teams']);

export function pickGame2QuickMatch(rooms, rng = Math.random) {
  if (!Array.isArray(rooms)) return null;
  const available = rooms.filter(room =>
    room && !room.custom &&
    GAME2_LIVE_QUEUE_MODES.includes(room.matchMode) &&
    typeof room.id === 'string' && room.id.length > 0 &&
    Number.isFinite(Number(room.players)) &&
    Number.isFinite(Number(room.maxPlayers)) &&
    Number(room.maxPlayers) > 0 &&
    Number(room.players) >= 0 &&
    Number(room.players) < Number(room.maxPlayers)
  );
  if (!available.length) return null;
  const types = GAME2_LIVE_QUEUE_MODES.filter(mode => available.some(room => room.matchMode === mode));
  const pick = count => Math.min(count - 1, Math.max(0, Math.floor(Math.min(0.999999999, Math.max(0, Number(rng()) || 0)) * count)));
  const type = types[pick(types.length)];
  const candidates = available.filter(room => room.matchMode === type);
  // Prefer rooms with existing opponents: a genuine public player pool rather
  // than an empty game, while retaining empty rooms as bootstrap fallbacks.
  const occupied = candidates.filter(room => Number(room.players) > 0);
  const pool = occupied.length ? occupied : candidates;
  return pool[pick(pool.length)];
}


/**
 * Compatibility with the older public-arena Railway relay. An old relay
 * cannot reserve a waiting-room seat, but it CAN admit a player to an
 * already-occupied public room. Never bootstrap an empty room here: the
 * button promises that a real opponent was found before launching a map.
 * Server-backed queues remain preferred whenever /status advertises them.
 */
export function pickGame2OccupiedPublicOpponent(rooms, requested = 'all', rng = Math.random) {
  if (requested !== 'all' && requested !== 'random' && !GAME2_LIVE_QUEUE_MODES.includes(requested))
    return null;
  const candidates = Array.isArray(rooms) ? rooms.filter(room =>
    room && Number(room.players) > 0 &&
    (requested === 'all' || requested === 'random' || room.matchMode === requested)
  ) : [];
  return pickGame2QuickMatch(candidates, rng);
}
