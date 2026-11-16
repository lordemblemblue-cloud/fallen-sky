// Pure deterministic geography for the streamed Wolfveil meadow.
// Layout coordinates are unshifted: the Game 3D scene adds +70m Z.
// Never replace the authoritative 1,100m Wolfveil terrain or server movement.
import { wolfveilHeight, wolfveilLandscapeLiftAt, WOLFVEIL_SITES } from './WolfveilLayout.js';

export const WOLFVEIL_MEADOW_FIELD = Object.freeze({
  radiusMeters: 4 * 1609.344,
  centerX: WOLFVEIL_SITES.market.x,
  centerZ: WOLFVEIL_SITES.market.z,
  coreHalfSpan: 550,
  terrainTileMeters: 275, // exact multiple of 550 to meet old terrain edges
  grassTileMeters: 48,
  terrainTileRadius: 8, // visual horizon around the player (streamed)
  terrainNearTileRadius: 4, // only near tiles enter collision/raycast registry
  grassTileRadius: 3,
  terrainSegments: 32,
  farTerrainSegments: 8,
  nearClumps: 2550,
  midClumps: 820,
  farClumps: 160,
});

export const clampMeadow = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (t) => {
  const s = clampMeadow(t, 0, 1);
  return s * s * (3 - 2 * s);
};

export function isInsideMeadowCircle(x, z, radius = WOLFVEIL_MEADOW_FIELD.radiusMeters) {
  if (![x, z, radius].every(Number.isFinite) || radius <= 0) return false;
  return Math.hypot(x - WOLFVEIL_MEADOW_FIELD.centerX, z - WOLFVEIL_MEADOW_FIELD.centerZ) <= radius;
}

export function insideOriginalWolfveilGround(x, z) {
  return Number.isFinite(x) && Number.isFinite(z) &&
    Math.abs(x) <= WOLFVEIL_MEADOW_FIELD.coreHalfSpan &&
    Math.abs(z) <= WOLFVEIL_MEADOW_FIELD.coreHalfSpan;
}

const EDGE_CACHE = new Map();
function meadowEdgeBase(edgeX, edgeZ) {
  const key = Math.round(edgeX * 100) + ':' + Math.round(edgeZ * 100);
  let value = EDGE_CACHE.get(key);
  if (value === undefined) {
    value = wolfveilHeight(edgeX, edgeZ) - wolfveilLandscapeLiftAt(edgeX, edgeZ);
    if (EDGE_CACHE.size > 20000) EDGE_CACHE.clear();
    EDGE_CACHE.set(key, value);
  }
  return value;
}

export function meadowGroundHeight(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // Inside the old terrain use the exact same authored height. Do not invent
  // competing floors at house, river, path, cave or sanctuary coordinates.
  if (insideOriginalWolfveilGround(x, z)) return wolfveilHeight(x, z);
  const half = WOLFVEIL_MEADOW_FIELD.coreHalfSpan;
  const edgeX = clampMeadow(x, -half, half);
  const edgeZ = clampMeadow(z, -half, half);
  // The boundary mountain ranges straddle the 1,100m edge. Remove their lift
  // from the edge sample and re-add the lift at THIS point, so the ranges and
  // the distant snow skyline continue seamlessly beyond the playable core.
  const base = meadowEdgeBase(edgeX, edgeZ);
  const outside = Math.max(Math.abs(x) - half, Math.abs(z) - half, 0);
  // C1-continuous transition from the old authored terrain into rolling
  // grassland and lower wetland, rather than a floating horizontal plane.
  const blend = smooth(outside / 750);
  const wave = 3.4 * Math.sin(x * .0047 + z * .0024) +
    2.1 * Math.cos(z * .0061 - x * .0037) +
    1.2 * Math.sin(z * .016 + x * .012);
  return base * (1 - blend) + (13 + wave) * blend + wolfveilLandscapeLiftAt(x, z);
}

// Streamed tiles that contain mountains need more vertices than flat meadow.
export function meadowTileHasMountains(ix, iz, unit = WOLFVEIL_MEADOW_FIELD.terrainTileMeters) {
  if (!Number.isInteger(ix) || !Number.isInteger(iz)) return false;
  for (let sz = 0; sz <= 4; sz++) for (let sx = 0; sx <= 4; sx++) {
    if (wolfveilLandscapeLiftAt((ix + sx / 4) * unit, (iz + sz / 4) * unit) > 6) return true;
  }
  return false;
}

export function shouldStreamMeadowTerrainTile(ix, iz) {
  const unit = WOLFVEIL_MEADOW_FIELD.terrainTileMeters;
  if (!Number.isInteger(ix) || !Number.isInteger(iz)) return false;
  // The four tiles spanning -550..550 on both axes are already physical,
  // raycastable, textured, BVH-accelerated Game 3D ground.
  if (ix >= -2 && ix <= 1 && iz >= -2 && iz <= 1) return false;
  const left = ix * unit, right = left + unit;
  const bottom = iz * unit, top = bottom + unit;
  const x = clampMeadow(WOLFVEIL_MEADOW_FIELD.centerX, left, right);
  const z = clampMeadow(WOLFVEIL_MEADOW_FIELD.centerZ, bottom, top);
  return isInsideMeadowCircle(x, z);
}

export function meadowGrassTileDensity(ix, iz, focusX, focusZ) {
  const { grassTileMeters: size, nearClumps, midClumps, farClumps } = WOLFVEIL_MEADOW_FIELD;
  const x = (ix + .5) * size, z = (iz + .5) * size;
  if (!isInsideMeadowCircle(x, z)) return 0;
  // No grass through the safe village center, houses, town services or roads.
  const centerX = WOLFVEIL_MEADOW_FIELD.centerX;
  const centerZ = WOLFVEIL_MEADOW_FIELD.centerZ;
  if (Math.abs(x - centerX) < 105 && Math.abs(z - centerZ) < 105) return 0;
  const distance = Math.hypot(x - focusX, z - focusZ);
  return distance < 85 ? nearClumps : distance < 145 ? midClumps : farClumps;
}

export function meadowTileSeed(ix, iz) {
  // Stable across streamed unload/reload and independent of load order.
  return (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x51c0f22) >>> 0;
}

export function meadowRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
