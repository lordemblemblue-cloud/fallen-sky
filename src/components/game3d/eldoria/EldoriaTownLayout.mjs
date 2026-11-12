/**
 * Eldoria: authored *separate* town instance based on the owner's isometric
 * reference. Coordinates are world metres (x east, z south).
 *
 * This module is pure game-space data: no Game 3D Wolfveil tiles, no economy,
 * no player positions, no NPC authority, no persistent saves.
 */
const point = (x, z) => Object.freeze({ x, z });
const building = (id, label, x, z, width, depth, floors = 1, kind = 'shop') =>
  Object.freeze({ id, label, x, z, width, depth, floors, kind });
const stall = (id, x, z, accent) =>
  Object.freeze({ id, x, z, width: 5, depth: 4.3, accent });

export const ELDORIA_TOWN = Object.freeze({
  id: 'eldoria-town-square',
  label: "Eldoria Town Square — Adventurer's Hub",
  visualStyle: 'grounded-anime-sumi-e',
  width: 190,
  depth: 150,
  spawn: point(0, 56),
  groundY: 0,
  cameraStartYaw: Math.PI,
  buildings: Object.freeze([
    building('apothecary', 'Apothecary & Elixirs', -64, -38, 26, 19, 1, 'apothecary'),
    building('guild-hall', 'Guild Master', 61, -48, 31, 23, 2, 'guild'),
    building('variety-trader', 'Variety Trader', 19, -23, 25, 18, 1, 'trader'),
    building('southwest-inn', 'Pilgrim Inn', -65, 36, 24, 18, 1, 'inn'),
    building('east-forge', 'Eastern Workshop', 57, 37, 27, 18, 1, 'forge'),
    building('south-cottage', 'Town Cottages', 19, 58, 24, 14, 1, 'residence'),
    building('west-cottage', 'Pilgrim House', -31, 61, 22, 14, 1, 'residence'),
    building('northern-pavilion', 'Prayer Pavilion', -18, -54, 19, 12, 1, 'shrine'),
  ]),
  stalls: Object.freeze([
    stall('cloth-trader', -13, 12, '#c5b49c'),
    stall('pottery-trader', 2, 13, '#9eaaab'),
    stall('produce-trader', 16, 23, '#c79781'),
    stall('caravan-trader', -3, 30, '#bca99e'),
  ]),
  roads: Object.freeze([
    // Open, playable paths; no fake collision floors.
    { id: 'main-north-south', x: -8, z: 0, width: 9, depth: 140 },
    { id: 'central-east-west', x: 0, z: 5, width: 158, depth: 8 },
    { id: 'guild-approach', x: 54, z: -14, width: 8, depth: 45 },
    { id: 'west-approach', x: -48, z: 1, width: 8, depth: 68 },
    { id: 'southeast-path', x: 41, z: 43, width: 8, depth: 58 },
  ]),
  torii: Object.freeze([point(-24, -6), point(-39, 19)]),
  trees: Object.freeze([
    { ...point(-84, -58), kind: 'pine', size: 1.25 },
    { ...point(-85, 10), kind: 'pine', size: 1.05 },
    { ...point(-86, 62), kind: 'cherry', size: 1.15 },
    { ...point(-40, -30), kind: 'pine', size: 1.1 },
    { ...point(-6, -48), kind: 'cherry', size: 1.1 },
    { ...point(36, -50), kind: 'pine', size: 1.0 },
    { ...point(39, 3), kind: 'cherry', size: 1.25 },
    { ...point(-43, 42), kind: 'cherry', size: 1.0 },
    { ...point(73, 60), kind: 'pine', size: .95 },
    { ...point(84, -18), kind: 'pine', size: 1.1 },
  ]),
  landmarks: Object.freeze([
    { id: 'apothecary', label: 'Apothecary & Elixirs', position: point(-64, -23), message: 'Herbs, tonics and healing remedies — merchant integration pending.' },
    { id: 'guild', label: 'Guild Master', position: point(61, -32), message: 'Adventurer registration and guild quests — server integration pending.' },
    { id: 'variety', label: 'Variety Trader', position: point(19, -10), message: 'Trade goods and travelling supplies — merchant integration pending.' },
    { id: 'market', label: 'Player Trade Square', position: point(-3, 3), message: 'A shared bazaar for player stalls and bartering — trading integration pending.' },
    { id: 'shrine', label: 'Town Shrine', position: point(-24, 2), message: 'A peaceful shrine beneath the red torii.' },
    { id: 'inn', label: 'Pilgrim Inn', position: point(-65, 24), message: 'A resting place for travellers — room access pending.' },
    { id: 'workshop', label: 'Eastern Workshop', position: point(57, 25), message: 'Forging and repairs — Blacksmith service integration pending.' },
  ]),
  residentRoutes: Object.freeze([
    [point(-34, 11), point(-22, 5), point(-7, 3), point(3, 5), point(-9, 3)],
    [point(34, 8), point(29, 2), point(20, -5), point(9, 4), point(25, 15)],
    [point(-9, 40), point(-19, 29), point(-27, 20), point(-29, 14)],
    [point(43, -29), point(36, -18), point(37, -3), point(48, 9)],
    [point(-68, 10), point(-58, 15), point(-49, 8), point(-53, -6)],
    [point(6, 43), point(24, 44), point(30, 32), point(25, 18)],
    [point(-8, -22), point(-15, -30), point(-28, -25), point(-35, -9)],
    [point(58, 14), point(47, 10), point(33, 12), point(24, 19)],
  ]),
});

/** Objects with bodies block walking. Decorative grass, torii and flags do not. */
export const ELDORIA_SOLID_RECTS = Object.freeze([
  ...ELDORIA_TOWN.buildings.map(b => Object.freeze({
    id: b.id, minX: b.x - b.width / 2, maxX: b.x + b.width / 2,
    minZ: b.z - b.depth / 2, maxZ: b.z + b.depth / 2,
  })),
  ...ELDORIA_TOWN.stalls.map(b => Object.freeze({
    id: b.id, minX: b.x - b.width / 2, maxX: b.x + b.width / 2,
    minZ: b.z - b.depth / 2, maxZ: b.z + b.depth / 2,
  })),
]);

// Tree trunks and each torii leg are real solids; the open torii center
// remains traversable. Grass, blossoms and hand-height stones are decorative.
export const ELDORIA_TRUNK_COLLIDERS = Object.freeze([
  ...ELDORIA_TOWN.trees.map((tree, index) => Object.freeze({
    id: 'tree-' + index, x: tree.x, z: tree.z, radius: .72 * tree.size,
  })),
  ...ELDORIA_TOWN.torii.flatMap((gate, index) => [-3.2, 3.2].map((offset, side) =>
    Object.freeze({ id: 'torii-' + index + '-' + side,
      x: gate.x + offset, z: gate.z, radius: .46 }))),
]);

export function eldoriaRiverCenterX(z) {
  return 82 + 2.7 * Math.sin(z * .053 + .6);
}
export function eldoriaRiverContains(x, z, margin = 0) {
  return z >= 13 && Math.abs(x - eldoriaRiverCenterX(z)) < 5.8 + margin;
}

/**
 * Radius-aware collision. Applied axis-by-axis in the preview to slide along
 * walls rather than teleport through corners. Actual MMORPG authority must
 * separately validate movement against its authoritative map representation.
 */
export function canWalkEldoria(x, z, radius = .55) {
  if (![x, z, radius].every(Number.isFinite) || radius < 0) return false;
  if (Math.abs(x) > ELDORIA_TOWN.width / 2 - radius - 1.2) return false;
  if (Math.abs(z) > ELDORIA_TOWN.depth / 2 - radius - 1.2) return false;
  if (eldoriaRiverContains(x, z, radius)) return false;
  if (ELDORIA_TRUNK_COLLIDERS.some(solid =>
    Math.hypot(x - solid.x, z - solid.z) < radius + solid.radius)) return false;
  return !ELDORIA_SOLID_RECTS.some(rect =>
    x + radius > rect.minX && x - radius < rect.maxX &&
    z + radius > rect.minZ && z - radius < rect.maxZ);
}

export function nearestEldoriaLandmark(x, z, maxDistance = 8) {
  if (![x, z, maxDistance].every(Number.isFinite) || maxDistance < 0) return null;
  let nearest = null;
  let dist2 = maxDistance * maxDistance;
  for (const item of ELDORIA_TOWN.landmarks) {
    const d = (item.position.x - x) ** 2 + (item.position.z - z) ** 2;
    if (d <= dist2) { dist2 = d; nearest = item; }
  }
  return nearest;
}