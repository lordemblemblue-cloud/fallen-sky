// Wolfveil Overworld Cave & Tunnel System — pure layout, floor elevation,
// terrain mouth cutout, and capsule-corridor collision rules.
//
// Four unique explorable caverns around Wolfveil Valley linked underground via
// a central Subterranean Rotunda and five winding rock-cut tunnels.
// Coordinates are Wolfveil-local (Game 3D applies +70m Z via world.group).
import { wolfveilHeight } from './WolfveilLayout.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

// Four distinct surface caverns + one deep interconnecting rotunda hub.
const RAW_ENTRANCES = [
  {
    id: 'jade_lantern_grotto',
    name: 'Jade Lantern Grotto',
    theme: 'lantern_shrine',
    mouth: [-216, 76],
    inwardDir: [-0.82, 0.57], // NW into the Western Cedar foothill
    chamberOffset: 24,
    chamberDrop: 7.5,
    chamberRadius: 14.5,
    ceilingHeight: 9.2,
    lightColor: 0xffb35c,
    accentColor: 0x4fd4a8,
  },
  {
    id: 'whispering_root_hollow',
    name: 'Whispering Root Hollow',
    nameShort: 'Root Hollow',
    theme: 'skylight_roots',
    mouth: [-312, 148],
    inwardDir: [-0.88, 0.47], // WNW into the ancient forest ridge
    chamberOffset: 25,
    chamberDrop: 8.2,
    chamberRadius: 15.5,
    ceilingHeight: 10.6,
    lightColor: 0x8de8a8,
    accentColor: 0xd9f59d,
  },
  {
    id: 'sunken_inkstone_cistern',
    name: 'Sunken Inkstone Cistern',
    theme: 'ink_spring',
    mouth: [-82, 312],
    inwardDir: [-0.32, 0.95], // NNW into the Hot Spring highland cliff
    chamberOffset: 26,
    chamberDrop: 8.8,
    chamberRadius: 16.0,
    ceilingHeight: 9.8,
    lightColor: 0x6ad4e8,
    accentColor: 0xf4c078,
  },
  {
    id: 'echoing_crystal_vault',
    name: 'Echoing Crystal Vault',
    theme: 'crystal_geode',
    mouth: [122, 198],
    inwardDir: [0.36, 0.93], // NNE into the Upper Falls cliffside (clear of Lunar/Astral gates)
    chamberOffset: 25,
    chamberDrop: 8.0,
    chamberRadius: 15.0,
    ceilingHeight: 10.2,
    lightColor: 0x8fb8ff,
    accentColor: 0xc084fc,
  },
];

export const WOLFVEIL_EXPLORABLE_CAVES = Object.freeze(
  RAW_ENTRANCES.map(cave => {
    const [mx, mz] = cave.mouth;
    const len = Math.hypot(cave.inwardDir[0], cave.inwardDir[1]) || 1;
    const dx = cave.inwardDir[0] / len, dz = cave.inwardDir[1] / len;
    const mouthY = wolfveilHeight(mx, mz);
    const cx = mx + dx * cave.chamberOffset;
    const cz = mz + dz * cave.chamberOffset;
    const floorY = mouthY - cave.chamberDrop;
    // Short exterior threshold apron so players walk smoothly off the hillside
    const thresholdX = mx - dx * 3.5;
    const thresholdZ = mz - dz * 3.5;
    const thresholdY = wolfveilHeight(thresholdX, thresholdZ);
    return Object.freeze({
      ...cave,
      dir: Object.freeze([dx, dz]),
      mouthY,
      threshold: Object.freeze([thresholdX, thresholdY, thresholdZ]),
      chamber: Object.freeze({
        id: cave.id + '_chamber',
        x: cx,
        y: floorY,
        z: cz,
        radius: cave.chamberRadius,
        ceiling: cave.ceilingHeight,
        theme: cave.theme,
      }),
    });
  }),
);

// Central underground hub where the 4 caves' tunnels meet beneath the valley.
const avgHubFloor =
  WOLFVEIL_EXPLORABLE_CAVES.reduce((s, c) => s + c.chamber.y, 0) /
    WOLFVEIL_EXPLORABLE_CAVES.length - 3.5;

export const WOLFVEIL_CAVE_HUB = Object.freeze({
  id: 'subterranean_wolf_rotunda',
  name: 'Subterranean Wolf-Spirit Rotunda',
  theme: 'ancient_rotunda',
  x: -138,
  y: avgHubFloor,
  z: 196,
  radius: 17.5,
  ceiling: 11.2,
  lightColor: 0xf5b869,
  accentColor: 0x67e8f9,
});

export const WOLFVEIL_CAVE_CHAMBERS = Object.freeze([
  ...WOLFVEIL_EXPLORABLE_CAVES.map(c => c.chamber),
  WOLFVEIL_CAVE_HUB,
]);

function makePolylineCorridor(id, waypoints, halfWidth = 3.6, ceiling = 5.8, kind = 'tunnel') {
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const lenXZ = Math.hypot(dx, dz) || 0.001;
    segments.push(Object.freeze({
      ax: a[0], ay: a[1], az: a[2],
      bx: b[0], by: b[1], bz: b[2],
      dx, dy, dz, lenXZ,
      startDist: totalLength,
    }));
    totalLength += lenXZ;
  }
  return Object.freeze({ id, kind, halfWidth, ceiling, waypoints, segments, totalLength });
}

const byId = Object.fromEntries(WOLFVEIL_EXPLORABLE_CAVES.map(c => [c.id, c]));

function bendWaypoints(a, b, bendLateral = 16, midDrop = -1.8) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const p1 = [
    a.x + dx * 0.33 + nx * bendLateral,
    a.y + (b.y - a.y) * 0.33 + midDrop,
    a.z + dz * 0.33 + nz * bendLateral,
  ];
  const p2 = [
    a.x + dx * 0.67 - nx * bendLateral * 0.65,
    a.y + (b.y - a.y) * 0.67 + midDrop * 0.85,
    a.z + dz * 0.67 - nz * bendLateral * 0.65,
  ];
  return [[a.x, a.y, a.z], p1, p2, [b.x, b.y, b.z]];
}

// Entry ramp corridors (threshold -> mouth -> chamber) + 5 interconnecting tunnels!
export const WOLFVEIL_CAVE_CORRIDORS = Object.freeze([
  ...WOLFVEIL_EXPLORABLE_CAVES.map(c =>
    makePolylineCorridor(
      `entry_${c.id}`,
      [
        c.threshold,
        [c.mouth[0], c.mouthY - 0.35, c.mouth[1]],
        [
          c.mouth[0] + c.dir[0] * (c.chamberOffset * 0.52),
          c.mouthY - c.chamberDrop * 0.55,
          c.mouth[1] + c.dir[1] * (c.chamberOffset * 0.52),
        ],
        [c.chamber.x, c.chamber.y, c.chamber.z],
      ],
      3.9,
      6.2,
      'entry',
    ),
  ),
  // Tunnel 1: Jade Lantern Grotto <-> Whispering Root Hollow (western ring)
  makePolylineCorridor(
    'tunnel_grotto_to_roots',
    bendWaypoints(byId.jade_lantern_grotto.chamber, byId.whispering_root_hollow.chamber, -18, -1.6),
    3.6,
    5.8,
  ),
  // Tunnel 2: Jade Lantern Grotto <-> Subterranean Rotunda
  makePolylineCorridor(
    'tunnel_grotto_to_rotunda',
    bendWaypoints(byId.jade_lantern_grotto.chamber, WOLFVEIL_CAVE_HUB, 15, -1.4),
    3.8,
    6.0,
  ),
  // Tunnel 3: Whispering Root Hollow <-> Subterranean Rotunda
  makePolylineCorridor(
    'tunnel_roots_to_rotunda',
    bendWaypoints(byId.whispering_root_hollow.chamber, WOLFVEIL_CAVE_HUB, 14, -1.5),
    3.6,
    5.8,
  ),
  // Tunnel 4: Subterranean Rotunda <-> Sunken Inkstone Cistern
  makePolylineCorridor(
    'tunnel_rotunda_to_cistern',
    bendWaypoints(WOLFVEIL_CAVE_HUB, byId.sunken_inkstone_cistern.chamber, -16, -1.4),
    3.8,
    6.0,
  ),
  // Tunnel 5: Subterranean Rotunda <-> Echoing Crystal Vault (deep cross-valley gallery)
  makePolylineCorridor(
    'tunnel_rotunda_to_crystal',
    bendWaypoints(WOLFVEIL_CAVE_HUB, byId.echoing_crystal_vault.chamber, 22, -2.4),
    4.0,
    6.2,
  ),
]);

/**
 * Legacy cave mouth footprint used for decoration/QA ONLY. The overhead
 * terrain must not remove triangles here: one heightfield cannot represent
 * both an intact hillside roof and a separate underground cave floor.
 */
export function isWolfveilCaveMouthCutout(x, z) {
  for (const c of WOLFVEIL_EXPLORABLE_CAVES) {
    const rx = x - c.mouth[0], rz = z - c.mouth[1];
    const along = rx * c.dir[0] + rz * c.dir[1];
    const lateral = Math.abs(-rx * c.dir[1] + rz * c.dir[0]);
    if (along >= -0.8 && along <= 8.8 && lateral <= 3.75) return true;
  }
  return false;
}

/**
 * Evaluates cave containment & smooth floor elevation at Wolfveil-local (x, z).
 * Returns { inside, floorY, ceilingY, clearance } where clearance > 0 means inside.
 */
export function sampleWolfveilCaveSpace(x, z, margin = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  const consider = (clearance, floorY, ceilingY, kind) => {
    if (clearance < 0) return;
    if (!best || clearance > best.clearance) {
      best = { inside: true, clearance, floorY, ceilingY, kind };
    }
  };

  for (const ch of WOLFVEIL_CAVE_CHAMBERS) {
    const d = Math.hypot(x - ch.x, z - ch.z);
    const clear = ch.radius - margin - d;
    if (clear >= 0) {
      // Gentle bowl relief toward chamber rim, flat walkable center
      const rimLift = smooth((d - ch.radius * 0.65) / (ch.radius * 0.35)) * 0.25;
      consider(clear, ch.y + rimLift, ch.y + ch.ceiling, 'chamber');
    }
  }

  for (const cor of WOLFVEIL_CAVE_CORRIDORS) {
    const allowed = cor.halfWidth - margin;
    if (allowed <= 0) continue;
    for (const seg of cor.segments) {
      const len2 = seg.lenXZ * seg.lenXZ;
      const t = clamp(((x - seg.ax) * seg.dx + (z - seg.az) * seg.dz) / len2, 0, 1);
      const px = seg.ax + seg.dx * t;
      const pz = seg.az + seg.dz * t;
      const d = Math.hypot(x - px, z - pz);
      const clear = allowed - d;
      if (clear >= 0) {
        const y = seg.ay + seg.dy * t;
        consider(clear, y, y + cor.ceiling, cor.kind);
      }
    }
  }
  return best;
}

/**
 * Returns authoritative cave floor Y when an actor at local (x, y, z) is
 * actually travelling inside or entering a cave (never hijacks an actor walking
 * 25m overhead across the exterior mountain top).
 */
export function sampleWolfveilPlayerCaveFloorY(localX, currentY, localZ,
    {insideCave=false}={}) {
  const space = sampleWolfveilCaveSpace(localX, localZ, 0.15);
  if (!space || !Number.isFinite(currentY)) return null;
  // Critical waterfall fix: the old ceiling-only test accepted OUTDOOR feet
  // standing above some entrance passages as underground feet, causing an
  // immediate snap from the surface down into the cave. Use the canonical
  // terrain height as a distinct exterior layer, not just a cave ceiling.
  const outsideY=wolfveilHeight(localX,localZ);
  if(!insideCave && Number.isFinite(outsideY) &&
     currentY >= outsideY-0.75)return null;
  if (currentY <= space.ceilingY + 1.8 &&
      currentY >= space.floorY - 6.0) {
    return space.floorY;
  }
  return null;
}

// Closed 2.5D surface + E-interaction at the existing modeled cave arch.
// The existing subterranean rooms and connected corridors stay on their
// original coordinates; entry/exit never needs a missing terrain polygon.
export function planWolfveilCaveInteraction(localPosition,{insideCave=false,radius=5.1}={}) {
  if(!localPosition||![localPosition.x,localPosition.y,localPosition.z,radius]
    .every(Number.isFinite)||radius<=0)return null;
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    // Entry lands safely past the rock arch, while the return interaction
    // is INSIDE that same arch. A player walks back toward daylight and uses
    // E there instead of finding a teleport button 13 metres inside a room.
    const insideX=mx+dx*13,insideZ=mz+dz*13;
    const exitX=mx+dx*3,exitZ=mz+dz*3;
    if(insideCave){
      if(Math.hypot(localPosition.x-exitX,localPosition.z-exitZ)>radius)
        continue;
      return {
        action:'exit',caveId:cave.id,name:cave.name,
        x:cave.threshold[0],y:cave.threshold[1]+0.12,z:cave.threshold[2],
      };
    }
    if(Math.hypot(localPosition.x-cave.threshold[0],
      localPosition.z-cave.threshold[2])>radius)continue;
    // The opening is an interaction at walking height, not a vertical trigger
    // that a character on a cliff far above/below can activate.
    if(Math.abs(localPosition.y-cave.threshold[1])>2.25)continue;
    const space=sampleWolfveilCaveSpace(insideX,insideZ,0.75);
    if(!space)continue;
    return {
      action:'enter',caveId:cave.id,name:cave.name,
      x:insideX,y:space.floorY+0.1,z:insideZ,
    };
  }
  return null;
}

/**
 * Keeps an underground explorer inside the union of chambers & tunnels, while
 * allowing free exit out through the 4 exterior cave thresholds.
 */
export function resolveWolfveilCaveWallCollision(localPos, prevLocalPos, radius = 0.62) {
  if (!localPos || !prevLocalPos) return false;
  // Called only for an active cave explorer. The outer mountain is sealed:
  // leaving via a tunnel mouth is a deliberate E-portal, not free movement
  // through the retained surface terrain. Check footprint, not ceiling Y,
  // because entrance gradients can cross close to the natural hillside.
  if(!sampleWolfveilCaveSpace(prevLocalPos.x,prevLocalPos.z,radius))return false;
  const nowSpace = sampleWolfveilCaveSpace(localPos.x, localPos.z, radius);
  if (nowSpace) return false;

  // Try axis slide before full revert so curved tunnel walls feel buttery smooth
  const slideX = sampleWolfveilCaveSpace(localPos.x, prevLocalPos.z, radius);
  if (slideX) {
    localPos.z = prevLocalPos.z;
    return true;
  }
  const slideZ = sampleWolfveilCaveSpace(prevLocalPos.x, localPos.z, radius);
  if (slideZ) {
    localPos.x = prevLocalPos.x;
    return true;
  }
  localPos.x = prevLocalPos.x;
  localPos.z = prevLocalPos.z;
  return true;
}