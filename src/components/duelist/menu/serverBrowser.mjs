// Public Duelist server browser contract. A room is selected by its exact
// server-issued ID; never convert a row click into a matchmaking/quick-join request.
export const ONLINE_SERVER_MODES = Object.freeze([
  'duel', 'ffa', 'tdm', 'ctf', 'escort', 'football', 'control',
]);
const MODES = new Set(ONLINE_SERVER_MODES);
const MAX_HUMANS = 20;
const VALID_ID = /^m[1-9][0-9]*$/;

const count = (raw, max) =>
  Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, max) : 0;

/** Only display valid public battle rooms from the server's live /lobby response. */
export function visibleDuelistServers(matches, mode = 'all') {
  if (!Array.isArray(matches)) return [];
  return matches.flatMap((room) => {
    if (!room || typeof room !== 'object' ||
      typeof room.id !== 'string' || !VALID_ID.test(room.id) ||
      !MODES.has(room.mode) || (mode !== 'all' && room.mode !== mode) ||
      !Number.isSafeInteger(room.seats) || room.seats < 1) return [];
    const seats = Math.min(MAX_HUMANS, room.seats);
    const players = count(room.players, seats);
    const bots = count(room.bots, seats - players);
    const phase = ['countdown', 'live', 'over'].includes(room.phase) ? room.phase : 'countdown';
    return [{
      id: room.id, mode: room.mode, seats, players, bots, phase,
      open: room.open === true && players < seats && phase !== 'over',
    }];
  }).sort((a, b) =>
    ONLINE_SERVER_MODES.indexOf(a.mode) - ONLINE_SERVER_MODES.indexOf(b.mode) ||
    b.players - a.players || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Exact-room join for /duelist-next/play; never silently matchmake or queue. */
export function serverJoinSearch(room) {
  const verified = visibleDuelistServers([room])[0];
  return verified?.open ? {
    mode: verified.mode, online: 1, matchId: verified.id, from: 'online-play',
  } : null;
}
