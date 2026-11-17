// Ashroot Hollow — the walkable cave from the mouth inward.
// Floors, walls and collision all read caveLayout.js. Materials come from
// createCaveMaterials so the material pass can replace them in one place.
//
// Interior meshes live on BOOK_CAVE_LIGHT_LAYER. The sun stays on layer 0,
// so the cave is lit by a handful of pooled torches and crystals plus one
// dim cave ambient. The stone sill and the outer arch stay on layer 0:
// they are the socket the approach path walks onto.

import * as THREE from 'three';
import { WolfveilTriangles } from '../wolfveil/WolfveilGeometry.js';
import { createCaveMaterials } from './materials/createCaveMaterials.js';
import {
  CAVE_WORLD_OFFSET_Z,
  CAVE_PILLARS,
  CAVE_BUILT_SPANS,
  entrance,
  hallway,
  hub,
  farmSpots,
  treasureSpots,
  bossArenas,
  raidArea,
  dungeonBossChamber,
  hallwayHalfWidth,
  hallwayCeiling,
  sampleBookCaveSpace,
  sampleBookCavePlayerFloorY,
  resolveBookCaveWallCollision,
  CAVE_INTERNALS,
} from './caveLayout.js';

export const BOOK_CAVE_LIGHT_LAYER = 2;
const LIGHT_POOL = 6;
const TAU = Math.PI * 2;

const { hallwayCorridor, raidNeck, dungeonNeck, dirX, dirZ, sideX, sideZ } = CAVE_INTERNALS;

const ZONES = [...farmSpots, ...treasureSpots, ...bossArenas, raidArea, dungeonBossChamber];

function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}
function onCaveLayer(object) {
  object.layers.set(BOOK_CAVE_LIGHT_LAYER);
  object.traverse((child) => child.layers.set(BOOK_CAVE_LIGHT_LAYER));
  return object;
}
function decorate(mesh, name) {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  return mesh;
}

function floorTint(x, z) {
  let color = [0.46, 0.43, 0.38];
  const along = (x - entrance.x) * dirX + (z - entrance.z) * dirZ;
  if (along >= 0 && along < 12 && Math.abs((x - entrance.x) * sideX + (z - entrance.z) * sideZ) < 4) {
    color = mix(color, [0.62, 0.46, 0.34], 0.55);
  }
  for (const zone of ZONES) {
    const distance = Math.hypot(x - zone.x, z - zone.z);
    if (distance >= zone.radius) continue;
    const weight = (1 - distance / zone.radius) * 0.62;
    color = mix(color, rgb(zone.tint), weight);
  }
  const wave = 0.96 + 0.04 * Math.sin(x * 0.17 + z * 0.05) * Math.cos(z * 0.13);
  return color.map((channel) => channel * wave);
}

function rockTint(x, y, z) {
  const n = hash(x * 0.33, z * 0.33 + y);
  const damp = hash(x * 1.4 + 2, z * 1.1) > 0.78 ? 0.22 : 0;
  return [
    (0.42 + n * 0.28) * (1 - damp),
    (0.4 + n * 0.22) * (1 - damp * 0.35),
    (0.36 + n * 0.18) * (1 + damp * 0.45),
  ];
}

function brickTint(x, y, z) {
  const course = 0.9 + (Math.floor(y * 3.2) % 2) * 0.08;
  const n = 0.92 + hash(x * 2.1, z * 2.1 + y) * 0.14;
  return [0.72 * course * n, 0.48 * course * n, 0.34 * course * n];
}

function addCorridorFloor(tris, corridor) {
  for (const seg of corridor.segments) {
    const cuts = Math.max(1, Math.ceil(seg.len / 2));
    const len = seg.len || 1;
    const fx = seg.dx / len;
    const fz = seg.dz / len;
    const sx = -fz;
    const sz = fx;
    for (let i = 0; i < cuts; i++) {
      const bleed = 0.12 / len;
      const t0 = i / cuts - (i === 0 ? 0 : bleed);
      const t1 = (i + 1) / cuts + (i + 1 === cuts ? bleed : 0);
      const span = 4;
      for (let s = 0; s < span; s++) {
        const u0 = -1 + (2 * s) / span;
        const u1 = -1 + (2 * (s + 1)) / span;
        const at = (t, u) => {
          const x = seg.ax + seg.dx * t + sx * (seg.halfWidth + 1.15) * u;
          const y = seg.ay + seg.dy * t;
          const z = seg.az + seg.dz * t + sz * (seg.halfWidth + 1.15) * u;
          return [x, y, z];
        };
        const mid = at((t0 + t1) / 2, (u0 + u1) / 2);
        tris.quad(at(t0, u0), at(t0, u1), at(t1, u1), at(t1, u0), floorTint(mid[0], mid[2]), [
          [0, 0], [1, 0], [1, 1], [0, 1],
        ]);
      }
    }
  }
}

function ellipsePoint(u, v) {
  return [
    hub.x + dirX * u + sideX * v,
    hub.floorY,
    hub.z + dirZ * u + sideZ * v,
  ];
}

function addHubFloor(tris) {
  const rings = 7;
  const segments = 56;
  for (let ring = 0; ring < rings; ring++) {
    const r0 = (ring / rings) * 1.12;
    const r1 = ((ring + 1) / rings) * 1.12;
    for (let step = 0; step < segments; step++) {
      const a0 = (step / segments) * TAU;
      const a1 = ((step + 1) / segments) * TAU;
      const at = (radial, angle) => ellipsePoint(
        Math.cos(angle) * hub.radiusX * radial,
        Math.sin(angle) * hub.radiusZ * radial,
      );
      const mid = at((r0 + r1) / 2, (a0 + a1) / 2);
      tris.quad(at(r0, a0), at(r0, a1), at(r1, a1), at(r1, a0), floorTint(mid[0], mid[2]));
    }
  }
}

function addDisc(tris, cx, cz, radius, y, segments = 28) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const b = [cx + Math.cos(a0) * radius, y, cz + Math.sin(a0) * radius];
    const c = [cx + Math.cos(a1) * radius, y, cz + Math.sin(a1) * radius];
    tris.tri([cx, y, cz], b, c, floorTint((b[0] + c[0]) / 2, (b[2] + c[2]) / 2));
  }
}

function corridorFrames(corridor, ceilingAt) {
  const frames = [];
  for (const seg of corridor.segments) {
    const steps = Math.max(1, Math.ceil(seg.len / 2.1));
    const len = seg.len || 1;
    for (let i = 0; i <= steps; i++) {
      if (frames.length && i === 0) continue;
      const t = i / steps;
      const x = seg.ax + seg.dx * t;
      const y = seg.ay + seg.dy * t;
      const z = seg.az + seg.dz * t;
      frames.push({
        x, y, z,
        sideX: -seg.dz / len,
        sideZ: seg.dx / len,
        half: seg.halfWidth,
        ceiling: ceilingAt(seg.start + t * seg.len, y),
        along: seg.start + t * seg.len,
      });
    }
  }
  return frames;
}

function brickAmount(frame, style) {
  if (style === 'brick') return 1;
  if (style === 'rock') return 0;
  if (frame.along <= 11) return 1;
  if (frame.along >= 16) return 0;
  return 1 - (frame.along - 11) / 5;
}

function archVertex(frame, angle, style) {
  const built = brickAmount(frame, style);
  const wobble = (1 - built) * (0.2 + 0.95 * hash(frame.along * 0.63 + angle * 2.2, frame.along * 0.17));
  const swell = (1 - built) * Math.sin(frame.along * 0.21) * 0.35;
  let ledge = 0;
  if (built < 0.5 && Math.abs(angle - 0.62) < 0.11 && Math.floor(frame.along / 11) % 2 === 0) ledge = 0.7;
  if (built < 0.5 && Math.abs(angle - (Math.PI - 0.62)) < 0.11 && Math.floor(frame.along / 11) % 2 === 1) ledge = 0.65;
  const radius = frame.half + 0.08 * built + 0.2 * (1 - built) + wobble + swell + ledge;
  const rise = Math.sin(angle) * frame.ceiling * (0.9 + 0.08 * built + (1 - built) * 0.2 * hash(frame.along, angle));
  const lateral = Math.cos(angle);
  return [
    frame.x + frame.sideX * lateral * radius,
    frame.y - 0.22 + rise,
    frame.z + frame.sideZ * lateral * radius,
  ];
}

function addArch(rockTris, brickTris, frames, style = 'auto') {
  const steps = 11;
  for (let i = 0; i < frames.length - 1; i++) {
    const built = brickAmount(frames[i], style) > 0.45;
    const tris = built ? brickTris : rockTris;
    const tint = built ? brickTint : rockTint;
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * Math.PI;
      const a1 = ((s + 1) / steps) * Math.PI;
      const p00 = archVertex(frames[i], a0, style);
      const p01 = archVertex(frames[i], a1, style);
      const p11 = archVertex(frames[i + 1], a1, style);
      const p10 = archVertex(frames[i + 1], a0, style);
      const mid = [
        (p00[0] + p11[0]) / 2,
        (p00[1] + p11[1]) / 2,
        (p00[2] + p11[2]) / 2,
      ];
      tris.quad(p00, p01, p11, p10, tint(mid[0], mid[1], mid[2]));
    }
  }
}

function domeHeight(radial) {
  const spring = 5.45;
  const crown = Math.max(spring + 1.2, hub.ceiling);
  return spring + (1 - Math.min(1, radial)) * (crown - spring);
}

function addHubShell(rockTris) {
  const segments = 64;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU - Math.PI;
    const a1 = ((i + 1) / segments) * TAU - Math.PI;
    const mid = (a0 + a1) / 2;
    const outsideU = Math.cos(mid) * (hub.radiusX + 1.35);
    const outsideV = Math.sin(mid) * (hub.radiusZ + 1.35);
    const ox = hub.x + dirX * outsideU + sideX * outsideV;
    const oz = hub.z + dirZ * outsideU + sideZ * outsideV;
    const outside = sampleBookCaveSpace(ox, oz, 0);
    if (outside && outside.kind !== 'hub') continue;
    const wobble = 0.08 + 0.55 * hash(Math.cos(mid) * 4.2, Math.sin(mid) * 3.1);
    const height = 5.7 + hash(i * 1.7, 2.2) * 1.6;
    const at = (angle, lift, extra) => {
      const u = Math.cos(angle) * (hub.radiusX + extra);
      const v = Math.sin(angle) * (hub.radiusZ + extra);
      return [
        hub.x + dirX * u + sideX * v,
        hub.floorY + lift,
        hub.z + dirZ * u + sideZ * v,
      ];
    };
    const tint = rockTint(ox, hub.floorY + height * 0.5, oz);
    rockTris.quad(
      at(a0, -0.25, wobble),
      at(a1, -0.25, wobble),
      at(a1, height, wobble * 0.35),
      at(a0, height, wobble * 0.35),
      tint,
    );
    if (hash(i, 9) > 0.62) {
      const shelf = at(mid, 1.35 + hash(i, 4) * 0.4, wobble + 0.15);
      const lip = at(mid, 1.5, wobble + 0.85);
      rockTris.quad(
        at(a0, 1.25, wobble),
        at(a1, 1.25, wobble),
        [lip[0], lip[1], lip[2]],
        [shelf[0], shelf[1], shelf[2]],
        rockTint(shelf[0], shelf[1], shelf[2]),
      );
    }
  }
  const rings = 6;
  const segmentsDome = 48;
  for (let ring = 0; ring < rings; ring++) {
    const r0 = ring / rings;
    const r1 = (ring + 1) / rings;
    for (let step = 0; step < segmentsDome; step++) {
      const a0 = (step / segmentsDome) * TAU;
      const a1 = ((step + 1) / segmentsDome) * TAU;
      const at = (radial, angle) => {
        const u = Math.cos(angle) * hub.radiusX * radial;
        const v = Math.sin(angle) * hub.radiusZ * radial;
        return [
          hub.x + dirX * u + sideX * v,
          hub.floorY + domeHeight(radial),
          hub.z + dirZ * u + sideZ * v,
        ];
      };
      const mid = at((r0 + r1) / 2, (a0 + a1) / 2);
      const tint = rockTint(mid[0], mid[1], mid[2]).map((channel) => channel * 0.72);
      rockTris.quad(at(r0, a0), at(r1, a0), at(r1, a1), at(r0, a1), tint);
    }
  }
}

function addRoundChamber(tris, zone, ceiling, built, gapIds) {
  const segments = 36;
  const tint = built ? brickTint : rockTint;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const mid = (a0 + a1) / 2;
    const wobble = built ? 0.06 : 0.2 + 0.7 * hash(zone.x + Math.cos(mid), zone.z + Math.sin(mid));
    const radius = zone.radius + wobble;
    const wx = zone.x + Math.cos(mid) * (radius + 0.8);
    const wz = zone.z + Math.sin(mid) * (radius + 0.8);
    const space = sampleBookCaveSpace(wx, wz, 0);
    if (space && gapIds.includes(space.id)) continue;
    const height = ceiling + (built ? 0.15 : hash(i, zone.x) * 0.8);
    const at = (angle, lift) => [
      zone.x + Math.cos(angle) * radius,
      zone.floorY + lift,
      zone.z + Math.sin(angle) * radius,
    ];
    tris.quad(at(a0, -0.2), at(a1, -0.2), at(a1, height), at(a0, height), tint(wx, zone.floorY + height * 0.5, wz));
  }
  const roofSteps = 20;
  for (let i = 0; i < roofSteps; i++) {
    const a0 = (i / roofSteps) * TAU;
    const a1 = ((i + 1) / roofSteps) * TAU;
    const y = zone.floorY + ceiling;
    tris.tri(
      [zone.x, y, zone.z],
      [zone.x + Math.cos(a0) * zone.radius, y, zone.z + Math.sin(a0) * zone.radius],
      [zone.x + Math.cos(a1) * zone.radius, y, zone.z + Math.sin(a1) * zone.radius],
      tint(zone.x, y, zone.z).map((channel) => channel * 0.7),
    );
  }
}

function spawnInstances(geometry, material, items) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function buildDressing(materials, lights, solidRock) {
  const crystals = [];
  const warmCrystals = [];
  const stalactites = [];
  const stalagmites = [];
  const torches = [];
  const flames = [];
  const posts = [];

  const placeTorch = (x, y, z, color = 0xff9a45) => {
    posts.push({ x, y: y + 0.55, z, sx: 0.09, sy: 1.15, sz: 0.09, ry: hash(x, z) });
    flames.push({ x, y: y + 1.4, z, sx: 0.18, sy: 0.38, sz: 0.18 });
    lights.push({ x, y: y + 1.7, z, color, intensity: 26, distance: 20 });
  };
  const pushCrystal = (list, x, y, z, scale, tilt) => {
    list.push({
      x, y, z,
      sx: scale * (0.7 + hash(x, z) * 0.6),
      sy: scale * (1.4 + hash(z, x) * 1.8),
      sz: scale * (0.7 + hash(x + 2, z) * 0.5),
      rx: tilt, ry: hash(x, z) * TAU, rz: -tilt * 0.6,
    });
  };

  for (let i = 0; i < hallway.waypoints.length - 1; i++) {
    const a = hallway.waypoints[i];
    const b = hallway.waypoints[i + 1];
    const along = hallwayCorridor.segments[i]?.start ?? 0;
    if (along < 6) continue;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len;
    const sz = dx / len;
    const side = i % 2 === 0 ? 1 : -1;
    const half = hallwayHalfWidth(along) - 0.05;
    const x = a[0] + sx * side * half;
    const z = a[2] + sz * side * half;
    const y = a[1];
    if (!sampleBookCaveSpace(x, z, 0)) continue;
    placeTorch(x, y, z);
    torches.push({ x, y: y + 1.45, z });
    if (hash(x, z + 4) > 0.45) {
      const drop = 0.8 + hash(x + 1, z) * 1.1;
      stalactites.push({
        x: x - sx * side * 0.35,
        y: y + hallwayCeiling(along) - drop * 0.5,
        z: z - sz * side * 0.35,
        sx: 0.22 + hash(z, x) * 0.16,
        sy: drop,
        sz: 0.22,
        rx: Math.PI,
      });
    }
    if (hash(z, x) > 0.55) {
      const h = 0.45 + hash(x, z + 8) * 0.7;
      stalagmites.push({
        x: x + sx * side * 0.15,
        y: y + h * 0.5,
        z: z + sz * side * 0.15,
        sx: 0.28, sy: h, sz: 0.28,
      });
    }
  }

  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * TAU;
    const radial = 0.78 + (i % 3) * 0.05;
    const u = Math.cos(angle) * hub.radiusX * radial;
    const v = Math.sin(angle) * hub.radiusZ * radial;
    const [x, , z] = ellipsePoint(u, v);
    if (ZONES.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + 0.4)) continue;
    if (Math.abs(v) < 5.2) continue;
    const ceiling = hub.floorY + domeHeight(Math.hypot(u / hub.radiusX, v / hub.radiusZ));
    const scale = 0.55 + hash(x, z) * 0.55;
    const list = i % 4 === 0 ? warmCrystals : crystals;
    pushCrystal(list, x, hub.floorY + scale * 0.8, z, scale, 0.25);
    if (i % 2 === 0) {
      lights.push({
        x, y: hub.floorY + 1.6, z,
        color: i % 4 === 0 ? 0xff9a45 : 0x7ad7ff,
        intensity: 20,
        distance: 18,
      });
    }
    const length = 1.1 + hash(z, x) * 1.4;
    stalactites.push({
      x, y: ceiling - length * 0.45, z,
      sx: 0.18, sy: length, sz: 0.18, rx: Math.PI,
    });
  }

  for (const zone of [...farmSpots, ...treasureSpots, ...bossArenas]) {
    for (let k = 0; k < 7; k++) {
      const angle = (k / 7) * TAU + hash(zone.x, zone.z);
      const x = zone.x + Math.cos(angle) * (zone.radius + 0.25);
      const z = zone.z + Math.sin(angle) * (zone.radius + 0.25);
      if (!sampleBookCaveSpace(x, z, 0.2)) continue;
      if (CAVE_PILLARS.some((pillar) => Math.hypot(pillar.x - x, pillar.z - z) < pillar.radius + 0.8)) continue;
      stalagmites.push({
        x, y: zone.floorY + 0.18, z,
        sx: 0.22 + hash(x, k) * 0.12,
        sy: 0.28 + hash(z, k) * 0.16,
        sz: 0.2,
        ry: angle,
      });
    }
  }

  for (const zone of treasureSpots) {
    const awayX = zone.x - hub.x;
    const awayZ = zone.z - hub.z;
    const away = Math.hypot(awayX, awayZ) || 1;
    const x = zone.x + (awayX / away) * (zone.radius + 0.3);
    const z = zone.z + (awayZ / away) * (zone.radius + 0.3);
    if (sampleBookCaveSpace(x, z, 0)) {
      pushCrystal(crystals, x, zone.floorY + 0.7, z, 0.42, 0.4);
      lights.push({ x, y: zone.floorY + 1.4, z, color: zone.tint, intensity: 12, distance: 11 });
    }
  }

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * TAU + 0.35;
    const u = Math.cos(angle) * 22;
    const v = Math.sin(angle) * 16;
    if (Math.abs(v) < 5.5) continue;
    const [x, y, z] = ellipsePoint(u, v);
    if (ZONES.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + 1.2)) continue;
    if (CAVE_PILLARS.some((pillar) => Math.hypot(pillar.x - x, pillar.z - z) < 2.2)) continue;
    placeTorch(x, y, z, i % 2 ? 0xffb15a : 0xff8a3c);
  }
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU;
    placeTorch(
      raidArea.x + Math.cos(angle) * (raidArea.radius - 0.7),
      raidArea.floorY,
      raidArea.z + Math.sin(angle) * (raidArea.radius - 0.7),
      0xc7b0ff,
    );
    pushCrystal(
      crystals,
      raidArea.x + Math.cos(angle) * (raidArea.radius - 2.2),
      raidArea.floorY + 1.2,
      raidArea.z + Math.sin(angle) * (raidArea.radius - 2.2),
      0.55,
      0.35,
    );
  }
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU + 0.3;
    placeTorch(
      dungeonBossChamber.x + Math.cos(angle) * (dungeonBossChamber.radius - 0.75),
      dungeonBossChamber.floorY,
      dungeonBossChamber.z + Math.sin(angle) * (dungeonBossChamber.radius - 0.75),
      0xff6a42,
    );
  }
  lights.push({
    x: hub.x, y: hub.floorY + 5.2, z: hub.z,
    color: 0xffd2a8, intensity: 28, distance: 36,
  });

  const geos = {
    crystal: new THREE.OctahedronGeometry(0.45, 0),
    spike: new THREE.ConeGeometry(0.35, 1, 6),
    post: new THREE.CylinderGeometry(1, 1, 1, 6),
    flame: new THREE.ConeGeometry(1, 1, 6),
  };
  const meshes = [
    spawnInstances(geos.crystal, materials.crystal, crystals),
    spawnInstances(geos.crystal, materials.crystalWarm, warmCrystals),
    spawnInstances(geos.spike, solidRock, stalactites),
    spawnInstances(geos.spike, solidRock, stalagmites),
    spawnInstances(geos.post, materials.wood, posts),
    spawnInstances(geos.flame, materials.flame, flames),
  ].filter(Boolean);
  return { meshes, geos, torchCount: torches.length };
}

function addPortal(group, materials) {
  // A short brick hood in front of the arch, on both the sun layer and the
  // cave-light layer, so the mouth reads outside and inside.
  const tris = new WolfveilTriangles();
  const frame = {
    x: entrance.x - dirX * 0.8,
    y: entrance.y,
    z: entrance.z - dirZ * 0.8,
    sideX, sideZ,
    half: entrance.openingHalfWidth,
    ceiling: entrance.openingHeight,
    along: 0,
  };
  const outer = { ...frame, x: frame.x - dirX * 1.4, z: frame.z - dirZ * 1.4 };
  const steps = 10;
  for (let s = 0; s < steps; s++) {
    const a0 = (s / steps) * Math.PI;
    const a1 = ((s + 1) / steps) * Math.PI;
    const p00 = archVertex(frame, a0, 'brick');
    const p01 = archVertex(frame, a1, 'brick');
    const p11 = archVertex(outer, a1, 'brick');
    const p10 = archVertex(outer, a0, 'brick');
    tris.quad(p00, p01, p11, p10, brickTint(p00[0], p00[1], p00[2]));
  }
  const mesh = new THREE.Mesh(tris.geometry(), materials.brick);
  decorate(mesh, 'BookCave_MouthArch');
  mesh.layers.enable(0);
  mesh.layers.enable(BOOK_CAVE_LIGHT_LAYER);
  group.add(mesh);
  return [mesh.geometry];
}

function addSill(materials) {
  const tris = new WolfveilTriangles();
  const half = entrance.sillHalfWidth;
  const cuts = 6;
  for (let i = 0; i < cuts; i++) {
    const t0 = i / cuts;
    const t1 = (i + 1) / cuts;
    const at = (t, side) => {
      const x = entrance.outer.x + (entrance.x - entrance.outer.x) * t;
      const z = entrance.outer.z + (entrance.z - entrance.outer.z) * t;
      const y = entrance.outer.y + (entrance.y - entrance.outer.y) * t + 0.035 * (1 - t);
      return [
        x + sideX * side * half,
        y,
        z + sideZ * side * half,
      ];
    };
    tris.quad(at(t0, -1), at(t0, 1), at(t1, 1), at(t1, -1), [0.62, 0.5, 0.38]);
  }
  const mesh = new THREE.Mesh(tris.geometry(), materials.brick);
  mesh.name = 'BookCave_EntranceSill';
  mesh.receiveShadow = true;
  mesh.userData = { walkable: true, caveSill: true, clientGroundRaycast: true, notServerAuthority: true };
  mesh.layers.set(0);
  return mesh;
}

function addPillars(materials, solidRock) {
  const meshes = [];
  const geos = [];
  CAVE_PILLARS.forEach((pillar, index) => {
    const height = pillar.height * (0.86 + (index % 3) * 0.08);
    const shaft = new THREE.CylinderGeometry(pillar.radius * 0.92, pillar.radius, height, 8);
    const mesh = new THREE.Mesh(shaft, solidRock);
    mesh.position.set(pillar.x, pillar.y + height / 2, pillar.z);
    decorate(mesh, pillar.id);
    onCaveLayer(mesh);
    meshes.push(mesh);
    geos.push(shaft);
    const cap = new THREE.BoxGeometry(pillar.radius * 2.3, 0.22, pillar.radius * 2.3);
    const capital = new THREE.Mesh(cap, materials.brickSolid);
    capital.position.set(pillar.x, pillar.y + height + 0.08, pillar.z);
    decorate(capital, `${pillar.id}_cap`);
    onCaveLayer(capital);
    meshes.push(capital);
    geos.push(cap);
  });
  return { meshes, geos };
}

export function createBookCaveInterior(world, { offsetZ = CAVE_WORLD_OFFSET_Z } = {}) {
  const group = new THREE.Group();
  group.name = 'BookCave_AshrootHollow';
  world.mesh(group);

  const materials = createCaveMaterials();
  const floorTris = new WolfveilTriangles();
  const rockTris = new WolfveilTriangles();
  const brickTris = new WolfveilTriangles();
  const lights = [];

  addCorridorFloor(floorTris, hallwayCorridor);
  addCorridorFloor(floorTris, raidNeck);
  addCorridorFloor(floorTris, dungeonNeck);
  addHubFloor(floorTris);
  addDisc(floorTris, raidArea.x, raidArea.z, raidArea.radius, hub.floorY + 0.012);
  addDisc(floorTris, dungeonBossChamber.x, dungeonBossChamber.z, dungeonBossChamber.radius, hub.floorY + 0.012, 24);

  const hallFrames = corridorFrames(hallwayCorridor, (along) => hallwayCeiling(along));
  addArch(rockTris, brickTris, hallFrames, 'auto');
  addArch(rockTris, brickTris, corridorFrames(raidNeck, () => 6.2), 'rock');
  addArch(rockTris, brickTris, corridorFrames(dungeonNeck, () => 5.6), 'brick');
  addHubShell(rockTris);
  addRoundChamber(rockTris, raidArea, 8.2, false, [raidNeck.id, hub.id]);
  addRoundChamber(brickTris, dungeonBossChamber, 7.6, true, [dungeonNeck.id, hub.id]);

  const floorMesh = decorate(new THREE.Mesh(floorTris.geometry(), materials.floor), 'BookCave_Floor');
  const rockMesh = decorate(new THREE.Mesh(rockTris.geometry(), materials.rock), 'BookCave_RockShell');
  const brickMesh = decorate(new THREE.Mesh(brickTris.geometry(), materials.brick), 'BookCave_BrickShell');
  onCaveLayer(floorMesh);
  onCaveLayer(rockMesh);
  onCaveLayer(brickMesh);
  group.add(floorMesh, rockMesh, brickMesh);

  const sill = addSill(materials);
  group.add(sill);
  world.walkableSurfaces ??= [];
  world.walkableSurfaces.push(sill);

  const portalGeos = addPortal(group, materials);
  const pillars = addPillars(materials, materials.rockSolid);
  for (const mesh of pillars.meshes) group.add(mesh);

  const dressing = buildDressing(materials, lights, materials.rockSolid);
  for (const mesh of dressing.meshes) {
    decorate(mesh, 'BookCave_Dressing');
    onCaveLayer(mesh);
    group.add(mesh);
  }

  const ambient = new THREE.HemisphereLight(0x3a4c62, 0x2a2218, 0.72);
  ambient.name = 'BookCave_Ambient';
  ambient.layers.set(BOOK_CAVE_LIGHT_LAYER);
  group.add(ambient);
  const mouthSpill = new THREE.PointLight(0xffb15a, 10, 9, 2);
  mouthSpill.position.set(
    entrance.x - dirX * 1.2,
    entrance.y + 2.1,
    entrance.z - dirZ * 1.2,
  );
  mouthSpill.name = 'BookCave_MouthSpill';
  mouthSpill.layers.set(0);
  group.add(mouthSpill);

  const pool = Array.from({ length: LIGHT_POOL }, (_, index) => {
    const light = new THREE.PointLight(0xff9a45, 0, 22, 1.45);
    light.name = `BookCave_PooledLight_${index}`;
    light.layers.set(BOOK_CAVE_LIGHT_LAYER);
    group.add(light);
    return light;
  });

  let elapsed = 0;
  const api = {
    group,
    entrance,
    hallway,
    hub,
    farmSpots,
    treasureSpots,
    bossArenas,
    raidArea,
    dungeonBossChamber,
    lightAnchorCount: lights.length,
    torchCount: dressing.torchCount,
    builtSpans: CAVE_BUILT_SPANS,
    playerGroundY(worldPos) {
      if (!worldPos) return null;
      return sampleBookCavePlayerFloorY(worldPos.x, worldPos.y, worldPos.z, offsetZ);
    },
    resolveCollision(worldPos, prevWorldPos, radius = 0.62) {
      if (!worldPos || !prevWorldPos) return false;
      const now = { x: worldPos.x, y: worldPos.y, z: worldPos.z - offsetZ };
      const prev = {
        x: prevWorldPos.x,
        y: prevWorldPos.y ?? worldPos.y,
        z: prevWorldPos.z - offsetZ,
      };
      const hit = resolveBookCaveWallCollision(now, prev, radius);
      if (hit) {
        worldPos.x = now.x;
        worldPos.z = now.z + offsetZ;
      }
      return hit;
    },
    update(dt, playerWorldPos) {
      elapsed += Math.max(0, Math.min(dt || 0, 0.1));
      materials.flame.emissiveIntensity = 1.85 + Math.sin(elapsed * 9.5) * 0.35;
      materials.crystal.emissiveIntensity = 1.2 + Math.sin(elapsed * 1.6) * 0.18;
      materials.crystalWarm.emissiveIntensity = 1.05 + Math.sin(elapsed * 2.1 + 1) * 0.15;
      if (!playerWorldPos || !Number.isFinite(playerWorldPos.x)) {
        for (const light of pool) light.intensity = 0;
        return;
      }
      const px = playerWorldPos.x;
      const pz = playerWorldPos.z - offsetZ;
      const ranked = lights
        .map((light) => ({ light, d2: (light.x - px) ** 2 + (light.z - pz) ** 2 }))
        .sort((a, b) => a.d2 - b.d2);
      for (let i = 0; i < pool.length; i++) {
        const pick = ranked[i];
        const light = pool[i];
        if (!pick || pick.d2 > 70 * 70) {
          light.intensity = 0;
          continue;
        }
        const distance = Math.sqrt(pick.d2);
        const fade = 1 - Math.min(1, Math.max(0, (distance - 28) / 42));
        const flicker = 0.9 + 0.1 * Math.sin(elapsed * 7 + i);
        light.position.set(pick.light.x, pick.light.y, pick.light.z);
        light.color.set(pick.light.color);
        light.distance = pick.light.distance;
        light.intensity = pick.light.intensity * fade * flicker;
      }
    },
    dispose() {
      floorMesh.geometry.dispose();
      rockMesh.geometry.dispose();
      brickMesh.geometry.dispose();
      sill.geometry.dispose();
      for (const geometry of portalGeos) geometry.dispose();
      for (const geometry of pillars.geos) geometry.dispose();
      for (const geometry of Object.values(dressing.geos)) geometry.dispose();
      materials.dispose();
    },
  };

  if (typeof window !== 'undefined') {
    window.__bookCave = {
      version: 1,
      entrance: { x: entrance.worldX, y: entrance.worldY, z: entrance.worldZ },
      hub: { x: hub.worldX, y: hub.worldY, z: hub.worldZ },
      raid: { x: raidArea.worldX, y: raidArea.worldY, z: raidArea.worldZ },
      dungeon: {
        x: dungeonBossChamber.worldX,
        y: dungeonBossChamber.worldY,
        z: dungeonBossChamber.worldZ,
      },
    };
  }
  return api;
}
