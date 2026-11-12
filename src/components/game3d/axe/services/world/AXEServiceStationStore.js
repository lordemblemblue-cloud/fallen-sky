// One client lifecycle, separate from inventory and service transaction authority.
import { AXE_STATION_CONFIG, AXE_STATION_GROUPS, stationDistance } from './AXEServiceStationConfig.js';

let runtime = null, authority = null, stopAuthority = null, authorityVersion = -1;
let activeStationId = null, stations = [], preview = null, rotation = 0, lastSummon = -Infinity, lastHeartbeat = 0, requestNumber = 0;
let mode = 'unavailable', message = '', sessionEpoch = 0, transportEpoch = 0, configurationEpoch = 0, transportFailed = false, operationQueue = Promise.resolve();
const listeners = new Set();
const emit = () => { const value = getAXEServiceStationSnapshot(); for (const fn of listeners) fn(value); };
export const getAXEServiceStationSnapshot = () => ({ stations: stations.map(s => ({ ...s, position: { ...s.position } })), activeStationId, mode, message });
export const getAXEServiceStationClientState = () => ({ activeStationId, mode });
export function subscribeAXEServiceStations(fn) { listeners.add(fn); fn(getAXEServiceStationSnapshot()); return () => listeners.delete(fn); }
const unavailable = (reason) => ({ ok: false, reason, shared: !!authority });
const event = (name, detail) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail })); };

function applyAuthority(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.version) || !Array.isArray(snapshot.stations)) return false;
  if (snapshot.version < authorityVersion) return false;
  authorityVersion = snapshot.version;
  stations = snapshot.stations.filter(s => s?.id && AXE_STATION_GROUPS[s.groupId] && [s.position?.x, s.position?.y, s.position?.z].every(Number.isFinite));
  if (activeStationId && !stations.some(s => s.id === activeStationId)) { activeStationId = null; event('axeServiceStationUnavailable', { reason: 'STATION_REMOVED' }); }
  mode = 'shared'; message = ''; runtime?.sync(stations); emit(); return true;
}

function failAuthority(adapter, transport) {
  if (authority !== adapter || transport !== transportEpoch) return;
  sessionEpoch++; transportEpoch++; transportFailed = true;
  mode = 'unavailable'; message = 'Shared workstation connection lost.';
  activeStationId = null; stations = []; runtime?.sync(stations); emit();
  event('axeServiceStationUnavailable', { reason: 'STATION_CONNECTION_LOST' });
}

// adapter.request(action, payload) must authenticate server-side; no inventory is
// sent. subscribe delivers monotonically versioned server snapshots and reports
// connection failure through onError. No browser-host/WebRTC fallback is used.
export function configureAXEServiceStationAuthority(adapter) {
  const registration = ++configurationEpoch;
  sessionEpoch++; transportEpoch++; transportFailed = false;
  try { stopAuthority?.(); } catch { /* The old stream is already invalidated. */ }
  stopAuthority = null;
  authority = adapter?.request && adapter?.subscribe ? adapter : null;
  authorityVersion = -1; stations = []; activeStationId = null;
  mode = authority ? 'unavailable' : runtime ? 'personal' : 'unavailable';
  runtime?.sync(stations);
  if (authority) {
    const currentAuthority = authority, transport = transportEpoch;
    try {
      stopAuthority = authority.subscribe(snapshot => {
        if (authority === currentAuthority && transport === transportEpoch) applyAuthority(snapshot);
      }, () => failAuthority(currentAuthority, transport));
    } catch { failAuthority(currentAuthority, transport); }
  }
  emit();
  return () => { if (authority === adapter && registration === configurationEpoch) configureAXEServiceStationAuthority(null); };
}

export function mountAXEServiceStationRuntime(nextRuntime) {
  runtime = nextRuntime; mode = authority ? mode : 'personal'; runtime.sync(stations); emit();
  return () => {
    if (runtime !== nextRuntime) return;
    leaveAXEServiceStation(); runtime = null; stations = []; preview = null; mode = 'unavailable'; emit();
  };
}

async function authorityRequest(action, payload = {}) {
  const adapter = authority;
  const epoch = sessionEpoch, transport = transportEpoch;
  if (!adapter) return unavailable('STATION_AUTHORITY_UNAVAILABLE');
  if (transportFailed) return unavailable('STATION_CONNECTION_LOST');
  try {
    const response = await adapter.request(action, { ...payload, requestId: `station-${Date.now()}-${++requestNumber}` });
    if (adapter !== authority || transport !== transportEpoch || epoch !== sessionEpoch && action !== 'leave') return unavailable('STATION_SESSION_CHANGED');
    if (!response?.ok) return unavailable(response?.reason || 'STATION_REQUEST_REJECTED');
    if (!Number.isFinite(response.version) || !Array.isArray(response.stations)) return unavailable('INVALID_STATION_RESPONSE');
    // A subscription may have delivered vN+1 before the request's vN ack.
    // Use the newer current state without rolling it back or rejecting the ack.
    if (response.version >= authorityVersion && !applyAuthority(response)) return unavailable('INVALID_STATION_RESPONSE');
    const station = action === 'leave' ? null : stations.find(s => s.id === response.stationId);
    if (action !== 'leave' && !station) return unavailable('STATION_NOT_FOUND');
    if (station && action !== 'heartbeat') activeStationId = station.id;
    emit(); return { ok: true, station, shared: true };
  } catch {
    if (adapter !== authority || transport !== transportEpoch || epoch !== sessionEpoch) return unavailable('STATION_SESSION_CHANGED');
    failAuthority(adapter, transport);
    return unavailable('STATION_CONNECTION_LOST');
  }
}

function queueStationOperation(operation) {
  const epoch = ++sessionEpoch;
  const task = operationQueue.catch(() => {}).then(() => epoch === sessionEpoch ? operation() : unavailable('STATION_SESSION_CHANGED'));
  operationQueue = task; return task;
}

export function summonAXEServiceStation(groupId) { return queueStationOperation(() => summonStation(groupId)); }
async function summonStation(groupId) {
  if (!AXE_STATION_GROUPS[groupId]) return unavailable('UNKNOWN_STATION_GROUP');
  if (!runtime) return unavailable('WORLD_NOT_READY');
  const context = runtime.context();
  if (!context.allowed) return unavailable(context.reason || 'SERVICE_UNAVAILABLE_HERE');
  const compatible = stations.find(s => s.region === context.region && s.groupId === groupId && stationDistance(s.position, context.player) <= AXE_STATION_CONFIG.reuseRadius && (s.users?.length || 0) < AXE_STATION_CONFIG.capacity);
  if (compatible) {
    if (stationDistance(compatible.position, context.player) > AXE_STATION_CONFIG.interactionRange) return { ...unavailable('APPROACH_EXISTING_STATION'), station: compatible };
    return enterStation(compatible.id);
  }
  const position = runtime.findPlacement(stations);
  if (!position) return unavailable('NO_SAFE_PLACEMENT');
  if (authority) {
    return authorityRequest('summon', { groupId, position, region: context.region });
  }
  const now = Date.now();
  if (now - lastSummon < AXE_STATION_CONFIG.summonCooldownMs) return unavailable('SUMMON_COOLDOWN');
  const local = stations.filter(s => s.region === context.region && stationDistance(s.position, context.player) < AXE_STATION_CONFIG.regionalRadius);
  if (local.length >= AXE_STATION_CONFIG.regionalCap || local.filter(s => s.groupId === groupId).length >= AXE_STATION_CONFIG.perGroupCap) return unavailable('REGIONAL_STATION_LIMIT');
  const station = { id: `personal-${now}-${++requestNumber}`, groupId, region: context.region, position, caretakerId: 'local-player', users: [], createdAt: now, lastOccupiedAt: now };
  stations = [...stations, station]; lastSummon = now; runtime.sync(stations);
  return enterStation(station.id);
}

export function enterAXEServiceStation(id) { return queueStationOperation(() => enterStation(id)); }
async function enterStation(id) {
  const station = stations.find(s => s.id === id), context = runtime?.context();
  if (!station || !context) return unavailable('STATION_NOT_FOUND');
  if (!context.allowed) return unavailable(context.reason || 'SERVICE_UNAVAILABLE_HERE');
  if (station.region !== context.region || stationDistance(context.player, station.position) > AXE_STATION_CONFIG.interactionRange) return unavailable('STATION_TOO_FAR');
  if (authority) return authorityRequest('enter', { stationId: id });
  if (activeStationId) stations.find(s => s.id === activeStationId)?.users.splice(0);
  activeStationId = id; station.users = ['local-player']; station.lastOccupiedAt = Date.now();
  preview = null; runtime?.setPreview(null); emit();
  return { ok: true, station, shared: false };
}

export function leaveAXEServiceStation(id = activeStationId) {
  const previous = id;
  const clearsCurrent = !id || id === activeStationId;
  if (clearsCurrent) { sessionEpoch++; activeStationId = null; preview = null; rotation = 0; }
  const station = stations.find(s => s.id === previous);
  if (station && !authority) { station.users = []; station.lastOccupiedAt = Date.now(); }
  if (clearsCurrent) runtime?.setPreview(null);
  if (authority && previous) void authorityRequest('leave', { stationId: previous });
  emit();
}
export function setAXEStationPreview(item) { preview = item || null; rotation = 0; runtime?.setPreview(preview); }
export function setAXEStationPreviewRotation(angle) { rotation = Number.isFinite(angle) ? angle : rotation; runtime?.setPreviewRotation(rotation); }
export function playAXEStationTransaction(result) { if (result?.ok) runtime?.playTransaction(activeStationId); }

export function tickAXEServiceStationLifecycle(now = Date.now()) {
  if (!runtime) return;
  const context = runtime.context();
  const active = stations.find(s => s.id === activeStationId);
  if (active && (!context.allowed || active.region !== context.region || stationDistance(context.player, active.position) > AXE_STATION_CONFIG.interactionRange)) {
    leaveAXEServiceStation(); event('axeServiceStationUnavailable', { reason: context.reason || 'STATION_TOO_FAR' });
  }
  if (authority) {
    if (activeStationId && now - lastHeartbeat >= AXE_STATION_CONFIG.heartbeatMs) {
      lastHeartbeat = now; void authorityRequest('heartbeat', { stationId: activeStationId });
    }
    return;
  }
  for (const station of stations) if (stationDistance(context.player, station.position) <= AXE_STATION_CONFIG.presenceRadius || station.id === activeStationId) station.lastOccupiedAt = now;
  const retained = stations.filter(s => s.region === context.region && now - s.lastOccupiedAt < AXE_STATION_CONFIG.idleTimeoutMs);
  if (retained.length !== stations.length) { stations = retained; runtime.sync(stations); emit(); }
}

export function requestAXEStationInteraction(station) {
  event('axeWorldServiceRequested', { groupId: station.groupId, stationId: station.id, serviceId: AXE_STATION_GROUPS[station.groupId]?.serviceId });
}
