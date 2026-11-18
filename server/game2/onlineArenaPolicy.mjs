// Game 2's authored queue-map rules. Map display names may be revised without
// pretending that an unbuilt level exists. SULI maps to the authored Sumi-e
// Stronghold and Sky Village to the existing Skybridge Citadel geometry.
export const ONLINE_QUEUE_MAPS = Object.freeze({
  training: Object.freeze({id:'training',label:'Training Grounds',asset:'duel_training.bsp'}),
  skybridge: Object.freeze({id:'skybridge',label:'Sky Village',asset:'authored:skybridge'}),
  sumi_stronghold: Object.freeze({id:'sumi_stronghold',label:'SULI · Sumi-e Stronghold',asset:'authored:sumi_stronghold'}),
});
export const ONLINE_QUEUE_MODES = Object.freeze(['ffa','teams','duel','team_duel','ctf']);
export const MODE_MAP_POOLS = Object.freeze({
  ffa: Object.freeze(['training','skybridge']),
  teams: Object.freeze(['sumi_stronghold']),
  duel: Object.freeze(['training','skybridge']),
  team_duel: Object.freeze(['training','skybridge']),
  ctf: Object.freeze(['sumi_stronghold']),
});
export const ROTATING_DUEL_MODES = Object.freeze(['duel','team_duel']);
export function mapOptionsForMode(mode) {
  return (MODE_MAP_POOLS[mode] || []).map(id=>ONLINE_QUEUE_MAPS[id]);
}
export function queueMapAllowed(mode,mapId) {
  return !mapId || !!MODE_MAP_POOLS[mode]?.includes(mapId);
}
export function chooseQueueMap(mode,rng=Math.random,mapId=null) {
  const pool=MODE_MAP_POOLS[mode];
  if(!pool)throw new Error('Unknown Game 2 queue mode');
  if(mapId != null) {
    if(!pool.includes(mapId))throw new Error('Map is unavailable for this mode');
    return mapId;
  }
  const seed=Number(rng());
  return pool[Math.min(pool.length-1,Math.max(0,Math.floor((Number.isFinite(seed)?seed:0)*pool.length)))];
}
// Restore the classic multi-server browser: two real, isolated room slots per mode.
// Canonical first-slot IDs remain stable for older clients and queue reservations.
const PUBLIC_MODE_NAMES = Object.freeze({
  ffa: 'Free-for-all', teams: 'Team Deathmatch', duel: 'Duel Ladder',
  team_duel: 'Team Duel Ladder', ctf: 'Capture the Flag',
});
export const PUBLIC_MODE_ROOMS = Object.freeze(ONLINE_QUEUE_MODES.flatMap(mode =>
  [1, 2].map(slot => {
    const mapId = MODE_MAP_POOLS[mode][(slot - 1) % MODE_MAP_POOLS[mode].length];
    return Object.freeze({
      id: slot === 1 ? 'public-' + mode : 'public-' + mode + '-' + slot,
      name: PUBLIC_MODE_NAMES[mode] + ' · ' + ONLINE_QUEUE_MAPS[mapId].label + ' #' + slot,
      mode, matchMode: mode, mapId, slot,
    });
  })));
const publicPlayerCount = room => Array.isArray(room.players) ? room.players.length :
  Number(room.players ?? room.clients?.size ?? 0);
const publicReservedCount = room => Number(room.reservations?.size ??
  Object.keys(room.assignedSides || {}).length);
export function selectPublicModeRoom(rooms, mode, mapId = null) {
  return [...(rooms||[])].filter(room=>
    room.matchMode===mode && room.publicMode &&
    queueMapAllowed(mode,room.mapId) && (!mapId || room.mapId===mapId) &&
    publicPlayerCount(room)+publicReservedCount(room)<Number(room.maxPlayers||0))
    .sort((a,b)=>(publicPlayerCount(a)+publicReservedCount(a))-
      (publicPlayerCount(b)+publicReservedCount(b)) ||
      String(a.id).localeCompare(String(b.id)))[0]||null;
}
