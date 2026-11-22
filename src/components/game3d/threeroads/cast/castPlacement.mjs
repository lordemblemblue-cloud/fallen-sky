// Where a person of the cast can stand. Pure: no three.js, no DOM, so node can test it.
//
// A `home` in the cast table is an intention. The search walks out from it in rings
// (every 0.75 m, up to 6 m) and takes the first spot that
//   1. is not inside anything the town's layout files name (the fountain basin, the
//      ancient tree, the four shops, the eight houses and the trees beside them, the
//      four plaza gateways, the five archers' own spots) or the Silverrun river,
//   2. has ground under it, flat enough to stand on (a step of 0.3 m or more within
//      half a metre means a wall foot, a floor edge or a bank),
//   3. passes the scene probe the caller gives (horizontal and downward rays against
//      what is actually drawn: walls, trunks, crates, water surfaces).
// Every position here is WORLD metres (world z = local z + 70); the town plaza's
// group sits at world (0, 0), so the plaza's own coordinates are world coordinates.
import {
  WOLFVEIL_IMPORTED_TOWN_TREE,
  WOLFVEIL_TOWN_QUEST_NPC_SPOTS,
} from '../../wolfveil/WolfveilImportedTownLayout.mjs';
import { WOLFVEIL_RIVER, wolfveilDistanceToRiver } from '../../wolfveil/WolfveilLayout.js';
import { THREE_ROADS_Z_OFFSET } from '../coords.mjs';

export const CAST_SEARCH_RADIUS = 6;
export const CAST_SEARCH_STEP = 0.75;
export const CAST_FOOT_RADIUS = 0.5;
export const CAST_MAX_STEP = 0.3;
// Keep this far from the river's edge (its centre line is WOLFVEIL_RIVER.width wide).
export const CAST_RIVER_MARGIN = 3;

// The plaza's fountain basin collider (AXETownPlaza.js collisionZones, and the
// radius WolfveilArtisanTownScene.mjs hands the town navigation).
export const TOWN_FOUNTAIN = Object.freeze({ x: 0, z: 0, radius: 6.55 });

// The four shops (AXETownPlaza.js build*Shop/Residence: position, rotation.y, scale
// 0.75) and their wall rectangle in the shop's own metres
// (WolfveilTownInteriorNavigation.mjs SHOP_WALLS), with a little porch room.
const SHOP_RECT = Object.freeze({ minX: -9.4, maxX: 8.4, minZ: -5.4, maxZ: 4.6 });
const SHOPS = Object.freeze([
  { id: 'blacksmith', x: -15.5, z: -15.5, yaw: Math.PI * 0.25 },
  { id: 'tailor', x: 15.5, z: -15.5, yaw: -Math.PI * 0.25 },
  { id: 'potion', x: 15.5, z: 15.5, yaw: -Math.PI * 0.75 },
  { id: 'models', x: -15.5, z: 15.5, yaw: Math.PI * 0.75 },
]);
// The eight houses on the outer ring (AXETownPlaza.js: radius 42.5, angle
// h/8 * 2pi + pi/8, rotation.y = -angle - pi/2): walls +-4.46 by +-2.92, roof
// 9.8 by 6.8, front pillars at z 3.25; a tree each side at (+-5.8, 1.2).
const HOUSE_RECT = Object.freeze({ minX: -4.95, maxX: 4.95, minZ: -3.45, maxZ: 3.6 });
const HOUSE_RING = 42.5;
const HOUSE_COUNT = 8;
// The four radial walkways end in a gateway of two columns at +-2.3 m, 33 m out.
const GATE_DISTANCE = 33;
const GATE_COLUMN_OFFSET = 2.3;

const rotateToWorld = (yaw, lx, lz) => ({
  x: lx * Math.cos(yaw) + lz * Math.sin(yaw),
  z: -lx * Math.sin(yaw) + lz * Math.cos(yaw),
});

/** Everything solid the town's layout files name, as circles and turned rectangles (world metres). */
export function townObstacles() {
  const list = [];
  list.push({ kind: 'circle', id: 'fountain', x: TOWN_FOUNTAIN.x, z: TOWN_FOUNTAIN.z, radius: TOWN_FOUNTAIN.radius });
  list.push({ kind: 'circle', id: 'ancient-tree', x: WOLFVEIL_IMPORTED_TOWN_TREE.x, z: WOLFVEIL_IMPORTED_TOWN_TREE.z,
    radius: WOLFVEIL_IMPORTED_TOWN_TREE.radius });
  for (const shop of SHOPS) list.push({ kind: 'rect', id: 'shop-' + shop.id, x: shop.x, z: shop.z, yaw: shop.yaw, scale: 0.75, ...SHOP_RECT });
  for (let h = 0; h < HOUSE_COUNT; h++) {
    const angle = (h / HOUSE_COUNT) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * HOUSE_RING;
    const z = Math.sin(angle) * HOUSE_RING;
    const yaw = -angle - Math.PI / 2;
    list.push({ kind: 'rect', id: 'residence-' + (h + 1), x, z, yaw, scale: 1, ...HOUSE_RECT });
    for (const side of [-1, 1]) {
      const p = rotateToWorld(yaw, side * 5.8, 1.2);
      list.push({ kind: 'circle', id: 'residence-' + (h + 1) + '-tree', x: x + p.x, z: z + p.z, radius: 1.0 });
    }
  }
  for (let a = 0; a < 4; a++) {
    const yaw = (a * Math.PI) / 2;
    for (const side of [-1, 1]) {
      const p = rotateToWorld(yaw, side * GATE_COLUMN_OFFSET, GATE_DISTANCE);
      list.push({ kind: 'circle', id: 'gateway-' + a, x: p.x, z: p.z, radius: 0.75 });
    }
  }
  // The five archers of the Fountain Watch stand here; do not stand in them.
  for (const [id, spot] of Object.entries(WOLFVEIL_TOWN_QUEST_NPC_SPOTS))
    list.push({ kind: 'circle', id: 'quest-giver-' + id, x: spot.x, z: spot.z, radius: 1.2 });
  return list;
}

/** True when a body of `radius` at (x, z) overlaps the obstacle. */
export function obstacleHit(obstacle, x, z, radius = CAST_FOOT_RADIUS) {
  if (obstacle.kind === 'circle')
    return Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + radius;
  // Into the rectangle's own frame (the inverse of three.js rotation.y), then its scale.
  const dx = x - obstacle.x, dz = z - obstacle.z;
  const c = Math.cos(obstacle.yaw), s = Math.sin(obstacle.yaw);
  const scale = obstacle.scale || 1;
  const lx = (c * dx - s * dz) / scale;
  const lz = (s * dx + c * dz) / scale;
  const r = radius / scale;
  return lx > obstacle.minX - r && lx < obstacle.maxX + r && lz > obstacle.minZ - r && lz < obstacle.maxZ + r;
}

/** In or too near the Silverrun (world metres in, the river is drawn in local metres). */
export function inRiver(x, z, margin = CAST_RIVER_MARGIN) {
  return wolfveilDistanceToRiver(x, z - THREE_ROADS_Z_OFFSET) < WOLFVEIL_RIVER.width / 2 + margin;
}

/** A blocked(x, z) test over a list of obstacles and the river. */
export function makeBlockedTest(obstacles = townObstacles(), { radius = CAST_FOOT_RADIUS, river = true } = {}) {
  return (x, z) => {
    if (river && inRiver(x, z)) return true;
    for (const obstacle of obstacles) if (obstacleHit(obstacle, x, z, radius)) return true;
    return false;
  };
}

/** The candidate points, nearest first: the home itself, then rings every `step` metres. */
export function standingCandidates(x, z, { maxRadius = CAST_SEARCH_RADIUS, step = CAST_SEARCH_STEP } = {}) {
  const out = [{ x, z, distance: 0 }];
  for (let ring = step; ring <= maxRadius + 1e-6; ring += step) {
    const count = Math.max(6, Math.ceil((2 * Math.PI * ring) / step));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      out.push({ x: x + Math.sin(a) * ring, z: z + Math.cos(a) * ring, distance: ring });
    }
  }
  return out;
}

const FLAT_OFFSETS = Object.freeze([[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]);

/**
 * Finds clear, flat ground within maxRadius of (x, z).
 *   groundY(x, z)   height of the loaded ground, or null where none has loaded
 *   isBlocked(x, z) the layout test (makeBlockedTest)
 *   probe(x, y, z)  optional: true when nothing drawn is in the way
 * Returns { status, x, z, y, distance }:
 *   'found'     a clear spot
 *   'fallback'  ground and layout are clear but the probe refused every spot: the
 *               nearest spot the layout allows (reported, so it can be looked at)
 *   'no-ground' no ground under any candidate yet: ask again later
 *   'blocked'   ground exists but every spot is inside something named
 */
export function findStandingSpot({ x, z }, {
  groundY, isBlocked = () => false, probe = null,
  maxRadius = CAST_SEARCH_RADIUS, step = CAST_SEARCH_STEP, maxStep = CAST_MAX_STEP,
} = {}) {
  let sawGround = false;
  let fallback = null;
  for (const c of standingCandidates(x, z, { maxRadius, step })) {
    const y = groundY(c.x, c.z);
    if (!Number.isFinite(y)) continue;
    sawGround = true;
    if (isBlocked(c.x, c.z)) continue;
    let flat = true;
    for (const [ox, oz] of FLAT_OFFSETS) {
      const near = groundY(c.x + ox, c.z + oz);
      if (!Number.isFinite(near) || Math.abs(near - y) >= maxStep) { flat = false; break; }
    }
    if (!flat) continue;
    if (probe && !probe(c.x, y, c.z)) {
      if (!fallback) fallback = { status: 'fallback', x: c.x, z: c.z, y, distance: c.distance };
      continue;
    }
    return { status: 'found', x: c.x, z: c.z, y, distance: c.distance };
  }
  if (fallback) return fallback;
  return { status: sawGround ? 'blocked' : 'no-ground', x, z, y: null, distance: 0 };
}

/** Pushes a destination out of whatever named obstacle it lies in (fountain centre -> its rim). */
export function clearDestination(x, z, obstacles = townObstacles(), radius = CAST_FOOT_RADIUS) {
  for (const o of obstacles) {
    if (o.kind !== 'circle' || !obstacleHit(o, x, z, radius)) continue;
    const d = Math.hypot(x - o.x, z - o.z);
    const ux = d > 1e-6 ? (x - o.x) / d : 0, uz = d > 1e-6 ? (z - o.z) / d : -1;
    const reach = o.radius + radius + 0.15;
    return { x: o.x + ux * reach, z: o.z + uz * reach, moved: true };
  }
  return { x, z, moved: false };
}
