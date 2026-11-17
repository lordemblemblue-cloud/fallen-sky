// Read-only map dots for actors Game 3D is already simulating.
// Not a spawner, not a reward, not server authority.

let snapshot = Object.freeze({ enemies: [], npcs: [], updatedAt: 0 });
const listeners = new Set();

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const actor = (entry, fallbackName) => {
  const x = finite(entry?.x);
  const z = finite(entry?.z);
  if (x === null || z === null || entry?.alive === false) return null;
  return {
    id: String(entry?.id ?? 'unknown').slice(0, 96),
    name: typeof entry?.name === 'string' ? entry.name.slice(0, 80) : fallbackName,
    x, z,
    y: finite(entry?.y),
    level: finite(entry?.level),
    tier: typeof entry?.tier === 'string' ? entry.tier.slice(0, 24) : 'normal',
  };
};

export function getWolfveilLiveMap() { return snapshot; }

export function subscribeWolfveilLiveMap(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function publishWolfveilLiveMap({ enemies = [], npcs = [] } = {}) {
  snapshot = Object.freeze({
    enemies: (Array.isArray(enemies) ? enemies : []).slice(0, 128)
      .map(entry => actor(entry, 'Enemy')).filter(Boolean),
    npcs: (Array.isArray(npcs) ? npcs : []).slice(0, 32)
      .map(entry => actor(entry, 'NPC')).filter(Boolean),
    updatedAt: Date.now(),
  });
  listeners.forEach(fn => fn(snapshot));
  return snapshot;
}

export function clearWolfveilLiveMap() {
  return publishWolfveilLiveMap({ enemies: [], npcs: [] });
}
