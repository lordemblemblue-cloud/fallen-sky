// Character-scoped, portable last-world-location record. This is a browser
// checkpoint, NOT movement authority. Live servers must still validate a spawn.
export const WORLD_CHECKPOINT_REGIONS = Object.freeze([
  'wolfveil', 'forest', 'lunar-cave', 'astral-dungeon',
]);
const REGION_SET = new Set(WORLD_CHECKPOINT_REGIONS);
const MAX_XZ = 20000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function normalizeWorldCheckpoint(raw) {
  if (!raw || raw.version !== 1 || !REGION_SET.has(raw.region)) return null;
  const { x, y, z, yaw } = raw;
  if (![x, y, z, yaw].every(finite) ||
      Math.abs(x) > MAX_XZ || Math.abs(z) > MAX_XZ ||
      y < -1000 || y > 10000 || Math.abs(yaw) > 1e6) return null;
  const savedAt = Number(raw.savedAt);
  if (!Number.isSafeInteger(savedAt) || savedAt < 0) return null;
  return { version: 1, region: raw.region, x, y, z, yaw, savedAt };
}

export function createWorldCheckpointStore(storage, now = () => Date.now()) {
  return {
    read() {
      try {
        const raw = storage.get();
        return raw === null ? null : normalizeWorldCheckpoint(JSON.parse(raw));
      } catch { return null; }
    },
    save(location) {
      const checkpoint = normalizeWorldCheckpoint({ ...location, version: 1, savedAt: now() });
      if (!checkpoint) return false;
      return storage.setChecked(JSON.stringify(checkpoint)) === true;
    },
  };
}
