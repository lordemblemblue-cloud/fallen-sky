// Discover-as-explored memory for the Wolfveil underground map.
// Purely presentational: it never unlocks a route, grants loot or changes
// collision. Every room is charted up front and revealed once walked into.
import { UNDERGROUND_ROOMS } from './undergroundMapModel.mjs';

const STORAGE_KEY = 'wolfveil.underground.rooms';
const listeners = new Set();
let rooms = null;

const store = () => {
  if (rooms) return rooms;
  rooms = new Set();
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (raw) JSON.parse(raw).forEach(id => rooms.add(String(id)));
  } catch {
    rooms = new Set();
  }
  return rooms;
};

const persist = () => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...store()]));
    }
  } catch {
    // A blocked storage write only costs persistence, never exploration.
  }
};

const notify = () => {
  const list = [...store()];
  listeners.forEach(fn => fn(list));
};

export function getDiscoveredRooms() {
  return [...store()];
}

export function subscribeDiscoveredRooms(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener([...store()]);
  return () => listeners.delete(listener);
}

export function revealRoom(id) {
  const set = store();
  if (!id || set.has(id)) return false;
  set.add(id);
  persist();
  notify();
  return true;
}

export function revealRoomsNear(x, z, radius = 22) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  for (const room of UNDERGROUND_ROOMS) {
    if (Math.hypot(room.x - x, room.z - z) <= radius + room.radius * 0.35) {
      revealRoom(room.id);
    }
  }
}