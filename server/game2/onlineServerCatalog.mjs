import { ONLINE_QUEUE_MODES, MODE_MAP_POOLS } from './onlineArenaPolicy.mjs';

const MODE_NAMES = Object.freeze({
  ffa: 'Free-for-all',
  teams: 'Team Deathmatch',
  duel: 'Duel Ladder',
  team_duel: 'Team Duel',
  ctf: 'Capture the Flag',
});

const isPublicListing = room => !!room &&
  (room.publicMode === true || room.legacy === true) &&
  ONLINE_QUEUE_MODES.includes(room.matchMode) &&
  typeof room.id === 'string' && room.id.length > 0;

const serverOrder = (a, b) => {
  const slotA = Number.isInteger(a.slot) ? a.slot : 999;
  const slotB = Number.isInteger(b.slot) ? b.slot : 999;
  return slotA - slotB || String(a.id).localeCompare(String(b.id));
};

/**
 * Restore the original multiple-server browser: every distinct, backend-
 * advertised public room gets its own joinable row. Never manufacture a room
 * from a map or reuse a different room's ID just to fill the grid.
 *
 * Base44 does not yet own authoritative CTF. Railway's real advertised CTF
 * rooms can be listed alongside Base44 rooms, pinned to Railway on admission.
 * Missing modes receive one explicitly disabled explanatory row.
 */
export function buildOnlineModeServerCatalog({
  primaryServers = [],
  fallbackServers = [],
  primaryBackend = 'base44',
  maxPlayers = 100,
} = {}) {
  const primary = (Array.isArray(primaryServers) ? primaryServers : []).filter(isPublicListing);
  const fallbackCtf = primaryBackend === 'base44'
    ? (Array.isArray(fallbackServers) ? fallbackServers : [])
      .filter(room => isPublicListing(room) && room.matchMode === 'ctf')
    : [];
  const rows = [];
  const seen = new Set();

  for (const mode of ONLINE_QUEUE_MODES) {
    const sources = [
      ...primary.filter(room => room.matchMode === mode),
      ...(mode === 'ctf' ? fallbackCtf : []),
    ].sort(serverOrder);
    let found = false;
    for (const room of sources) {
      const backend = room.backend || (fallbackCtf.includes(room) ? 'railway' : primaryBackend);
      const key = backend + ':' + room.id;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...room, backend });
      found = true;
    }
    if (found) continue;

    const ctfOnRailway = mode === 'ctf' && primaryBackend === 'base44';
    rows.push({
      id: 'unavailable-' + mode,
      name: MODE_NAMES[mode],
      serverName: MODE_NAMES[mode],
      matchMode: mode,
      mapId: MODE_MAP_POOLS[mode][0],
      players: 0,
      maxPlayers,
      backend: primaryBackend,
      publicMode: false,
      legacy: false,
      unavailable: true,
      unavailableReason: ctfOnRailway
        ? 'Capture the Flag runs on the Railway relay, but that server is not responding.'
        : MODE_NAMES[mode] + ' is not advertised by the connected multiplayer server yet.',
    });
  }
  return rows;
}
