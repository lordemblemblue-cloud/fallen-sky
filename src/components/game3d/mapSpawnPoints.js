// ─── World Spawn Points & Respawn Resolution ─────────────────────────────
// Valid spawn / checkpoint locations for the 3D world. This is WORLD data
// (per map), not save data. The player's *chosen* checkpoint lives in their
// own per-user, per-character save slot (see checkpointSave below).

import { characterScopedStorage } from '@/components/game3d/characterStorage';

export const MAP_ID = 'world_3d';

export const MAP_SPAWN_POINTS = [
  { id: 'spawn_main',    label: 'Town Plaza',   x: -12,   z: 12,   default: true },
  { id: 'spawn_north',   label: 'North Ridge',  x: 6,   z: -22 },
  { id: 'spawn_forest',  label: 'Forest Edge',  x: 58,  z: -10 },
  { id: 'spawn_ruins',   label: 'Old Ruins',    x: -26, z: 18 },
  // Every point below was sampled against the imported town's baked collision:
  // reachable on foot from the plaza, at least 2m of open ground around the
  // landing, and no closer than 10m to another point.
  { id: 'spawn_plaza_east', label: 'Town East', x: 16, z: 8 },
  { id: 'spawn_plaza_west', label: 'Town West', x: -30, z: 8 },
  { id: 'spawn_north_approach', label: 'Ridge Approach', x: -12, z: -56 },
  { id: 'spawn_forest_path', label: 'Forest Path', x: 44, z: -16 },
  { id: 'spawn_ruins_path', label: 'Ruins Approach', x: -32, z: 26 },
];

const store = characterScopedStorage('wwm_checkpoint_v1');

/** The checkpoint this character last activated (per user + character). */
export function getSavedCheckpointId() {
  try { return store.get() || null; } catch { return null; }
}

export function saveCheckpointId(id) {
  if (!id) return;
  store.set(id);
}

export function getSpawnPointById(id) {
  return MAP_SPAWN_POINTS.find((p) => p.id === id) || null;
}

/** Default map spawn — used only when the save has no valid checkpoint. */
export function getDefaultSpawnPoint() {
  return MAP_SPAWN_POINTS.find((p) => p.default) || MAP_SPAWN_POINTS[0];
}

/**
 * Resolve where this character respawns: their saved checkpoint if it is
 * still a valid point on this map, else the map's default spawn.
 */
export function getRespawnPoint(checkpointId = getSavedCheckpointId()) {
  return getSpawnPointById(checkpointId) || getDefaultSpawnPoint();
}