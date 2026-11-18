// Shared admission rules for the browser and the Railway arena relay.
export const SERVER_CAPACITY = 100;
export const TEAM_CAPACITY = 50;
export const SERVER_MAPS = ['training', 'skybridge', 'sumi_stronghold', 'hangar', 'carbon'];
export const SERVER_MODES = { ffa: 'Free-for-all', teams: 'Team Deathmatch', duel:'Duel Ladder', team_duel:'Team Duel Ladder', ctf:'Capture the Flag' };

export function validateServerSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Choose server settings.');
  const name = String(value.name || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 48);
  if (!name) throw new Error('Give your server a name.');
  if (!SERVER_MAPS.includes(value.mapId)) throw new Error('Choose an available map.');
  if (!Object.hasOwn(SERVER_MODES, value.matchMode)) throw new Error('Choose a match type.');
  if (![50, 100].includes(value.maxPlayers)) throw new Error('Choose 50 or 100 player slots.');
  if (!Number.isInteger(value.botFill) || value.botFill < 0 || value.botFill > value.maxPlayers) throw new Error('Bot fill must fit the server capacity.');
  if (['duel','team_duel','ctf'].includes(value.matchMode) && value.botFill > 0)
    throw new Error('Duel ladders and capture-the-flag require human competitors; turn off bot fill.');
  if (value.matchMode === 'ctf' && !['skybridge','sumi_stronghold'].includes(value.mapId))
    throw new Error('Capture the Flag requires an authored map with team flag bases.');
  return { name, mapId: value.mapId, matchMode: value.matchMode, maxPlayers: value.maxPlayers, botFill: value.botFill };
}

export function botSidesFor(settings, humans) {
  const count = Math.max(0, Math.min(settings.botFill, settings.maxPlayers) - humans.length);
  let light = humans.filter(p => p.side === 'light').length, dark = humans.length - light;
  return Array.from({ length: count }, () => {
    const side = settings.matchMode === 'teams' && light <= dark ? 'light' : 'dark';
    if (side === 'light') light++; else dark++;
    return side;
  });
}

// Older deployed relays expose per-map arenas rather than named servers. Keep them joinable,
// while only advertising capabilities the relay actually reports.
export function serversFromStatus(status, maps) {
  if (Array.isArray(status?.servers)) return status.servers;
  const ids = status?.rooms ? SERVER_MAPS : ['training'];
  return ids.flatMap((id, i) => (status.supports_modes ? ['ffa', 'teams'] : ['ffa']).map(matchMode => ({ id: matchMode === 'teams' ? id + ':teams' : id, name: `Public server ${i + 1}${matchMode === 'teams' ? ' · Team battle' : ''}`, mapId: id, matchMode,
    maxPlayers: status.max_players || SERVER_CAPACITY, players: 0, ai: 0,
    ...(status.rooms ? (matchMode === 'teams' ? status.team_arenas?.[id] : status.arenas?.[id]) : status), mapLabel: maps[id]?.label || id, legacy: true })));
}
