import {makeX49Z113VolumetricGrassClump} from './X49Z113VolumetricBlades.mjs';

/**
 * Wolfveil Play — one 5m woodland floor square only.
 * The editor addresses the translated world; placement uses unshifted layout.
 * This module is an unmounted, decorative-only recipe. WS15 owns integration.
 */
export const FOREST_TILE_X49_Z113 = Object.freeze({
  id: 'X49-Z113',
  local: Object.freeze({minX: -305, maxX: -300, minZ: 15, maxZ: 20}),
  world: Object.freeze({minX: -305, maxX: -300, minZ: 85, maxZ: 90}),
  viewerZOffset: 70,
  decorativeOnly: true,
  newTreeColliders: 0,
  maxGrass: 576,
  maxRocks: 3,
});

// Materials must use the same families/names as the existing map-wide
// WolfveilLivingSumiEMaterials decorator. These are PBR *recipes*, not
// an independent shader, a replacement tree, or a claim of GPU validation.
export const FOREST_TILE_X49_Z113_STYLE = Object.freeze({
  reference: 'docs/game3d/WOLFVEIL_LIVING_SUMI_E_MATERIAL_DIRECTION_20261108.md',
  grass: Object.freeze({
    materialName: 'SWV_X49Z113_LivingSumiE_Grass',
    family: 'grass', albedoHex: Object.freeze([
      '#3b704a', '#4b8055', '#67946a', '#83a47b',
    ]),
    roughness: .91, metalness: 0, heightMeters: Object.freeze([.075, .13]),
    strandsPerClump: 9, preserveRoot: true,
    useExistingWind: true, intrinsicInkOnly: true,
    externalGlow: false, crossedBillboards: false, dirtBlades: false,
  }),
  stone: Object.freeze({
    materialName: 'SWV_X49Z113_LivingSumiE_Stone',
    family: 'stone', albedoHex: Object.freeze([
      '#65736d', '#7b8984', '#87948d',
    ]),
    roughness: .96, metalness: 0, mossCoverageMax: .19,
    lowProfile: true, intrinsicInkOnly: true, externalGlow: false,
  }),
  existingTrees: Object.freeze({
    preserveMeshes: true, preserveTextureUVs: true, preserveRig: true,
    preserveTrunkColliders: true, permittedCanopyFamily: 'blue-cyan',
    // Retexture only by an approved tile-local material override if
    // actual Play QA finds a mismatch; no shared global atlas edits.
    sharedTextureReplacement: false,
  }),
  noSecondaryEnergyParticles: true,
  noSecondWaterShader: true,
});

const finite = Number.isFinite;
const rand32 = seed => () => {
  let t = (seed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp01 = value => Math.min(1, Math.max(0, value));
const bounds = FOREST_TILE_X49_Z113.local;
const inside = (x, z) => x >= bounds.minX && x < bounds.maxX &&
  z >= bounds.minZ && z < bounds.maxZ;

/** A straight, tapered blade ribbon, never a crossed billboard or '+' mesh. */
export function straightBladeRibbon({height = 0.115, width = 0.013} = {}) {
  if (!finite(height) || !finite(width) || height <= 0 || width <= 0 ||
      height > 0.18 || width > 0.035) throw new RangeError('Invalid short-lawn blade dimensions');
  return Object.freeze({
    // All vertices lie in the XY plane. Identical Z means no perpendicular cross-card.
    positions: Object.freeze([
      -width / 2, 0, 0, width / 2, 0, 0,
      -width * .31, height * .62, 0, width * .31, height * .62, 0,
      0, height, 0,
    ]),
    indices: Object.freeze([0, 1, 2, 1, 3, 2, 2, 3, 4]),
    doubleSided: true,
    vertical: true,
  });
}

/**
 * Legacy export name retained for caller compatibility; now three-sided,
 * genuinely 3D upright leaf geometry, not a vanishing edge-on paper ribbon.
 * Instancing should scale normalized Y to the authored height in metres.
 */
export function straightGrassClumpRibbons() {
  return makeX49Z113VolumetricGrassClump();
}

/**
 * Low irregular stone cap instead of a faceted sphere or turtle sculpture.
 * Y is normalized to stone.height, XZ to stone.radius on integration.
 */
export function irregularMossStoneShell() {
  const positions = [], indices = [], edges = 9;
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < edges; i++) {
      const angle = i * Math.PI * 2 / edges;
      const irregular = .90 + .10 * Math.sin(i * 2.38 + 1.5);
      const radial = irregular * (ring ? .71 : 1);
      const y = ring ? .76 + .05 * Math.sin(i * 1.7) : -.04;
      positions.push(radial * Math.cos(angle),y,radial * Math.sin(angle));
    }
  }
  const centerIndex = positions.length / 3;
  positions.push(-.07, .97, .04);
  for (let i = 0; i < edges; i++) {
    const j = (i + 1) % edges;
    indices.push(i, i + edges, j, j, i + edges, j + edges,
      i + edges, centerIndex, j + edges);
  }
  return Object.freeze({positions:Object.freeze(positions),
    indices:Object.freeze(indices), segments:edges, normalized:true});
}

function slopeAt(sampleHeight, x, z) {
  if (!inside(x, z)) return null;
  // Never query a slope probe beyond THIS exclusively claimed 5m square.
  // A one-sided finite difference works close to each edge and keeps all
  // canonical terrain reads within the square, not a neighbor's surface.
  const step = .2, epsilon = 1e-6;
  const left = Math.max(bounds.minX, x - step);
  const right = Math.min(bounds.maxX - epsilon, x + step);
  const down = Math.max(bounds.minZ, z - step);
  const up = Math.min(bounds.maxZ - epsilon, z + step);
  const dx = right - left, dz = up - down;
  if (!(dx > 0) || !(dz > 0)) return null;
  const l = sampleHeight(left, z), r = sampleHeight(right, z);
  const d = sampleHeight(x, down), u = sampleHeight(x, up);
  const y = sampleHeight(x, z);
  if (![l, r, d, u, y].every(finite)) return null;
  return {y, slope: Math.hypot((r - l) / dx, (u - d) / dz)};
}

/**
 * Returns a deterministic, bounded placement plan against the *actual*
 * rendered triangle sampler supplied by the integration lane. No world writes.
 * Missing route/river/forest/height inputs fail closed rather than fabricating Y.
 */
export function planForestFloorX49Z113({
  sampleHeight, routeClearance, riverDistance, clearOf, existingTrees,
} = {}) {
  if ([sampleHeight, routeClearance, riverDistance, clearOf].some(f => typeof f !== 'function') ||
      !Array.isArray(existingTrees)) throw new TypeError('Canonical surface, clearances and tree list are required');
  const grass = [], rocks = [], random = rand32(0x49113);
  const nearestTree = (x, z) => {
    let nearest = Infinity;
    for (const tree of existingTrees) {
      if (!finite(tree?.x) || !finite(tree?.z)) continue;
      nearest = Math.min(nearest, Math.hypot(x - tree.x, z - tree.z));
    }
    return nearest;
  };
  const admissible = (x, z, radius, slopeLimit) => {
    if (!inside(x, z) || !clearOf({x, z}, radius)) return null;
    // The canonical helper deliberately returns +Infinity far from routes:
    // that is SAFE clearance, not invalid terrain.
    const routeGap = routeClearance(x, z);
    if (!(routeGap === Infinity || (finite(routeGap) && routeGap >= 3.5))) return null;
    if (!finite(riverDistance(x, z)) || riverDistance(x, z) < 20) return null;
    if (nearestTree(x, z) < radius + .83) return null;
    const sampled = slopeAt(sampleHeight, x, z);
    return sampled && sampled.slope <= slopeLimit ? sampled : null;
  };
  // Twenty-four by twenty-four stratified clumps of nine SHORT upright blades.
  // Derive BOTH axes from the authoritative 5m tile, not unrelated divisors:
  // an earlier 24-row/16-step mismatch silently dropped the northern 1/3.
  const columns = 24, rows = 24;
  const stepX = (bounds.maxX - bounds.minX) / columns;
  const stepZ = (bounds.maxZ - bounds.minZ) / rows;
  // The edge taper prevents a hard square seam once adjacent tiles are filled.
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = bounds.minX + (column + .18 + random() * .64) * stepX;
    const z = bounds.minZ + (row + .18 + random() * .64) * stepZ;
    const edge = Math.min(x - bounds.minX, bounds.maxX - x,
      z - bounds.minZ, bounds.maxZ - z);
    const edgeBlend = clamp01(edge / .38);
    if (random() > edgeBlend) continue;
    const ground = admissible(x, z, .1, .48);
    if (!ground) continue;
    grass.push(Object.freeze({
      kind: 'short-straight-lawn-grass', x, y: ground.y - .012, z,
      worldZ: z + FOREST_TILE_X49_Z113.viewerZOffset,
      yaw: random() * Math.PI * 2,
      height: .075 + random() * .055,
      shade: Math.floor(random() * FOREST_TILE_X49_Z113_STYLE.grass.albedoHex.length),
      materialFamily: FOREST_TILE_X49_Z113_STYLE.grass.family,
      materialName: FOREST_TILE_X49_Z113_STYLE.grass.materialName,
      strands: FOREST_TILE_X49_Z113_STYLE.grass.strandsPerClump,
      windPhase: random() * Math.PI * 2,
      opacity: edgeBlend,
      collision: false,
    }));
  }
  // Three low, nonblocking moss-green stones. No turtle sculpture is passed off
  // as a common rock; a future artist can map these to licensed rock geometry.
  for (const [x, z, radius, yaw] of [
    [-304.15, 16.25, .24, .2],
    [-302.04, 18.54, .31, 1.4],
    [-301.27, 16.73, .20, 2.6],
  ]) {
    const ground = admissible(x, z, radius + .2, .28);
    if (!ground) continue;
    rocks.push(Object.freeze({kind: 'low-irregular-moss-stone',
      x, y: ground.y - .015, z,
      worldZ: z + FOREST_TILE_X49_Z113.viewerZOffset,
      radius, height: radius * .43, yaw, collision: false,
      materialFamily: FOREST_TILE_X49_Z113_STYLE.stone.family,
      materialName: FOREST_TILE_X49_Z113_STYLE.stone.materialName,
      shade: rocks.length % FOREST_TILE_X49_Z113_STYLE.stone.albedoHex.length}));
  }
  return Object.freeze({tileId: FOREST_TILE_X49_Z113.id,
    bounds: FOREST_TILE_X49_Z113.local, grass: Object.freeze(grass),
    rocks: Object.freeze(rocks), preservedTrees: Object.freeze(existingTrees.filter(t =>
      finite(t?.x) && finite(t?.z) && inside(t.x, t.z))),
    decorativeOnly: true, mounted: false, altersTerrainHeight: false,
    style: FOREST_TILE_X49_Z113_STYLE});
}
