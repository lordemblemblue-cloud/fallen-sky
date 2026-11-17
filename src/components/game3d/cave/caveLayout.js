// Book-world underground cave — shared walkable layout.
//
// One cave: a stone mouth, a hallway, and a large hub with side alcoves.
// Other workstreams read this module and should not hardcode these coordinates.
//
// Space: Wolfveil-local meters (the same space as WolfveilCaveLayout). The
// rendered valley is shifted by CAVE_WORLD_OFFSET_Z (+70 on Z). Fields named
// worldX / worldY / worldZ are already in Game 3D world meters.
//
// API
//   entrance              mouth socket. Agent 3's approach and arch meet here.
//   hallway               centerline, width and ceiling of the tunnel.
//   hub                   open floor bounds after the hallway.
//   farmSpots[]           farming alcoves { id, name, x, y, z, worldX, worldY,
//                         worldZ, radius, floorY, yaw, tint, kind }
//   treasureSpots[]       same shape, kind 'treasure'
//   bossArenas[]          same shape, kind 'boss'
//   raidArea              one alcove, kind 'raid'
//   dungeonBossChamber    one chamber, kind 'dungeonBoss' (solo or a party)
//   caveLayout            the same records on one object
//   sampleBookCaveSpace(localX, localZ, margin) ->
//                         { inside, floorY, ceilingY, clearance, kind, id } | null
//   sampleBookCavePlayerFloorY(worldX, feetY, worldZ) -> floor Y or null
//   resolveBookCaveWallCollision(localNow, localPrev, radius) -> boolean
//   getCaveAnchor(id)     any named zone, or the entrance / hub
//   CAVE_PILLARS          visible columns that also collide
//
// Collision matches the sampled volume. Decorative rock stays outside it.
// The hallway is open at the mouth: walking back out is allowed.

import { wolfveilHeight } from '../wolfveil/WolfveilLayout.js';
import { sampleWolfveilCaveSpace } from '../wolfveil/WolfveilCaveLayout.mjs';

export const CAVE_LAYOUT_VERSION = 1;
export const CAVE_WORLD_OFFSET_Z = 70;

const MOUTH_X = 252;
const MOUTH_Z = 58;
const HUB_X = 334;
const HUB_Z = 122;
const HUB_RADIUS_X = 34;
const HUB_RADIUS_Z = 26;
const HUB_CEILING = 9.6;
const HALL_CEILING = 5.7;
const ZONE_CEILING = 7.4;
const RAID_CEILING = 8.8;
const DUNGEON_CEILING = 8.2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const hypot2 = (x, z) => Math.hypot(x, z);

const toHubX = HUB_X - MOUTH_X;
const toHubZ = HUB_Z - MOUTH_Z;
const hubDistance = hypot2(toHubX, toHubZ);
const dirX = toHubX / hubDistance;
const dirZ = toHubZ / hubDistance;
const sideX = -dirZ;
const sideZ = dirX;

const mouthY = wolfveilHeight(MOUTH_X, MOUTH_Z);
const hallLength = hubDistance - HUB_RADIUS_X + 8;

function alongPoint(along, lateral, y) {
  return [
    MOUTH_X + dirX * along + sideX * lateral,
    y,
    MOUTH_Z + dirZ * along + sideZ * lateral,
  ];
}

function hubLocal(x, z) {
  const dx = x - HUB_X;
  const dz = z - HUB_Z;
  return {
    u: dx * dirX + dz * dirZ,
    v: dx * sideX + dz * sideZ,
  };
}

export function hallwayHalfWidth(along) {
  const base = 3.42
    + 0.42 * Math.sin(along * 0.29)
    + 0.26 * Math.sin(along * 0.13 + 0.7);
  const body = clamp(base, 3.28, 4.25);
  const flareStart = hallLength - 14;
  if (along <= flareStart) return body;
  return body + (5.35 - body) * smooth((along - flareStart) / 14);
}

export function hallwayCeiling(along) {
  // A built vault at the mouth, then a little more air once the hill covers it.
  if (along <= 16) return 4.9;
  return 4.9 + (HALL_CEILING - 4.9) * smooth((along - 16) / 12);
}

function hallwayFloorY(along, floorY) {
  // Short flat sill, then a steady ramp, then a flat run into the hub.
  // The peak grade stays under a comfortable walk (about 11 degrees).
  const sill = 4.2;
  const grade = 0.19;
  if (along <= sill) return mouthY;
  return Math.max(floorY, mouthY - grade * (along - sill));
}

function makeCorridor(id, waypoints, halfWidths, ceiling, kind) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = hypot2(dx, dz) || 0.001;
    segments.push(Object.freeze({
      ax: a[0], ay: a[1], az: a[2],
      bx: b[0], by: b[1], bz: b[2],
      dx, dy, dz, len,
      halfWidth: halfWidths[i],
      start: total,
    }));
    total += len;
  }
  return Object.freeze({
    id, kind, ceiling, waypoints: Object.freeze(waypoints),
    segments: Object.freeze(segments), totalLength: total,
  });
}

function ellipseClearance(x, z) {
  const { u, v } = hubLocal(x, z);
  const radial = Math.hypot(u / HUB_RADIUS_X, v / HUB_RADIUS_Z);
  if (radial <= 1e-5) return Math.min(HUB_RADIUS_X, HUB_RADIUS_Z);
  const center = hypot2(u, v);
  return center * (1 - radial) / radial;
}

function circleClearance(x, z, cx, cz, radius) {
  return radius - hypot2(x - cx, z - cz);
}

// Floor is chosen after the footprint exists, so the whole shell stays under
// the ridge without a steep ramp. The first pass uses the mouth height only
// to trace the plan; Y is rewritten once the buried floor is known.
const planWaypoints = [];
const HALL_STEPS = 16;
for (let i = 0; i <= HALL_STEPS; i++) {
  const t = i / HALL_STEPS;
  const along = t * hallLength;
  const lateral = Math.sin(Math.PI * t) * 6.4;
  planWaypoints.push({ along, lateral });
}

function waypointAt(sample, floorY) {
  return alongPoint(sample.along, sample.lateral, hallwayFloorY(sample.along, floorY));
}

function coveredColumn(x, z) {
  // The first few metres are the open mouth. Everywhere else needs rock on top.
  const along = (x - MOUTH_X) * dirX + (z - MOUTH_Z) * dirZ;
  const lateral = (x - MOUTH_X) * sideX + (z - MOUTH_Z) * sideZ;
  if (along < 7 && Math.abs(lateral) < 6) return false;
  return true;
}

function footprintPoints(floorY) {
  const pts = [];
  const push = (x, z) => {
    if (coveredColumn(x, z)) pts.push([x, z]);
  };
  for (const sample of planWaypoints) {
    const [x, , z] = waypointAt(sample, floorY);
    const half = hallwayHalfWidth(sample.along) + 1.2;
    push(x, z);
    push(x + sideX * half, z + sideZ * half);
    push(x - sideX * half, z - sideZ * half);
  }
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    for (const scale of [0.55, 1]) {
      const u = Math.cos(t) * HUB_RADIUS_X * scale;
      const v = Math.sin(t) * HUB_RADIUS_Z * scale;
      push(HUB_X + dirX * u + sideX * v, HUB_Z + dirZ * u + sideZ * v);
    }
  }
  return pts;
}

function lowestCover(floorY) {
  let min = Infinity;
  for (const [x, z] of footprintPoints(floorY)) {
    min = Math.min(min, wolfveilHeight(x, z));
  }
  return min;
}

const coverTarget = 4.2;
const descendRun = hallLength * 0.72;
let floorY = lowestCover(mouthY) - HUB_CEILING - coverTarget;
const maxDrop = 0.2 * descendRun;
if (mouthY - floorY > maxDrop) floorY = mouthY - maxDrop;
// Keep a walkable ceiling if the ridge gets shallow. 7.2m still clears a jump.
let hubCeiling = HUB_CEILING;
const cover = lowestCover(floorY) - (floorY + hubCeiling);
if (cover < 3.4) hubCeiling = Math.max(7.2, lowestCover(floorY) - floorY - 3.4);

const hallWaypoints = planWaypoints.map((sample) => waypointAt(sample, floorY));
const hallHalfWidths = [];
for (let i = 0; i < hallWaypoints.length - 1; i++) {
  const mid = (planWaypoints[i].along + planWaypoints[i + 1].along) * 0.5;
  hallHalfWidths.push(hallwayHalfWidth(mid));
}

const hallwayCorridor = makeCorridor(
  'ashroot_hallway',
  hallWaypoints,
  hallHalfWidths,
  HALL_CEILING,
  'hallway',
);

function worldOf(x, y, z) {
  return {
    x, y, z,
    worldX: x,
    worldY: y,
    worldZ: z + CAVE_WORLD_OFFSET_Z,
  };
}

function anchor(spec) {
  const px = HUB_X + dirX * spec.u + sideX * spec.v;
  const pz = HUB_Z + dirZ * spec.u + sideZ * spec.v;
  const yaw = Math.atan2(px - HUB_X, pz - HUB_Z);
  return Object.freeze({
    id: spec.id,
    kind: spec.kind,
    name: spec.name,
    purpose: spec.purpose,
    ...worldOf(px, floorY, pz),
    radius: spec.radius,
    floorY,
    yaw,
    tint: spec.tint,
    soloable: spec.soloable ?? false,
    party: spec.party ?? false,
  });
}

// Hub-local metres: +u is deeper (away from the mouth), +v is to the left
// of someone walking in. The spine |v| < 4.6 stays empty for walking.
const farmSpots = Object.freeze([
  anchor({ id: 'farm_moss_terrace', kind: 'farm', name: 'Moss Terrace', purpose: 'Farming plot', u: -18, v: 15.5, radius: 5.6, tint: 0x6e8f5c }),
  anchor({ id: 'farm_glowcap_garden', kind: 'farm', name: 'Glowcap Garden', purpose: 'Farming plot', u: -8, v: 17.2, radius: 5.2, tint: 0x7d9a48 }),
  anchor({ id: 'farm_root_orchard', kind: 'farm', name: 'Root Orchard', purpose: 'Farming plot', u: -20, v: -14.5, radius: 5.4, tint: 0x8a7044 }),
  anchor({ id: 'farm_dripfern_bed', kind: 'farm', name: 'Dripfern Bed', purpose: 'Farming plot', u: 2, v: -17.4, radius: 5.1, tint: 0x4f8f78 }),
]);

const treasureSpots = Object.freeze([
  anchor({ id: 'treasure_sealed_coffer', kind: 'treasure', name: 'Sealed Coffer', purpose: 'Treasure niche', u: -26, v: -4.5, radius: 4.0, tint: 0xc6a15a }),
  anchor({ id: 'treasure_geode_cache', kind: 'treasure', name: 'Geode Cache', purpose: 'Treasure niche', u: 12, v: 17.5, radius: 4.2, tint: 0x9b7cd6 }),
  anchor({ id: 'treasure_offering_basin', kind: 'treasure', name: 'Offering Basin', purpose: 'Treasure niche', u: 22, v: -13.5, radius: 4.0, tint: 0xd7b07a }),
  anchor({ id: 'treasure_sunken_crock', kind: 'treasure', name: 'Sunken Crock', purpose: 'Treasure niche', u: 24, v: 11.5, radius: 3.8, tint: 0x6ea8c9 }),
]);

const bossArenas = Object.freeze([
  anchor({ id: 'boss_stone_ring', kind: 'boss', name: 'Stone Ring', purpose: 'Boss arena', u: 16, v: 11.5, radius: 6.6, tint: 0xb5523a, soloable: true }),
  anchor({ id: 'boss_pillar_court', kind: 'boss', name: 'Pillar Court', purpose: 'Boss arena', u: -10, v: -11.5, radius: 6.6, tint: 0xa84832, soloable: true }),
]);

const raidArea = anchor({
  id: 'raid_broken_gallery', kind: 'raid', name: 'The Broken Gallery',
  purpose: 'Raid hall', u: -6, v: 41, radius: 11.5, tint: 0x7f6cff, party: true,
});

const dungeonBossChamber = anchor({
  id: 'dungeon_marrow_chamber', kind: 'dungeonBoss', name: 'The Marrow Chamber',
  purpose: 'Dungeon boss chamber, solo or a party', u: 50, v: 0, radius: 11,
  tint: 0x8d3b4a, soloable: true, party: true,
});

function neck(id, from, to, halfWidth, kind) {
  return makeCorridor(id, [
    [from.x, floorY, from.z],
    [to.x, floorY, to.z],
  ], [halfWidth], kind === 'raid' ? 6.4 : 5.8, kind);
}

// Necks start inside the parent volume so the join cannot pinch.
const raidNeck = neck(
  'raid_neck',
  { x: HUB_X + dirX * -6 + sideX * 22, z: HUB_Z + dirZ * -6 + sideZ * 22 },
  { x: raidArea.x - dirX * 0 - sideX * (raidArea.radius - 3), z: raidArea.z - sideZ * (raidArea.radius - 3) },
  3.7,
  'raid',
);
const dungeonNeck = neck(
  'dungeon_neck',
  { x: HUB_X + dirX * 28, z: HUB_Z + dirZ * 28 },
  { x: dungeonBossChamber.x - dirX * (dungeonBossChamber.radius - 2.5), z: dungeonBossChamber.z - dirZ * (dungeonBossChamber.radius - 2.5) },
  3.55,
  'dungeon',
);

const alcoveCircles = Object.freeze([
  ...farmSpots,
  ...treasureSpots,
  ...bossArenas,
].map((zone) => Object.freeze({ ...zone, ceiling: ZONE_CEILING })));

// Columns stand between the straight walks from the hub centre to each zone.
const PILLAR_UV = Object.freeze([
  [-16, 8.8], [-6.7, 8.8], [2.2, 8.8], [8.5, 8.9],
  [5.5, -8.8], [19.8, -8.6],
]);

export const CAVE_PILLARS = Object.freeze(PILLAR_UV.map(([u, v], index) => {
  const x = HUB_X + dirX * u + sideX * v;
  const z = HUB_Z + dirZ * u + sideZ * v;
  return Object.freeze({
    id: `hub_pillar_${index + 1}`,
    kind: 'pillar',
    ...worldOf(x, floorY, z),
    radius: 0.7,
    height: 5.4,
  });
}));

const hubBounds = (() => {
  const points = [
    ...hallwayCorridor.waypoints,
    [HUB_X, floorY, HUB_Z],
    ...alcoveCircles.flatMap((zone) => [
      [zone.x - zone.radius, floorY, zone.z],
      [zone.x + zone.radius, floorY, zone.z],
      [zone.x, floorY, zone.z - zone.radius],
      [zone.x, floorY, zone.z + zone.radius],
    ]),
    [raidArea.x, floorY, raidArea.z],
    [dungeonBossChamber.x, floorY, dungeonBossChamber.z],
  ];
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const [x, , z] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return Object.freeze({
    minX: minX - 4, maxX: maxX + 14, minZ: minZ - 16, maxZ: maxZ + 16,
  });
})();

const outerSill = alongPoint(-9, 0, mouthY);
const outerGround = wolfveilHeight(outerSill[0], outerSill[2]);

export const entrance = Object.freeze({
  id: 'ashroot_entrance',
  name: 'Ashroot Mouth',
  ...worldOf(MOUTH_X, mouthY, MOUTH_Z),
  dir: Object.freeze([dirX, dirZ]),
  outward: Object.freeze([-dirX, -dirZ]),
  yaw: Math.atan2(dirX, dirZ),
  openingHalfWidth: 2.9,
  openingWidth: 5.8,
  openingHeight: 4.8,
  floorY: mouthY,
  // Flat socket just outside the arch. The approach path ends on `outer`.
  outer: Object.freeze({
    ...worldOf(outerSill[0], outerGround, outerSill[2]),
    floorY: outerGround,
  }),
  sillHalfWidth: 3.7,
  sillLength: 9,
});

export const hallway = Object.freeze({
  id: hallwayCorridor.id,
  kind: 'hallway',
  ceiling: HALL_CEILING,
  halfWidthAt: hallwayHalfWidth,
  waypoints: hallwayCorridor.waypoints,
  segments: hallwayCorridor.segments,
  totalLength: hallwayCorridor.totalLength,
  floorAt(along) { return hallwayFloorY(along, floorY); },
});

export const hub = Object.freeze({
  id: 'ashroot_hollow',
  name: 'Ashroot Hollow',
  kind: 'hub',
  ...worldOf(HUB_X, floorY, HUB_Z),
  floorY,
  radiusX: HUB_RADIUS_X,
  radiusZ: HUB_RADIUS_Z,
  ceiling: hubCeiling,
  dir: Object.freeze([dirX, dirZ]),
  side: Object.freeze([sideX, sideZ]),
  bounds: hubBounds,
  yaw: Math.atan2(dirX, dirZ),
});

export { farmSpots, treasureSpots, bossArenas, raidArea, dungeonBossChamber };

export const CAVE_ZONES = Object.freeze({
  farmSpots, treasureSpots, bossArenas, raidArea, dungeonBossChamber,
});

export const CAVE_BUILT_SPANS = Object.freeze([
  Object.freeze({ id: 'entrance_masonry', kind: 'brick', along0: 0, along1: 12 }),
  Object.freeze({ id: 'marrow_door', kind: 'brick', along0: hallLength - 6, along1: hallLength }),
]);

const ALL_ANCHORS = [
  entrance, hub, ...farmSpots, ...treasureSpots, ...bossArenas, raidArea, dungeonBossChamber,
];

export function getCaveAnchor(id) {
  return ALL_ANCHORS.find((anchor) => anchor.id === id) ?? null;
}

function corridorClearance(corridor, x, z) {
  let best = -Infinity;
  let floor = null;
  let along = 0;
  for (const seg of corridor.segments) {
    const len2 = seg.len * seg.len;
    const t = clamp(((x - seg.ax) * seg.dx + (z - seg.az) * seg.dz) / len2, 0, 1);
    const px = seg.ax + seg.dx * t;
    const pz = seg.az + seg.dz * t;
    const clear = seg.halfWidth - hypot2(x - px, z - pz);
    if (clear > best) {
      best = clear;
      floor = seg.ay + seg.dy * t;
      along = seg.start + t * seg.len;
    }
  }
  return { clear: best, floor, along };
}

function consider(best, clearance, floor, ceiling, kind, id) {
  if (clearance < 0) return best;
  if (!best || clearance > best.clearance) {
    return { inside: true, clearance, floorY: floor, ceilingY: floor + ceiling, kind, id };
  }
  return best;
}

/**
 * Walkable volume at Wolfveil-local (x, z).
 * `margin` shrinks the volume (use the body radius). Positive clearance is inside.
 */
export function sampleBookCaveSpace(x, z, margin = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  const pad = margin;

  for (const zone of alcoveCircles) {
    best = consider(
      best,
      circleClearance(x, z, zone.x, zone.z, zone.radius) - pad,
      floorY,
      ZONE_CEILING,
      zone.kind,
      zone.id,
    );
  }
  best = consider(
    best,
    circleClearance(x, z, raidArea.x, raidArea.z, raidArea.radius) - pad,
    floorY,
    RAID_CEILING,
    'raid',
    raidArea.id,
  );
  best = consider(
    best,
    circleClearance(x, z, dungeonBossChamber.x, dungeonBossChamber.z, dungeonBossChamber.radius) - pad,
    floorY,
    DUNGEON_CEILING,
    'dungeonBoss',
    dungeonBossChamber.id,
  );
  const hubClear = ellipseClearance(x, z) - pad;
  best = consider(best, hubClear, floorY, hubCeiling, 'hub', hub.id);

  const hall = corridorClearance(hallwayCorridor, x, z);
  best = consider(
    best, hall.clear - pad, hall.floor, hallwayCeiling(hall.along), 'hallway', hallwayCorridor.id,
  );
  const raidJoin = corridorClearance(raidNeck, x, z);
  best = consider(best, raidJoin.clear - pad, floorY, 6.4, 'raid', raidNeck.id);
  const dungeonJoin = corridorClearance(dungeonNeck, x, z);
  best = consider(best, dungeonJoin.clear - pad, floorY, 5.8, 'dungeonBoss', dungeonNeck.id);

  // Inside the hub dome, keep the tall ceiling even if a hallway cap won
  // the clearance contest at the join.
  if (best && ellipseClearance(x, z) >= pad && best.kind === 'hallway') {
    best = {
      ...best,
      floorY,
      ceilingY: floorY + hubCeiling,
      kind: 'hub',
      id: hub.id,
      clearance: Math.max(best.clearance, ellipseClearance(x, z) - pad),
    };
  }
  return best;
}

export function sampleBookCavePlayerFloorY(worldX, feetY, worldZ, offsetZ = CAVE_WORLD_OFFSET_Z) {
  if (![worldX, feetY, worldZ].every(Number.isFinite)) return null;
  const localZ = worldZ - offsetZ;
  const space = sampleBookCaveSpace(worldX, localZ, 0.05);
  if (!space) return null;
  const aboveFloor = feetY - space.floorY;
  // A high jump still belongs to the cave. The ridge above it does not.
  if (aboveFloor > 2.7 || aboveFloor < -5) return null;
  const outside = wolfveilHeight(worldX, localZ);
  if (aboveFloor > 1.15 && Math.abs(feetY - outside) < 0.9 && outside > space.floorY + 2.2) {
    return null;
  }
  return space.floorY;
}

function inFrontOfMouth(x, z) {
  const along = (x - MOUTH_X) * dirX + (z - MOUTH_Z) * dirZ;
  const lateral = Math.abs((x - MOUTH_X) * sideX + (z - MOUTH_Z) * sideZ);
  return along < 0.85 && along > -12 && lateral <= hallwayHalfWidth(0) + 0.4;
}

function hitsPillar(x, z, radius) {
  for (const pillar of CAVE_PILLARS) {
    if (hypot2(x - pillar.x, z - pillar.z) < pillar.radius + radius) return pillar;
  }
  return null;
}

/**
 * Slide a body that was already inside the cave. Walking out through the
 * mouth is allowed. Mutates `localNow` and returns true when it changed.
 */
export function resolveBookCaveWallCollision(localNow, localPrev, radius = 0.62) {
  if (!localNow || !localPrev) return false;
  if (!sampleBookCaveSpace(localPrev.x, localPrev.z, radius)) return false;
  const indoors = (x, z) => Boolean(sampleBookCaveSpace(x, z, radius));
  let hit = false;
  if (!indoors(localNow.x, localNow.z)) {
    if (inFrontOfMouth(localNow.x, localNow.z) && inFrontOfMouth(localPrev.x, localPrev.z)) {
      return false;
    }
    if (indoors(localNow.x, localPrev.z)) {
      localNow.z = localPrev.z;
      hit = true;
    } else if (indoors(localPrev.x, localNow.z)) {
      localNow.x = localPrev.x;
      hit = true;
    } else {
      localNow.x = localPrev.x;
      localNow.z = localPrev.z;
      hit = true;
    }
  }
  const pillar = hitsPillar(localNow.x, localNow.z, radius);
  if (pillar) {
    const dx = localNow.x - pillar.x;
    const dz = localNow.z - pillar.z;
    const dist = hypot2(dx, dz) || 0.001;
    const need = pillar.radius + radius + 0.02;
    localNow.x = pillar.x + (dx / dist) * need;
    localNow.z = pillar.z + (dz / dist) * need;
    if (!indoors(localNow.x, localNow.z)) {
      localNow.x = localPrev.x;
      localNow.z = localPrev.z;
    }
    hit = true;
  }
  return hit;
}

export const caveLayout = Object.freeze({
  version: CAVE_LAYOUT_VERSION,
  offsetZ: CAVE_WORLD_OFFSET_Z,
  entrance,
  hallway,
  hub,
  farmSpots,
  treasureSpots,
  bossArenas,
  raidArea,
  dungeonBossChamber,
  pillars: CAVE_PILLARS,
  builtSpans: CAVE_BUILT_SPANS,
  overlapsLegacyCave: footprintPoints(floorY).some(([x, z]) => sampleWolfveilCaveSpace(x, z, 1.5)),
});

export const CAVE_INTERNALS = Object.freeze({
  hallwayCorridor,
  raidNeck,
  dungeonNeck,
  floorY,
  hubCeiling,
  mouthY,
  hallLength,
  dirX,
  dirZ,
  sideX,
  sideZ,
});
