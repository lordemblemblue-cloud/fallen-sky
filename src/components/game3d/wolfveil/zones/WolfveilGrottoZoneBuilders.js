// Three.js builders for the Phase B grotto prototype (WolfveilGrottoZonePlan).
//
// Every object, geometry, material, texture, audio node and timer a zone
// builds is registered with its ZoneRuntime, so UNLOAD releases all of it.
// Lighting is baked into vertex colours and the materials are unlit: a zone
// adds NO scene lights, because changing the number of lights recompiles
// every shader program in the scene (a hitch on every transition).
//
// The CPU-side geometry arrays can be prepared ahead of time (APPROACH_GATE
// prefetch) in a small bounded cache; that cache holds plain typed arrays
// only, never Three.js objects or GPU resources.
//
// Positions are Wolfveil LOCAL metres; the caller parents zone roots under a
// group that carries the +70 m world Z offset.
import * as THREE from 'three';
import {MeshBVH, acceleratedRaycast} from 'three-mesh-bvh';
import {GROTTO_PLAN, grottoFramePoint, grottoFrameYaw} from './WolfveilGrottoZonePlan.mjs';
import {wolfveilHeight} from '../WolfveilLayout.js';

const plan = GROTTO_PLAN;
const [FX, FZ] = plan.dir, [SX, SZ] = plan.side;
const frameVec = (da, dl) => ({x: FX * da + SX * dl, z: FZ * da + SZ * dl});
const door = plan.door;
const doorNormal = frameVec(door.normal.a, door.normal.l);          // hall -> chamber
// lateral x up = normal: a proper (right-handed) basis for the door group.
const doorLateral = {x: doorNormal.z, z: -doorNormal.x};

function rockNoise(x, y, z) {
  return .18 * Math.sin(x * 1.7 + z * .9 + y * 1.3) + .12 * Math.sin(z * 2.3 - x * 1.1 + y * .7) +
    .07 * Math.sin(x * 4.1 + y * 3.3 - z * 2.9);
}
// Baked light: warm lanterns, a cool jade glow in the chamber, dark corners.
function bakeLight(x, y, z, lanterns, {ambient = .2, tint = [1, .78, .52], reach = 2.6} = {}) {
  let r = ambient, g = ambient, b = ambient * 1.08;
  for (const lantern of lanterns) {
    const d2 = (x - lantern.x) ** 2 + (y - lantern.y) ** 2 + (z - lantern.z) ** 2;
    const k = 1.25 * Math.exp(-d2 / (2 * reach * reach)); // a pool of light, dark between lanterns
    r += tint[0] * k; g += tint[1] * k; b += tint[2] * k;
  }
  return [Math.min(1.5, r), Math.min(1.5, g), Math.min(1.5, b)];
}

// ------------------------------------------------------------ CPU arrays
function surface(name, material) {
  return {name, material, positions: [], colors: [], uvs: [], indices: []};
}
function pushVertex(s, x, y, z, rgb, u, v) {
  s.positions.push(x, y, z); s.colors.push(...rgb); s.uvs.push(u, v);
  return s.positions.length / 3 - 1;
}
// A flat grid in a vertical plane (origin o, lateral axis t, up), skipping
// cells inside `hole` ({u0,u1,v0,v1}). Grid lines include the hole edges.
function planeGrid(s, {o, t, lines: [us, vs], hole = null, base, lanterns, push = 0, normal}) {
  const idx = [];
  for (let j = 0; j < vs.length; j++) {
    idx.push([]);
    for (let i = 0; i < us.length; i++) {
      const u = us[i], v = vs[j];
      const edge = i === 0 || j === 0 || i === us.length - 1 || j === vs.length - 1;
      const x0 = o.x + t.x * u, z0 = o.z + t.z * u, y = o.y + v;
      const n = edge ? 0 : rockNoise(x0, y, z0) * .35 + push;
      const x = x0 + normal.x * n, z = z0 + normal.z * n;
      const light = bakeLight(x, y, z, lanterns);
      idx[j].push(pushVertex(s, x, y, z, light.map((c, k) => c * base[k]), u * .5, v * .5));
    }
  }
  for (let j = 0; j < vs.length - 1; j++)
    for (let i = 0; i < us.length - 1; i++) {
      const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2;
      if (hole && cu > hole.u0 && cu < hole.u1 && cv > hole.v0 && cv < hole.v1) continue;
      const a = idx[j][i], b = idx[j][i + 1], c = idx[j + 1][i + 1], d = idx[j + 1][i];
      s.indices.push(a, b, c, a, c, d);
    }
}
const range = (from, to, step) => {
  const out = [];
  const n = Math.max(1, Math.round((to - from) / step));
  for (let i = 0; i <= n; i++) out.push(from + (to - from) * i / n);
  return out;
};
const ROCK = [.55, .58, .62], FLOOR = [.62, .58, .52];

function hallArrays() {
  const h = plan.hall, w = h.halfWidth, lanterns = h.lanterns;
  const nodes = h.nodes;
  // Resample the centreline every ~0.6 m with mitred tangents at the bends.
  const samples = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const p = nodes[i], q = nodes[i + 1];
    const len = Math.hypot(q.x - p.x, q.z - p.z), n = Math.max(1, Math.ceil(len / .6));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      samples.push({x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t, seg: i, t});
    }
  }
  let distance = 0;
  samples.forEach((sample, i) => {
    const prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    sample.lateral = {x: -tz, z: tx};
    // Mitre: keep the full width through a bend.
    const segDir = (index) => {
      const p = nodes[index], q = nodes[index + 1], l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      return {x: (q.x - p.x) / l, z: (q.z - p.z) / l};
    };
    const d = segDir(Math.min(sample.seg, nodes.length - 2));
    sample.miter = 1 / Math.max(.75, d.x * tx + d.z * tz);
    if (i > 0) distance += Math.hypot(sample.x - samples[i - 1].x, sample.z - samples[i - 1].z);
    sample.distance = distance;
  });
  // Profile (u lateral, v up): floor strip, then right wall, arch, left wall.
  const floorProfile = range(-w - .05, w + .05, .55).map(u => ({u, v: 0}));
  const wallProfile = [];
  for (const v of range(-.05, h.wallHeight, .5)) wallProfile.push({u: w, v, nu: 1, nv: 0});
  for (let k = 1; k < 12; k++) {
    const phi = k / 12 * Math.PI;
    wallProfile.push({u: w * Math.cos(phi), v: h.wallHeight + (h.ceiling - h.wallHeight) * Math.sin(phi),
      nu: Math.cos(phi), nv: Math.sin(phi)});
  }
  for (const v of range(h.wallHeight, -.05, .5)) wallProfile.push({u: -w, v, nu: -1, nv: 0});
  const floor = surface('WV_Zone_GrottoHall_Floor', 'floor');
  const walls = surface('WV_Zone_GrottoHall_Walls', 'rock');
  const sweep = (s, profile, base, displace) => {
    const rows = samples.map(sample => profile.map((p, j) => {
      const m = sample.miter;
      let x = sample.x + sample.lateral.x * p.u * m, z = sample.z + sample.lateral.z * p.u * m, y = sample.y + p.v;
      if (displace) {
        const n = rockNoise(x, y, z) * .32;
        x += sample.lateral.x * (p.nu || 0) * n * m; z += sample.lateral.z * (p.nu || 0) * n * m; y += (p.nv || 0) * n;
      }
      const light = bakeLight(x, y, z, lanterns);
      return pushVertex(s, x, y, z, light.map((c, k) => c * base[k]), j * .35, sample.distance * .5);
    }));
    for (let i = 0; i < rows.length - 1; i++)
      for (let j = 0; j < profile.length - 1; j++) {
        const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
        s.indices.push(a, b, c, a, c, d);
      }
  };
  sweep(floor, floorProfile, FLOOR, false);
  sweep(walls, wallProfile, ROCK, true);
  // End walls: the sealed exit door end and the inner door end (with hole).
  const ends = surface('WV_Zone_GrottoHall_EndWalls', 'rock');
  const first = samples[0], last = samples[samples.length - 1];
  planeGrid(ends, {
    o: {x: first.x, y: first.y, z: first.z}, t: first.lateral, normal: {x: -frameVec(1, 0).x, z: -frameVec(1, 0).z},
    lines: [range(-w - .7, w + .7, .4), range(-.3, h.ceiling + .6, .4)], base: ROCK, lanterns,
  });
  const du = [-2.925, -2.6, -2.275, -1.95, -1.625, -1.3, -.975, -.65, -.325, 0, .325, .65, .975, 1.3, 1.625, 1.95, 2.275, 2.6, 2.925];
  planeGrid(ends, {
    o: {x: last.x, y: last.y, z: last.z}, t: doorLateral, normal: doorNormal,
    lines: [du, range(-.3, 4.2, .3)], hole: {u0: -door.halfWidth, u1: door.halfWidth, v0: -1, v1: door.height},
    base: ROCK, lanterns,
  });
  return {surfaces: [floor, walls, ends], samples: samples.length};
}

function chamberArrays() {
  const c = plan.chamber, centre = c.centre, R = c.radius, N = c.sides;
  const lanterns = c.lanterns;
  const doorAzimuth = Math.atan2(-doorNormal.z, -doorNormal.x);
  const corner = k => {
    const angle = doorAzimuth + Math.PI / N + k * 2 * Math.PI / N;
    return {x: centre.x + Math.cos(angle) * R, z: centre.z + Math.sin(angle) * R, angle};
  };
  const floor = surface('WV_Zone_GrottoChamber_Floor', 'floor');
  const walls = surface('WV_Zone_GrottoChamber_Walls', 'rock');
  const tint = (x, y, z, base) => bakeLight(x, y, z, lanterns, {tint: [.82, 1, .9]}).map((v, k) => v * base[k]);
  // Floor: concentric rings (flat walking surface).
  const rings = [0, .25, .5, .75, 1];
  const ringIdx = rings.map(f => {
    if (f === 0) return [pushVertex(floor, centre.x, c.floorY, centre.z, tint(centre.x, c.floorY, centre.z, FLOOR), .5, .5)];
    return Array.from({length: N * 2}, (_, k) => {
      const angle = doorAzimuth + Math.PI / N + k * Math.PI / N;
      const r = R * f * (k % 2 ? Math.cos(Math.PI / N) : 1) + .06;
      const x = centre.x + Math.cos(angle) * r, z = centre.z + Math.sin(angle) * r;
      return pushVertex(floor, x, c.floorY, z, tint(x, c.floorY, z, FLOOR), x * .25, z * .25);
    });
  });
  for (let k = 0; k < N * 2; k++) {
    const k1 = (k + 1) % (N * 2);
    floor.indices.push(ringIdx[0][0], ringIdx[1][k1], ringIdx[1][k]);
    for (let r = 1; r < rings.length - 1; r++) {
      const a = ringIdx[r][k], b = ringIdx[r][k1], cc = ringIdx[r + 1][k1], d = ringIdx[r + 1][k];
      floor.indices.push(a, cc, b, a, d, cc);
    }
  }
  // Walls: one grid per facet; facet 0 (centred on the door) has the doorway.
  for (let k = 0; k < N; k++) {
    const p = corner(k - 1), q = corner(k);
    const mid = {x: (p.x + q.x) / 2, z: (p.z + q.z) / 2};
    const half = Math.hypot(q.x - p.x, q.z - p.z) / 2;
    const t = {x: (q.x - p.x) / (2 * half), z: (q.z - p.z) / (2 * half)};
    const outward = {x: mid.x - centre.x, z: mid.z - centre.z};
    const ol = Math.hypot(outward.x, outward.z); outward.x /= ol; outward.z /= ol;
    const isDoor = k === 0;
    const us = isDoor
      ? [-half, -door.halfWidth - .2, -door.halfWidth, -.65, 0, .65, door.halfWidth, door.halfWidth + .2, half]
      : range(-half, half, .7);
    planeGrid(walls, {
      o: {x: mid.x, y: c.floorY - .05, z: mid.z}, t, normal: outward,
      lines: [us, range(0, c.wallHeight + .05, .5)],
      hole: isDoor ? {u0: -door.halfWidth, u1: door.halfWidth, v0: -1, v1: door.height + .05} : null,
      base: ROCK, lanterns, push: 0,
    });
  }
  // Dome: rings from the wall top to the apex.
  const domeRings = 6, domeIdx = [];
  for (let r = 0; r <= domeRings; r++) {
    const f = r / domeRings, radius = R * Math.cos(f * Math.PI / 2), y = c.floorY + c.wallHeight + (c.apex - c.wallHeight) * Math.sin(f * Math.PI / 2);
    if (r === domeRings) { domeIdx.push([pushVertex(walls, centre.x, y, centre.z, tint(centre.x, y, centre.z, ROCK), centre.x * .3, centre.z * .3)]); break; }
    domeIdx.push(Array.from({length: N}, (_, k) => {
      const p = corner(k - 1);
      let x = centre.x + Math.cos(p.angle) * radius, z = centre.z + Math.sin(p.angle) * radius, yy = y;
      if (r > 0) { const n = rockNoise(x, y, z) * .4; x += Math.cos(p.angle) * n; z += Math.sin(p.angle) * n; yy += n * .5; }
      return pushVertex(walls, x, yy, z, tint(x, yy, z, ROCK), x * .3, z * .3); // planar: no wrap seam
    }));
  }
  for (let r = 0; r < domeRings; r++)
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      if (r === domeRings - 1) { walls.indices.push(domeIdx[r][k], domeIdx[r][k1], domeIdx[r + 1][0]); continue; }
      const a = domeIdx[r][k], b = domeIdx[r][k1], cc = domeIdx[r + 1][k1], d = domeIdx[r + 1][k];
      walls.indices.push(a, b, cc, a, cc, d);
    }
  return {surfaces: [floor, walls]};
}

const PREFETCH_LIMIT = 2;
const prefetchCache = new Map();
const BUILDERS = {grotto_hall: hallArrays, grotto_chamber: chamberArrays};
/** Prepares (and caches, max two) the CPU geometry arrays of a zone. */
export function prefetchGrottoZoneArrays(zoneId) {
  if (!BUILDERS[zoneId]) throw new TypeError('Unknown grotto zone ' + zoneId);
  if (prefetchCache.has(zoneId)) {
    const hit = prefetchCache.get(zoneId);
    prefetchCache.delete(zoneId); prefetchCache.set(zoneId, hit);
    return hit;
  }
  const arrays = BUILDERS[zoneId]();
  for (const s of arrays.surfaces) {
    s.positions = new Float32Array(s.positions); s.colors = new Float32Array(s.colors);
    s.uvs = new Float32Array(s.uvs);
    s.indices = s.positions.length / 3 > 65535 ? new Uint32Array(s.indices) : new Uint16Array(s.indices);
  }
  prefetchCache.set(zoneId, arrays);
  while (prefetchCache.size > PREFETCH_LIMIT) prefetchCache.delete(prefetchCache.keys().next().value);
  return arrays;
}
export function grottoPrefetchCacheStats() {
  let bytes = 0;
  for (const arrays of prefetchCache.values())
    for (const s of arrays.surfaces) bytes += s.positions.byteLength + s.colors.byteLength + s.uvs.byteLength + s.indices.byteLength;
  return {entries: prefetchCache.size, bytes};
}
export function clearGrottoPrefetchCache() { prefetchCache.clear(); }

// ------------------------------------------------------------ Three.js
// Smooth, tileable value noise (no high-frequency stripes: those moire).
function tileNoise(x, y, cells, seed) {
  const hash = (i, j) => {
    const h = Math.sin(((i % cells + cells) % cells) * 127.1 + ((j % cells + cells) % cells) * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function rockTexture(seed) {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const n = .55 * tileNoise(x / 16, y / 16, 8, seed) + .3 * tileNoise(x / 8, y / 8, 16, seed + 1) +
        .15 * tileNoise(x / 4, y / 4, 32, seed + 2);
      const v = Math.max(0, Math.min(255, Math.round(96 + 104 * n)));
      const i = (y * size + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = Math.min(255, v + 5); data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.name = 'WV_Zone_RockDetail';
  return texture;
}
function meshFromSurface(zone, s, materials, {bvh = true} = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(s.colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(s.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(s.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (bvh) geometry.boundsTree = new MeshBVH(geometry, {maxLeafTris: 12});
  const mesh = new THREE.Mesh(geometry, materials[s.material]);
  mesh.name = s.name;
  if (bvh) mesh.raycast = acceleratedRaycast;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  zone.add(mesh);
  return mesh;
}
function zoneMaterials(zone, seed) {
  const texture = zone.own(rockTexture(seed), 'texture');
  // fog:false: the valley's daylight haze must not wash a sealed cave white.
  const make = (name, extra = {}) => zone.own(new THREE.MeshBasicMaterial({
    name, map: texture, vertexColors: true, side: THREE.DoubleSide, fog: false, ...extra}), 'material');
  return {rock: make('WV_Zone_Rock'), floor: make('WV_Zone_Floor'), texture};
}
function lantern(zone, at, {color = 0xffb35c, size = .32} = {}) {
  const group = new THREE.Group();
  group.name = 'WV_Zone_Lantern';
  const glow = new THREE.MeshBasicMaterial({name: 'WV_Zone_LanternGlow', color, toneMapped: false});
  const cage = new THREE.MeshBasicMaterial({name: 'WV_Zone_LanternCage', color: 0x2a211a});
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), glow);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(size * .9, size * 1.1, size * .5, 6), cage);
  cap.position.y = size * 1.05;
  group.add(core, cap);
  group.position.set(at.x, at.y, at.z);
  zone.add(group);
  return {group, glow, base: new THREE.Color(color)};
}
// A stone slab door on one side of the 0.3 m door wall. `side` 0 = hall
// half (signed 0..0.15), 1 = chamber half (0.15..0.3).
function doorHalf(zone, side, materials) {
  const group = new THREE.Group();
  group.name = side === 0 ? 'WV_Zone_InnerDoor_HallSide' : 'WV_Zone_InnerDoor_ChamberSide';
  const frameMaterial = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_DoorFrame', color: 0x6f6a62, map: materials.texture}), 'material');
  const slabMaterial = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_DoorSlab', color: 0x4e5a52, map: materials.texture}), 'material');
  const runeMaterial = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_DoorRunes', color: 0x5eead4, toneMapped: false}), 'material');
  const depth = door.wall / 2, offset = side === 0 ? depth / 2 : depth * 1.5;
  const inset = side === 0 ? 0 : .01; // the chamber half sits 1 cm wider: no coplanar faces
  const jamb = new THREE.BoxGeometry(.38 + inset, door.height + .4, depth);
  const lintel = new THREE.BoxGeometry(door.halfWidth * 2 + .8 + inset, .42, depth);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(jamb, frameMaterial);
    m.position.set(s * (door.halfWidth + .19 + inset / 2), (door.height + .4) / 2 - .05, 0);
    group.add(m);
  }
  const top = new THREE.Mesh(lintel, frameMaterial);
  top.position.set(0, door.height + .2, 0);
  group.add(top);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(door.halfWidth * 2 - .02, door.height - .02, depth * .8), slabMaterial);
  slab.position.set(0, door.height / 2, 0);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(.42, .04, 6, 24), runeMaterial);
  rune.position.set(0, door.height * .3, (side === 0 ? -1 : 1) * depth * .42); // sinks below the floor with the slab
  slab.add(rune);
  group.add(slab);
  // Door frame space: x = lateral, y = up, z = along the door normal.
  group.matrixAutoUpdate = true;
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(doorLateral.x, 0, doorLateral.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(doorNormal.x, 0, doorNormal.z));
  group.quaternion.setFromRotationMatrix(basis);
  group.position.set(door.x + doorNormal.x * offset, door.floorY, door.z + doorNormal.z * offset);
  zone.add(group);
  return {
    group,
    // The slab sinks into the floor (hidden under it) instead of rising
    // through the hall roof; a 5 cm stone lip stays as the threshold.
    set(open) { slab.position.y = door.height / 2 - Math.max(0, Math.min(1, open)) * (door.height - .05); },
  };
}

// --------------------------------------------------------------- audio
let sharedNoise = null;
function noiseBuffer(context) {
  if (sharedNoise?.context === context) return sharedNoise.buffer;
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) { last = last * .97 + (Math.random() * 2 - 1) * .03; data[i] = last * 6; }
  sharedNoise = {context, buffer}; // shared asset bytes: reused by every zone, never zone-owned
  return buffer;
}
function caveAmbience(zone, context, {gain = .035, drips = true} = {}) {
  if (!context?.createBufferSource) return null;
  const source = zone.own(context.createBufferSource(), 'audio');
  source.buffer = noiseBuffer(context);
  source.loop = true;
  const filter = zone.own(context.createBiquadFilter(), 'audio');
  filter.type = 'lowpass'; filter.frequency.value = 380;
  const level = zone.own(context.createGain(), 'audio');
  level.gain.value = gain;
  source.connect(filter); filter.connect(level); level.connect(context.destination);
  try { source.start(); } catch { /* suspended contexts still accept the node graph */ }
  const live = new Set();
  if (drips) zone.setInterval(() => {
    const osc = context.createOscillator(), env = context.createGain();
    osc.frequency.value = 900 + Math.random() * 700;
    env.gain.setValueAtTime(gain * 1.6, context.currentTime);
    env.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .22);
    osc.connect(env); env.connect(context.destination);
    live.add(osc); live.add(env);
    osc.onended = () => { osc.disconnect(); env.disconnect(); live.delete(osc); live.delete(env); };
    osc.start(); osc.stop(context.currentTime + .25);
  }, 2600);
  zone.onDispose(() => { for (const node of live) { try { node.stop?.(); } catch { /* ended */ } node.disconnect(); } live.clear(); });
  return {source, filter, level};
}

// --------------------------------------------------------------- zones
// Sealed interiors ignore the valley fog and are never shadowed by the sun.
function interiorOnly(zone) {
  zone.root.traverse(node => {
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) if (m) m.fog = false;
    node.castShadow = false; node.receiveShadow = false;
  });
}
export function buildGrottoHall(zone, {audio = null} = {}) {
  const arrays = prefetchGrottoZoneArrays('grotto_hall');
  const materials = zoneMaterials(zone, 3);
  for (const s of arrays.surfaces) meshFromSurface(zone, s, materials);
  const lanterns = plan.hall.lanterns.map(at => lantern(zone, at));
  // The sealed exit door with daylight in its cracks.
  const exit = new THREE.Group();
  exit.name = 'WV_Zone_GrottoHall_ExitDoor';
  const wood = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_ExitDoorWood', color: 0x5a4330, map: materials.texture}), 'material');
  const light = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_ExitDaylight', color: 0xfff1c8, toneMapped: false}), 'material');
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.7, .14), wood);
  leaf.position.y = 1.35;
  exit.add(leaf);
  for (const [x, y, w, h] of [[0, 2.74, 2.1, .05], [-1.03, 1.35, .05, 2.7], [1.03, 1.35, .05, 2.7], [0, 1.35, .04, 2.6]]) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(w, h, .16), light);
    crack.position.set(x, y, 0);
    exit.add(crack);
  }
  const start = plan.hall.nodes[0];
  exit.position.set(start.x + frameVec(.12, 0).x, start.y, start.z + frameVec(.12, 0).z);
  exit.rotation.y = grottoFrameYaw(1, 0);
  zone.add(exit);
  const doorSide = doorHalf(zone, 0, materials);
  let t = 0;
  zone.onUpdate(dt => {
    t += dt;
    lanterns.forEach((entry, i) => {
      const k = .86 + .14 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 3.1 + i);
      entry.glow.color.copy(entry.base).multiplyScalar(k);
    });
  });
  interiorOnly(zone);
  const sound = audio ? caveAmbience(zone, audio) : null;
  return {setDoor: open => doorSide.set(open), sound};
}

export function buildGrottoChamber(zone, {audio = null} = {}) {
  const arrays = prefetchGrottoZoneArrays('grotto_chamber');
  const materials = zoneMaterials(zone, 7);
  for (const s of arrays.surfaces) meshFromSurface(zone, s, materials);
  const c = plan.chamber;
  const lanterns = c.lanterns.map(at => lantern(zone, at, {color: 0x7df2cf, size: .28}));
  // Jade pool and crystals: the room's landmark.
  const poolMaterial = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_JadePool', color: 0x2fbfa0, transparent: true, opacity: .82, toneMapped: false}), 'material');
  const rimMaterial = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_PoolRim', color: 0x8c877d, map: materials.texture}), 'material');
  const crystalMaterial = zone.own(new THREE.MeshBasicMaterial({name: 'WV_Zone_Crystal', color: 0x5eead4, toneMapped: false}), 'material');
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), poolMaterial);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(c.centre.x, c.floorY + .06, c.centre.z);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.3, .22, 6, 32), rimMaterial);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(c.centre.x, c.floorY + .1, c.centre.z);
  zone.add(pool); zone.add(rim);
  const crystals = [];
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2 + 1.1, r = 6.4 + (i % 3) * .6;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.45 + (i % 2) * .25, 0), crystalMaterial);
    crystal.scale.set(.6, 2.1 + (i % 3) * .5, .6);
    crystal.position.set(c.centre.x + Math.cos(angle) * r, c.floorY + .9, c.centre.z + Math.sin(angle) * r);
    crystal.rotation.set(.12 * (i % 2 ? 1 : -1), angle, .1);
    zone.add(crystal);
    crystals.push(crystal);
  }
  const doorSide = doorHalf(zone, 1, materials);
  let t = 0;
  zone.onUpdate(dt => {
    t += dt;
    poolMaterial.opacity = .76 + .08 * Math.sin(t * 1.3);
    lanterns.forEach((entry, i) => entry.glow.color.copy(entry.base).multiplyScalar(.88 + .12 * Math.sin(t * 2.1 + i * .9)));
  });
  interiorOnly(zone);
  const sound = audio ? caveAmbience(zone, audio, {gain: .028}) : null;
  return {setDoor: open => doorSide.set(open), sound, crystals: crystals.length};
}

// The doorway's facade on the valley: a rock outcrop with a dark arch and a
// throat, plus a jade lantern. Owned by the doorway (persistent while the
// natural-zone flag is on), not by either zone. Lit by the valley's sun.
export function buildGrottoMouthFacade(ledger) {
  const f = plan.facade;
  const groundAt = (a, l) => { const p = grottoFramePoint(a, l); return wolfveilHeight(p.x, p.z); };
  const rock = ledger.own(new THREE.MeshStandardMaterial({name: 'WV_ZoneFacade_Rock', color: 0x7d7a73, roughness: .95, flatShading: true}), 'material');
  const dark = ledger.own(new THREE.MeshBasicMaterial({name: 'WV_ZoneFacade_Throat', color: 0x0d0b0a, side: THREE.DoubleSide}), 'material');
  const glow = ledger.own(new THREE.MeshBasicMaterial({name: 'WV_ZoneFacade_Lantern', color: 0x7df2cf, toneMapped: false}), 'material');
  const add = (geometry, material, a, l, y, {scale = [1, 1, 1], yaw = 0} = {}) => {
    const p = grottoFramePoint(a, l);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(p.x, y, p.z);
    mesh.scale.set(...scale);
    mesh.rotation.y = grottoFrameYaw(1, 0) + yaw;
    mesh.castShadow = material === rock; mesh.receiveShadow = true;
    ledger.add(mesh);
    return mesh;
  };
  const lump = (a, l, r, h) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const n = 1 + rockNoise(pos.getX(i) * 3 + a, pos.getY(i) * 3, pos.getZ(i) * 3 + l) * .7;
      pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n, pos.getZ(i) * n);
    }
    g.computeVertexNormals();
    return add(g, rock, a, l, groundAt(a, l) + h * .35, {scale: [r, h, r]});
  };
  for (const [a, l, r] of f.rocks) lump(a, l, r * 1.15, r * 1.6 + 1.2);
  // Arch: two pillars and a lintel boulder across the opening.
  const baseY = groundAt(0, 0);
  const pillar = new THREE.CylinderGeometry(.55, .75, f.openingHeight + .4, 7);
  add(pillar, rock, .1, f.openingHalfWidth + .45, baseY + f.openingHeight / 2);
  add(pillar, rock, .1, -f.openingHalfWidth - .45, baseY + f.openingHeight / 2);
  add(new THREE.BoxGeometry(f.openingHalfWidth * 2 + 2.2, 1.1, 1.6), rock, .2, 0, baseY + f.openingHeight + .45);
  // The throat: a dark box open toward the valley, so the arch reads deep.
  const throat = new THREE.Group();
  const w = f.openingHalfWidth * 2, d = f.throatDepth, h = f.openingHeight;
  for (const [sx, sy, sz, px, py, pz] of [
    [w + .2, h + .2, .1, 0, h / 2, d],          // back
    [.1, h + .2, d, -w / 2 - .05, h / 2, d / 2],  // sides
    [.1, h + .2, d, w / 2 + .05, h / 2, d / 2],
    [w + .2, .1, d, 0, h + .05, d / 2],          // roof
  ]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), dark);
    panel.position.set(px, py, pz);
    throat.add(panel);
  }
  const p = grottoFramePoint(0, 0);
  throat.position.set(p.x, baseY - .05, p.z);
  throat.rotation.y = grottoFrameYaw(1, 0);
  ledger.add(throat);
  add(new THREE.OctahedronGeometry(.26, 0), glow, -.3, f.openingHalfWidth + .1, baseY + f.openingHeight - .2);
  return {throat};
}
