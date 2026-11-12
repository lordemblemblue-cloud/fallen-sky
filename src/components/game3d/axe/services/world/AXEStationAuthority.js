// Pure lifecycle model for a dedicated authenticated server adapter. Not a peer
// authority: callers supply authenticated actor IDs and trusted world presence.
import { AXE_STATION_CONFIG, AXE_STATION_GROUPS, stationDistance } from './AXEServiceStationConfig.js';

export function createAXEStationAuthority({ config = AXE_STATION_CONFIG, now = Date.now, createId = () => crypto.randomUUID(), validatePlacement = () => false } = {}) {
  const stations = new Map(), cooldowns = new Map(), requests = new Map();
  let version = 0;
  const snapshot = () => ({ version, stations: [...stations.values()].map(s => ({ ...s, position: { ...s.position }, users: [...s.users.keys()] })) });
  function cleanup(presence = []) {
    const time = now();
    let changed = false;
    for (const [id, station] of stations) {
      for (const [actor, expiry] of station.users) {
        const player = presence.find(p => p.id === actor && p.region === station.region);
        if (expiry < time || !player || stationDistance(player, station.position) > config.interactionRange) { station.users.delete(actor); changed = true; }
      }
      const nearby = presence.filter(p => p.region === station.region && stationDistance(p, station.position) <= config.presenceRadius);
      if (station.users.size || nearby.length) station.lastOccupiedAt = time;
      if (!nearby.some(p => p.id === station.caretakerId)) {
        const nextCaretaker = [...station.users.keys()].sort()[0] || nearby.map(p => p.id).sort()[0] || station.caretakerId;
        if (nextCaretaker !== station.caretakerId) { station.caretakerId = nextCaretaker; changed = true; }
      }
      if (!station.users.size && time - station.lastOccupiedAt >= config.idleTimeoutMs) { stations.delete(id); changed = true; }
    }
    // Idle maintenance runs frequently on the real server. Publishing a new
    // snapshot version on every no-op tick floods subscribers and browsers.
    if (changed) version++;
    return snapshot();
  }
  function request({ actor, action, groupId, stationId, requestId, position, presence = [] }) {
    if (!actor?.id || !actor.region || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return { ok: false, reason: 'AUTHENTICATED_WORLD_PRESENCE_REQUIRED' };
    if (action !== 'leave' && actor.allowed !== true) return { ok: false, reason: 'SERVICES_UNAVAILABLE_HERE' };
    const key = requestId && `${actor.id}:${requestId}`;
    if (key && requests.has(key)) return requests.get(key);
    cleanup(presence);
    const time = now();
    let station = stations.get(stationId), result;
    if (action === 'summon') {
      if (!AXE_STATION_GROUPS[groupId]) return { ok: false, reason: 'UNKNOWN_STATION_GROUP' };
      station = [...stations.values()].find(s => s.region === actor.region && s.groupId === groupId && stationDistance(actor, s.position) <= config.reuseRadius && (s.users.has(actor.id) || s.users.size < config.capacity));
      if (!station) {
        if ((cooldowns.get(actor.id) || 0) > time) return { ok: false, reason: 'SUMMON_COOLDOWN' };
        const local = [...stations.values()].filter(s => s.region === actor.region && stationDistance(actor, s.position) <= config.regionalRadius);
        if (local.length >= config.regionalCap || local.filter(s => s.groupId === groupId).length >= config.perGroupCap) return { ok: false, reason: 'REGIONAL_STATION_LIMIT' };
        if (!position || ![position.x, position.y, position.z].every(Number.isFinite) || stationDistance(actor, position) > config.interactionRange || !validatePlacement(position, actor, [...stations.values()])) return { ok: false, reason: 'NO_SAFE_PLACEMENT' };
        if ([...stations.values()].some(s => s.region === actor.region && stationDistance(position, s.position) < config.radius * 2 + config.clearance)) return { ok: false, reason: 'STATION_OVERLAP' };
        station = { id: createId(), groupId, region: actor.region, position: { ...position }, caretakerId: actor.id, users: new Map(), createdAt: time, lastOccupiedAt: time };
        stations.set(station.id, station); cooldowns.set(actor.id, time + config.summonCooldownMs);
      }
    }
    if (action === 'leave') {
      for (const s of stations.values()) if (!stationId || s.id === stationId) s.users.delete(actor.id);
      result = { ok: true };
    } else if (action === 'summon' || action === 'enter' || action === 'heartbeat') {
      if (!station || station.region !== actor.region) return { ok: false, reason: 'STATION_NOT_FOUND' };
      if (stationDistance(actor, station.position) > config.interactionRange) return { ok: false, reason: 'STATION_TOO_FAR' };
      if (!station.users.has(actor.id) && station.users.size >= config.capacity) return { ok: false, reason: 'STATION_AT_CAPACITY' };
      for (const s of stations.values()) s.users.delete(actor.id);
      station.users.set(actor.id, time + config.leaseTimeoutMs); station.lastOccupiedAt = time;
      result = { ok: true, stationId: station.id };
    } else return { ok: false, reason: 'UNKNOWN_STATION_ACTION' };
    version++;
    result = { ...result, ...snapshot() };
    if (key) { requests.set(key, result); if (requests.size > 2000) requests.delete(requests.keys().next().value); }
    return result;
  }
  return { request, cleanup, snapshot };
}
