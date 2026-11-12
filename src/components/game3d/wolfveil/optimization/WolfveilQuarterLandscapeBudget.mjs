/**
 * Game 3D / canonical Wolfveil — WS15 PREVIEW-ONLY north-east quarter scatter
 * optimizer. This module does NOT mount or edit runtime terrain, server collision,
 * owner-authored trees, routes, bridges, or any claimed landscaping square.
 *
 * All coordinates are unshifted Wolfveil-local. The existing Game 3D +70 m Z
 * translation is applied once by its parent world group, NEVER here.
 */
export const WOLFVEIL_QUARTER_NE = Object.freeze({
  minX: 0, maxX: 550, minZ: 0, maxZ: 550, areaM2: 550 * 550,
  parentWorldOffsetZ: 70, terrainSpan: 1100,
});

const isNumber = Number.isFinite;
const inRect = (p, r) => p.x >= r.minX && p.x < r.maxX &&
  p.z >= r.minZ && p.z < r.maxZ;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Randomness is spatially stable and does not depend on the order of source
// assets. One centimetre quantization is precise enough for seeded clumps.
function mix32(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
function spatialScore(p, seed, kind) {
  const xi = Math.round(p.x * 100), zi = Math.round(p.z * 100);
  const noise = mix32((Math.imul(xi, 73856093) ^
    Math.imul(zi, 19349663) ^ seed ^ kind) >>> 0) / 4294967296;
  // Two gentle field frequencies deliberately retain organic lush pockets.
  // Score is deterministic for the position, not the input array index.
  const field = (Math.sin(p.x * .051 + p.z * .034) +
    Math.cos(p.z * .069 - p.x * .043)) * .25 + .5;
  return .62 * noise + .38 * field;
}
function cellKey(p, bounds, cellSize) {
  return Math.floor((p.x - bounds.minX) / cellSize) + ':' +
    Math.floor((p.z - bounds.minZ) / cellSize);
}
function validRect(r) {
  return r && [r.minX, r.maxX, r.minZ, r.maxZ].every(isNumber) &&
    r.minX < r.maxX && r.minZ < r.maxZ;
}
function locked(p, protectedSquares, buffer) {
  return protectedSquares.some(rect =>
    p.x >= rect.minX - buffer && p.x < rect.maxX + buffer &&
    p.z >= rect.minZ - buffer && p.z < rect.maxZ + buffer);
}
function validFiveMetreSquare(r) {
  return validRect(r) && r.maxX - r.minX === 5 &&
    r.maxZ - r.minZ === 5 &&
    Number.isInteger(r.minX / 5) && Number.isInteger(r.minZ / 5) &&
    r.minX >= WOLFVEIL_QUARTER_NE.minX &&
    r.maxX <= WOLFVEIL_QUARTER_NE.maxX &&
    r.minZ >= WOLFVEIL_QUARTER_NE.minZ &&
    r.maxZ <= WOLFVEIL_QUARTER_NE.maxZ;
}
function squareKey(p) {
  return Math.floor(p.x / 5) + ':' + Math.floor(p.z / 5);
}
function quarterEdgeDistance(p, rect) {
  return Math.min(p.x - rect.minX, rect.maxX - p.x,
    p.z - rect.minZ, rect.maxZ - p.z);
}

/**
 * Build a NON-MUTATING candidate list for WS15/owner review. The returned arrays
 * are NOT applied to canonical Play; turning it on requires explicit approved
 * source integration, signed-in editor QA and a separate ownership audit.
 *
 * grass and smallStones must contain finite local {x,z}; trees and
 * solidRocks are never filtered. protectedSquares contains all active
 * LAND-WS reservations supplied by integration, not inferred from map art.
 * routeClearanceAt(x,z) is a distance OUTSIDE the authored road edge (m).
 */
export function planWolfveilQuarterLandscapeBudget({
  grass = [], smallStones = [], trees = [], solidRocks = [],
  protectedSquares = null, authorizedReviewSquares = [], bounds = WOLFVEIL_QUARTER_NE,
  routeClearanceAt = null,
  riverDistanceAt = null,
  trunkColliders = null,
  seed = 0x51c0f22, cellSize = 25,
  grassRetention = .50, stoneRetention = .50,
  pathClearance = 1.10, waterClearance = .45,
  seamBuffer = 6, protectedSquareBuffer = 2,
} = {}) {
  if (!Array.isArray(protectedSquares))
    throw new RangeError('Explicit protectedSquares survey required before planning');
  if (!Array.isArray(trunkColliders))
    throw new RangeError('Explicit trunk collider survey required before planning');
  if (!Array.isArray(authorizedReviewSquares) ||
      !authorizedReviewSquares.every(validFiveMetreSquare))
    throw new RangeError('Authorized review zones must be aligned 5m squares within NE quarter');
  const authorizedCellKeys = authorizedReviewSquares.map(s =>
    squareKey({x:s.minX,z:s.minZ}));
  if (new Set(authorizedCellKeys).size !== authorizedCellKeys.length)
    throw new RangeError('Duplicate authorized review square');
  const approvedCells = new Set(authorizedCellKeys);
  if (typeof routeClearanceAt !== 'function' || typeof riverDistanceAt !== 'function')
    throw new TypeError('Pass authoritative route/river clearance samplers');
  if (![grass, smallStones, trees, solidRocks, protectedSquares, trunkColliders]
    .every(Array.isArray)) throw new TypeError('Landscape inputs must be arrays');
  if (!validRect(bounds) || !protectedSquares.every(validRect) ||
      bounds.minX < WOLFVEIL_QUARTER_NE.minX || bounds.maxX > WOLFVEIL_QUARTER_NE.maxX ||
      bounds.minZ < WOLFVEIL_QUARTER_NE.minZ || bounds.maxZ > WOLFVEIL_QUARTER_NE.maxZ)
    throw new RangeError('Invalid quarter bounds or protected square');
  if (![grassRetention, stoneRetention].every(v => isNumber(v) && v >= 0 && v <= 1) ||
      !isNumber(cellSize) || cellSize <= 0 || !isNumber(pathClearance) ||
      pathClearance < 0 || !isNumber(waterClearance) || waterClearance < 0 ||
      !isNumber(seamBuffer) || seamBuffer < 0 || seamBuffer > 20 ||
      !isNumber(protectedSquareBuffer) || protectedSquareBuffer < 0 ||
      protectedSquareBuffer > 20)
    throw new RangeError('Invalid visual optimization budget');
  for (const [name, arr] of [['grass', grass], ['stones', smallStones],
    ['trees', trees], ['solidRocks', solidRocks], ['trunks', trunkColliders]]) {
    if (arr.some(p => !p || !isNumber(p.x) || !isNumber(p.z)))
      throw new RangeError(name + ': invalid or unsampled source coordinate');
    if (name === 'trunks' && arr.some(t => !isNumber(t.radius) ||
        t.radius <= 0 || t.radius > 15))
      throw new RangeError('Invalid tree trunk collider radius');
  }
  const trunkBuffers = trunkColliders.map(t => ({
    x: t.x, z: t.z, radius: t.radius,
  }));

  function optimize(input, type, ratio) {
    const untouched = [], buckets = new Map();
    const audit = { total: input.length, inQuarter: 0, locked: 0,
      collisionProtected: 0, unauthorizedSquare: 0, unverifiedProtected: 0,
      pathEdgeProtected: 0, seamProtected: 0, routeCleared: 0, riverCleared: 0,
      trunkCleared: 0, eligible: 0, selected: 0, reduced: 0 };
    for (const source of input) {
      const p = source;
      if (!inRect(p, bounds)) { untouched.push(p); continue; }
      audit.inQuarter++;
      // Author-painted/static-owned details and anything connected to the
      // collider graph are untouchable in a decorative optimization.
      if (locked(p, protectedSquares, protectedSquareBuffer)) {
        audit.locked++; untouched.push(p); continue;
      }
      if (!approvedCells.has(squareKey(p))) {
        audit.unauthorizedSquare++; untouched.push(p); continue;
      }
      if (p.ownerAuthored || p.protected || p.isCollider || p.solid ||
          p.questAnchor || p.interactive) {
        audit.collisionProtected++; untouched.push(p); continue;
      }
      // Never infer that a visually small object is safe to delete.
      // The actual scene integration must explicitly prove BOTH that it is
      // decorative and that it does not participate in collision/raycast.
      // An omitted classification is protected, rather than silently thinned.
      if (p.decorativeOnly !== true || p.nonCollider !== true) {
        audit.unverifiedProtected++; untouched.push(p); continue;
      }
      const road = routeClearanceAt(p.x, p.z);
      const water = riverDistanceAt(p.x, p.z);
      if (!isNumber(road) && road !== Infinity) throw new RangeError('Invalid route sample');
      if ((!isNumber(water) && water !== Infinity) || water < 0)
        throw new RangeError('Invalid river sample');
      // Remove decorations inside the authored dirt/stone path corridor to
      // improve route legibility; NEVER remove the path's own real mesh.
      if (type === 0x53544f4e && road >= 0 && road < pathClearance) {
        // Existing intentionally authored path-border stones define the trail.
        // Keep them, even when reducing redundant stones farther from paths.
        audit.pathEdgeProtected++; untouched.push(p); continue;
      }
      if (road < (type === 0x53544f4e ? 0 : pathClearance)) {
        audit.routeCleared++; continue;
      }
      if (water < waterClearance) { audit.riverCleared++; continue; }
      if (trunkBuffers.some(t => Math.hypot(p.x-t.x,p.z-t.z) < t.radius + .65)) {
        audit.trunkCleared++; continue;
      }
      // Preserve the original scatter near all four quarter boundaries.
      // An abrupt half-density line would reveal the optimization in Play.
      if (quarterEdgeDistance(p, bounds) < seamBuffer) {
        audit.seamProtected++; untouched.push(p); continue;
      }
      audit.eligible++;
      // Never borrow a neighbor square's last grass tuft or small stone to
      // meet a 25m aggregate budget. Each approved 5m square is independent.
      const key = squareKey(p);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }
    // Artist-oriented coherence: neighboring 25m cells form subtle open
    // pockets and richer grass islands rather than every cell getting the
    // same half-density haircut. Subtract the asset-weighted field mean so
    // the global decorative budget still trends toward the requested ratio.
    const cells = [...buckets.entries()].map(([key, assets]) => {
      const [ix, iz] = key.split(':').map(Number);
      const x = (ix + .5) * 5, z = (iz + .5) * 5;
      const fieldX = (Math.floor(x / cellSize) + .5) * cellSize;
      const fieldZ = (Math.floor(z / cellSize) + .5) * cellSize;
      const field = Math.sin(fieldX * .029 + (seed & 255) * .002) *
        Math.cos(fieldZ * .027 - (seed & 255) * .001);
      return {assets, field, x, z};
    });
    const weightedCount = cells.reduce((n, c) => n + c.assets.length, 0);
    const weightedMean = weightedCount
      ? cells.reduce((n, c) => n + c.field * c.assets.length, 0) / weightedCount
      : 0;
    const selected = [];
    for (const cell of cells) {
      const {assets,x,z} = cell;
      const aestheticRatio = clamp(ratio + .16 * (cell.field - weightedMean), 0, 1);
      // Probabilistic rounding is *spatially deterministic*: a 3-tuft tile
      // sometimes retains 1 and sometimes 2, maintaining one independent
      // accent per 5m square without universally rounding upward.
      const quota = assets.length * aestheticRatio;
      const sample = mix32((Math.imul(Math.round(x * 100), 73856093) ^
        Math.imul(Math.round(z * 100), 19349663) ^ seed ^ type) >>> 0) /
        4294967296;
      const kept = Math.max(1, Math.min(assets.length,
        Math.floor(quota) + (sample < quota % 1 ? 1 : 0)));
      const ranked = assets.slice().sort((a, b) =>
        spatialScore(b, seed, type) - spatialScore(a, seed, type) ||
        a.x-b.x || a.z-b.z);
      selected.push(...ranked.slice(0, kept));
    }
    audit.selected = selected.length;
    audit.reduced = audit.routeCleared+audit.riverCleared+
      audit.trunkCleared+audit.eligible-audit.selected;
    return {instances: [...untouched, ...selected], audit};
  }

  const grasses = optimize(grass, 0x67524153, grassRetention);
  const stones = optimize(smallStones, 0x53544f4e, stoneRetention);
  // Preserve original tree and solid-rock references and all collider inputs.
  // Small stepping stones inherit existing noncolliding visual behavior;
  // no claim of physics-certified sit/walk-on boulder behavior is made here.
  const before = grass.length + smallStones.length + trees.length + solidRocks.length;
  const after = grasses.instances.length + stones.instances.length +
    trees.length + solidRocks.length;
  const beforeDecorativeQuarter = grasses.audit.inQuarter + stones.audit.inQuarter;
  const removedQuarter = grasses.audit.reduced + stones.audit.reduced;
  return {
    status: 'SOURCE_PREVIEW_ONLY_NOT_MOUNTED',
    reviewedFiveMetreSquares: approvedCells.size,
    bounds: {...bounds},
    grass: grasses.instances, smallStones: stones.instances,
    trees, solidRocks, trunkColliders,
    stats: {
      grass: grasses.audit, smallStones: stones.audit,
      before, after, totalRemoved: before-after,
      quarterBeforeDecorations: beforeDecorativeQuarter,
      quarterRemovedDecorations: removedQuarter,
      eligibleBefore: grasses.audit.eligible + stones.audit.eligible,
      eligibleRemoved: grasses.audit.eligible + stones.audit.eligible -
        grasses.audit.selected - stones.audit.selected,
      seamBuffer, protectedSquareBuffer,
      independentlyPlayCertifiedSquares: 0,
      quarterDecorationReduction: beforeDecorativeQuarter
        ? removedQuarter/beforeDecorativeQuarter : 0,
      certifiedPlayCoverage: 0, collisionChanged: false,
      ownerApproved: false,
    },
    requires: [
      'WS15 and affected-square owner integration approval',
      'independent Play visual/material + walking/rock/tree collision',
      'full dirt path / bridge / water edge traversal and seam audit',
      'LOD/FPS before-after on target hardware',
      'client/server and two-client parity where applicable',
    ],
  };
}
