import * as THREE from 'three';
import { clamp01, fbm3, hash2, smoothstep } from './noise.js';
import { getCaveMaterial, prepareCaveSurface } from './library.js';

const BRICK = Object.freeze({ width: 0.4, height: 0.13, depth: 0.19, mortar: 0.016 });
const BRICK_MATERIAL = Object.freeze({
  clean: 'cleanBrick',
  worn: 'wornBrick',
  broken: 'brokenBrick',
  mossy: 'mossyBrick',
});
const MASONRY_MATERIAL = Object.freeze({
  clean: 'cleanMasonry',
  worn: 'wornMasonry',
  broken: 'brokenMasonry',
  mossy: 'mossyMasonry',
});
const MAX_BRICKS = 2400;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const brickCache = new Map();
const rockCache = new Map();
const timberCache = new Map();

const PIECES = [
  { id: 'brickPiece', factory: 'createBrickPiece', description: 'One sculpted brick, beveled and chipped.' },
  { id: 'brickWall', factory: 'createBrickWall', description: 'Running-bond instanced brick wall with mortar, wear, and a distant masonry LOD.' },
  { id: 'rockChunk', factory: 'createRockChunk', description: 'A single displaced stone.' },
  { id: 'rockCluster', factory: 'createRockCluster', description: 'A pile of instanced stones.' },
  { id: 'rockWall', factory: 'createRockWall', description: 'Displaced rock face with protruding stones.' },
  { id: 'woodPlank', factory: 'createWoodPlank', description: 'One plank with end grain.' },
  { id: 'woodSupport', factory: 'createWoodSupport', description: 'Timber frame with a cap beam, brace, and iron straps.' },
  { id: 'plankDeck', factory: 'createPlankDeck', description: 'Instanced floor planks.' },
  { id: 'caveFloor', factory: 'createCaveFloor', description: 'Displaced gravel, dirt, or wet-stone floor.' },
  { id: 'approachPath', factory: 'createApproachPath', description: 'Dirt or flagstone path with grass verges and blade cards.' },
  { id: 'cliffFace', factory: 'createCliffFace', description: 'Displaced cliff with ledges and embedded rock.' },
];

export function listCavePieces() {
  return PIECES.map((piece) => ({ ...piece }));
}

export function createBrickGeometry(options = {}) {
  const variant = normalizeVariant(options.variant);
  const seed = options.seed == null ? 1 : options.seed;
  return sculptBrick(variant, seed);
}

export function createBrickPiece(options = {}) {
  const variant = normalizeVariant(options.variant);
  const seed = options.seed | 0 || 1;
  const geometry = sculptBrick(variant, seed);
  const mesh = new THREE.Mesh(geometry, getCaveMaterial(BRICK_MATERIAL[variant], { seed }));
  mesh.position.y = BRICK.height / 2;
  return finish('CaveBrickPiece', mesh, [geometry], {
    variant,
    size: { width: BRICK.width, height: BRICK.height, depth: BRICK.depth },
  });
}

export function createBrickWall(options = {}) {
  const variant = normalizeVariant(options.variant);
  const seed = options.seed | 0 || 1;
  const lod = options.lod || 'auto';
  const pitchX = BRICK.width + BRICK.mortar;
  const pitchY = BRICK.height + BRICK.mortar;
  const cols = Math.max(1, Math.round((options.width || 3.2) / pitchX));
  const rows = Math.max(1, Math.round((options.height || 2.2) / pitchY));
  const spanX = cols * pitchX - BRICK.mortar;
  const spanY = rows * pitchY - BRICK.mortar;
  const simplified = rows * cols > MAX_BRICKS;
  const placements = simplified ? [] : placeBricks(variant, seed, rows, cols, pitchX, pitchY);
  const owned = [];
  const near = simplified ? null : brickLayer(variant, seed, placements, 'near');
  const mid = simplified ? null : brickLayer(variant, seed, placements, 'mid');
  const far = masonryPlane(variant, spanX, spanY, seed);
  owned.push(far.geometry);
  const mortar = simplified ? null : mortarBacking(spanX, spanY, seed);
  owned.push(mortar.geometry);

  let object;
  if (lod === 'far' || simplified) {
    object = new THREE.Group();
    object.add(far);
  } else if (lod === 'mid') {
    object = new THREE.Group();
    object.add(mortar, mid);
  } else if (lod === 'near') {
    object = new THREE.Group();
    object.add(mortar, near);
  } else {
    object = new THREE.LOD();
    const nearGroup = new THREE.Group();
    nearGroup.add(mortar, near);
    const midGroup = new THREE.Group();
    midGroup.add(mortar.clone(), mid);
    object.addLevel(nearGroup, 0);
    object.addLevel(midGroup, 14);
    object.addLevel(far, 34);
  }
  if (variant === 'mossy' && near && lod !== 'far' && lod !== 'mid') {
    const moss = mossClumps(placements, seed);
    if (moss) {
      if (object.isLOD) object.levels[0].object.add(moss);
      else object.add(moss);
    }
  }
  return finish('CaveBrickWall', object, owned, {
    variant,
    lod,
    simplified,
    count: placements.length,
    size: { width: spanX, height: spanY, depth: BRICK.depth },
  });
}

export function createRockChunkGeometry(options = {}) {
  const seed = options.seed == null ? 1 : options.seed | 0;
  const detail = options.detail == null ? 2 : options.detail;
  return displaceRock(seed, detail);
}

export function createRockChunk(options = {}) {
  const seed = options.seed | 0 || 1;
  const materialId = options.material || 'roughRock';
  const geometry = displaceRock(seed, options.detail == null ? 2 : options.detail);
  const mesh = new THREE.Mesh(geometry, getCaveMaterial(materialId, { seed }));
  mesh.position.y = 0.34;
  return finish('CaveRockChunk', mesh, [geometry], {
    material: materialId,
    size: { width: 0.9, height: 0.7, depth: 0.9 },
  });
}

export function createRockCluster(options = {}) {
  const seed = options.seed | 0 || 1;
  const materialId = options.material || 'roughRock';
  const count = Math.max(1, Math.min(24, options.count == null ? 7 : options.count | 0));
  const spread = options.spread == null ? 1.15 : options.spread;
  const material = getCaveMaterial(materialId, { seed });
  const variants = [0, 1, 2, 3].map((index) => sharedRock(seed + index, 1));
  const buckets = variants.map(() => []);
  for (let i = 0; i < count; i += 1) {
    const angle = hash2(i, seed, 2) * Math.PI * 2;
    const radius = Math.sqrt(hash2(i, seed, 3)) * spread;
    const scale = 0.28 + hash2(i, seed, 4) * 0.55;
    buckets[i % variants.length].push({
      x: Math.cos(angle) * radius,
      y: scale * 0.22,
      z: Math.sin(angle) * radius * 0.8,
      rx: (hash2(i, seed, 5) - 0.5) * 0.6,
      ry: hash2(i, seed, 6) * Math.PI * 2,
      rz: (hash2(i, seed, 7) - 0.5) * 0.4,
      scale,
      tint: instanceTint(seed, i, materialId === 'mossyRock' ? 0.08 : 0.03),
    });
  }
  const group = new THREE.Group();
  buckets.forEach((items, index) => {
    if (!items.length) return;
    group.add(instanced(variants[index], material, items));
  });
  return finish('CaveRockCluster', group, [], {
    material: materialId,
    count,
    size: { width: spread * 2.2, height: 0.9, depth: spread * 1.8 },
  });
}

export function createRockWall(options = {}) {
  const seed = options.seed | 0 || 1;
  const materialId = options.material || 'roughRock';
  const width = options.width || 4.5;
  const height = options.height || 3.2;
  const mode = materialId === 'layeredRock' ? 'layered' : materialId === 'cliffRock' ? 'cliff' : 'rough';
  const face = displaceFace(width, height, seed, mode, materialId === 'wetRock' ? 0.16 : 0.28);
  const material = getCaveMaterial(materialId, { seed });
  const mesh = new THREE.Mesh(face, material);
  const shellGeo = new THREE.BoxGeometry(width, height, 0.34);
  prepareCaveSurface(shellGeo);
  const shell = new THREE.Mesh(shellGeo, material);
  shell.position.set(0, height / 2, -0.22);
  mesh.position.y = height / 2;
  const group = new THREE.Group();
  group.add(shell, mesh);
  const rocks = embeddedRocks(width, height, seed, material, 6);
  if (rocks) group.add(rocks);
  return finish('CaveRockWall', group, [face, shellGeo], {
    material: materialId,
    size: { width, height, depth: 0.7 },
  });
}

export function createWoodPlank(options = {}) {
  const seed = options.seed | 0 || 1;
  const length = options.length || 1.35;
  const width = options.width || 0.22;
  const thickness = options.thickness || 0.045;
  const mesh = timberBoard(length, width, thickness, seed, 'woodPlank');
  mesh.position.y = thickness / 2;
  return finish('CaveWoodPlank', mesh, [mesh.geometry], {
    size: { width: length, height: thickness, depth: width },
  });
}

export function createWoodSupport(options = {}) {
  const seed = options.seed | 0 || 1;
  const height = options.height || 2.45;
  const span = options.span || 1.55;
  const group = new THREE.Group();
  const postGeo = sharedTimber(0.16, height, 0.15, seed, 'post');
  const iron = getCaveMaterial('forgedIron', { seed, repeat: [2, 1] });
  const bandGeo = new THREE.TorusGeometry(0.115, 0.012, 6, 14);
  prepareCaveSurface(bandGeo);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, getCaveMaterial('woodSupport', { seed, repeat: [1, height / 1.15] }));
    post.position.set(side * span * 0.5, height / 2, 0);
    post.rotation.y = side * 0.04;
    group.add(post);
    for (const bandY of [height * 0.28, height * 0.72]) {
      const band = new THREE.Mesh(bandGeo, iron);
      band.position.set(side * span * 0.5, bandY, 0);
      band.rotation.x = Math.PI / 2;
      group.add(band);
    }
  }
  const cap = timberBoard(span + 0.34, 0.16, 0.14, seed + 2, 'woodSupport');
  cap.position.set(0, height + 0.07, 0);
  group.add(cap);
  const brace = timberBoard(Math.hypot(span, height * 0.55), 0.1, 0.08, seed + 4, 'woodSupport');
  brace.position.set(0, height * 0.48, 0.02);
  brace.rotation.z = Math.atan2(height * 0.55, span) * 0.5;
  group.add(brace);
  return finish('CaveWoodSupport', group, [cap.geometry, brace.geometry, bandGeo], {
    size: { width: span + 0.34, height: height + 0.16, depth: 0.22 },
  });
}

export function createPlankDeck(options = {}) {
  const seed = options.seed | 0 || 1;
  const width = options.width || 2.4;
  const depth = options.depth || 1.7;
  const thickness = 0.046;
  const board = 0.2;
  const gap = 0.016;
  const count = Math.max(1, Math.floor((width + gap) / (board + gap)));
  const geometry = sharedTimber(board, thickness, depth, seed, 'deck');
  const material = getCaveMaterial('woodPlank', { seed, repeat: [1, depth / 1.1] });
  const items = [];
  const span = count * (board + gap) - gap;
  for (let i = 0; i < count; i += 1) {
    const broken = hash2(i, seed, 8) > 0.9;
    items.push({
      x: -span / 2 + board / 2 + i * (board + gap),
      y: thickness / 2 + hash2(i, seed, 2) * 0.008,
      z: (hash2(i, seed, 3) - 0.5) * 0.03,
      rx: (hash2(i, seed, 4) - 0.5) * 0.02,
      ry: (hash2(i, seed, 5) - 0.5) * 0.03,
      rz: (hash2(i, seed, 6) - 0.5) * 0.015,
      scaleZ: broken ? 0.55 + hash2(i, seed, 7) * 0.25 : 1,
      tint: instanceTint(seed, i, 0.04),
    });
  }
  const mesh = instanced(geometry, material, items);
  return finish('CavePlankDeck', mesh, [], {
    count,
    size: { width: span, height: thickness, depth },
  });
}

export function createCaveFloor(options = {}) {
  const seed = options.seed | 0 || 1;
  const materialId = options.material || 'packedDirt';
  const width = options.width || 4;
  const depth = options.depth || 4;
  const geometry = horizontalPatch(width, depth, seed, materialId === 'gravelFloor' ? 0.07 : 0.035);
  const material = getCaveMaterial(materialId, {
    seed,
    repeat: [width / tileOf(materialId), depth / tileOf(materialId)],
  });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  let pebbles = null;
  if (materialId === 'gravelFloor') {
    pebbles = createRockCluster({
      seed,
      material: 'roughRock',
      count: 12,
      spread: Math.min(width, depth) * 0.32,
    });
    pebbles.object.position.y = 0.02;
    group.add(pebbles.object);
  }
  return finish('CaveFloor', group, [geometry], {
    material: materialId,
    size: { width, height: 0.12, depth },
    childDispose: pebbles ? [pebbles] : [],
  });
}

export function createApproachPath(options = {}) {
  const seed = options.seed | 0 || 1;
  const surface = options.surface === 'stonePath' ? 'stonePath' : 'dirtPath';
  const length = options.length || 8;
  const width = options.width || 2.5;
  const edge = options.edge == null ? 0.85 : options.edge;
  const curve = options.curve == null ? 0.55 : options.curve;
  const group = new THREE.Group();
  const centerGeo = pathRibbon(length, width, seed, curve, 0);
  const center = new THREE.Mesh(centerGeo, getCaveMaterial(surface, {
    seed,
    repeat: [width / tileOf(surface), length / tileOf(surface)],
  }));
  group.add(center);
  const owned = [centerGeo];
  for (const side of [-1, 1]) {
    const vergeGeo = pathRibbon(length, edge, seed + side + 3, curve * 0.8, 0.012);
    const verge = new THREE.Mesh(vergeGeo, getCaveMaterial('grassEdge', {
      seed,
      repeat: [edge / tileOf('grassEdge'), length / tileOf('grassEdge')],
    }));
    verge.position.x = side * (width / 2 + edge / 2 - 0.04);
    group.add(verge);
    owned.push(vergeGeo);
  }
  const blades = grassCards(length, width, edge, seed);
  if (blades) {
    group.add(blades);
    owned.push(blades.geometry);
  }
  const stones = vergeStones(length, width, seed, surface === 'stonePath');
  if (stones) group.add(stones);
  return finish('CaveApproachPath', group, owned, {
    surface,
    size: { width: width + edge * 2, height: 0.35, depth: length },
  });
}

export function createCliffFace(options = {}) {
  const seed = options.seed | 0 || 1;
  const width = options.width || 6;
  const height = options.height || 4.2;
  const face = displaceFace(width, height, seed, 'cliff', 0.42);
  const material = getCaveMaterial('cliffRock', { seed });
  const mesh = new THREE.Mesh(face, material);
  mesh.position.y = height / 2;
  const group = new THREE.Group();
  group.add(mesh);
  const ledges = cliffLedges(width, height, seed);
  group.add(ledges);
  const rocks = embeddedRocks(width, height, seed + 5, material, 5);
  if (rocks) group.add(rocks);
  return finish('CaveCliffFace', group, [face, ...ledges.userData.owned], {
    material: 'cliffRock',
    size: { width, height, depth: 0.9 },
  });
}

export function releaseCaveGeometries() {
  for (const geometry of brickCache.values()) {
    for (const item of geometry) item.dispose();
  }
  brickCache.clear();
  for (const geometry of rockCache.values()) geometry.dispose();
  rockCache.clear();
  for (const geometry of timberCache.values()) geometry.dispose();
  timberCache.clear();
}

function finish(name, object, owned, meta) {
  object.name = name;
  object.userData = {
    cavePiece: true,
    piece: name,
    front: '+z',
    floor: 'y=0',
    ...meta,
  };
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.geometry) prepareCaveSurface(child.geometry);
  });
  return {
    id: name,
    object,
    geometries: owned,
    dispose() {
      const nested = object.userData.childDispose || [];
      for (const child of nested) child.dispose?.();
      object.removeFromParent();
      for (const geometry of owned) geometry.dispose();
    },
  };
}

function placeBricks(variant, seed, rows, cols, pitchX, pitchY) {
  const placements = [];
  for (let row = 0; row < rows; row += 1) {
    const odd = row % 2 === 1;
    const bricks = odd ? Math.max(1, cols - 1) : cols;
    const rowWidth = bricks * pitchX - BRICK.mortar;
    for (let col = 0; col < bricks; col += 1) {
      const roll = hash2(col + row * 13, seed, 5);
      if (variant === 'broken' && roll > 0.8) continue;
      if (variant === 'worn' && roll > 0.97) continue;
      if (variant === 'mossy' && roll > 0.95) continue;
      const x = -rowWidth / 2 + BRICK.width / 2 + col * pitchX;
      placements.push({
        row,
        col,
        x: x + (hash2(col, row + seed, 1) - 0.5) * 0.008,
        y: BRICK.height / 2 + row * pitchY + (hash2(col, row, 2) - 0.5) * 0.004,
        z: (hash2(col, row, 3) - 0.5) * 0.01,
        rx: (hash2(col, row, 4) - 0.5) * 0.035,
        ry: (hash2(col, row, 6) - 0.5) * 0.05,
        rz: (hash2(col, row, 7) - 0.5) * 0.03,
        scaleX: 0.985 + hash2(col, row, 8) * 0.03,
        scaleY: 0.985 + hash2(col, row, 9) * 0.03,
        scaleZ: 0.99 + hash2(col, row, 10) * 0.02,
        variantIndex: Math.floor(hash2(col, row + 4, seed) * 5),
        tint: brickTint(variant, seed, row, rows, col),
      });
    }
  }
  return placements;
}

function brickLayer(variant, seed, placements, lod) {
  const geometries = brickGeometries(variant, lod);
  const material = getCaveMaterial(BRICK_MATERIAL[variant]);
  const buckets = geometries.map(() => []);
  for (const placement of placements) {
    const index = lod === 'mid' ? 0 : placement.variantIndex % geometries.length;
    buckets[index].push(placement);
  }
  const group = new THREE.Group();
  group.name = `CaveBrickWall_${lod}`;
  buckets.forEach((items, index) => {
    if (!items.length) return;
    group.add(instanced(geometries[index], material, items));
  });
  void seed;
  return group;
}

function brickGeometries(variant, lod) {
  const key = `${variant}:${lod}`;
  const cached = brickCache.get(key);
  if (cached) return cached;
  if (lod === 'mid') {
    const geometry = new THREE.BoxGeometry(BRICK.width, BRICK.height, BRICK.depth);
    prepareCaveSurface(geometry);
    const list = [geometry];
    brickCache.set(key, list);
    return list;
  }
  const count = variant === 'clean' ? 3 : 5;
  const list = [];
  for (let i = 0; i < count; i += 1) list.push(sculptBrick(variant, i + 1));
  brickCache.set(key, list);
  return list;
}

function sculptBrick(variant, seed) {
  const geometry = new THREE.BoxGeometry(BRICK.width, BRICK.height, BRICK.depth, 6, 3, 4);
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const vertex = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const halfW = BRICK.width / 2;
  const halfH = BRICK.height / 2;
  const halfD = BRICK.depth / 2;
  const corner = new THREE.Vector3(
    (seed % 2 === 0 ? 1 : -1) * halfW,
    ((seed + 1) % 2 === 0 ? 1 : -1) * halfH,
    (seed % 3 === 0 ? 1 : -1) * halfD,
  );
  const amount = { clean: 0.28, worn: 0.75, broken: 1.3, mossy: 0.5 }[variant] || 0.3;
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    direction.fromBufferAttribute(normal, i);
    const ax = Math.abs(vertex.x) / halfW;
    const ay = Math.abs(vertex.y) / halfH;
    const az = Math.abs(vertex.z) / halfD;
    const edge = Math.min(1 - ax, 1 - ay, 1 - az);
    const bevel = smoothstep(0.14, 0, edge);
    const bow = (1 - ax * ax) * (1 - ay * ay) * (1 - az * az);
    const noise = fbm3(vertex.x * 16 + seed, vertex.y * 20, vertex.z * 16, seed, 3);
    let displacement = bow * 0.0045 + (noise - 0.5) * 0.007 * amount - bevel * 0.009 * (0.55 + amount);
    if (variant !== 'clean') {
      const chip = fbm3(vertex.x * 8, vertex.y * 8, vertex.z * 8, seed + 5, 2);
      if (chip > 0.62 && edge < 0.22) displacement -= (chip - 0.62) * 0.055 * amount;
    }
    if (variant === 'broken' && vertex.distanceTo(corner) < 0.085) {
      displacement -= (0.085 - vertex.distanceTo(corner)) * 0.7;
    }
    vertex.addScaledVector(direction, displacement);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  prepareCaveSurface(geometry);
  return geometry;
}

function mortarBacking(spanX, spanY, seed) {
  const geometry = new THREE.BoxGeometry(spanX + 0.04, spanY + 0.02, BRICK.depth * 0.42);
  prepareCaveSurface(geometry);
  const mesh = new THREE.Mesh(geometry, getCaveMaterial('mortar', {
    seed,
    repeat: [(spanX + 0.04) / 0.8, (spanY + 0.02) / 0.8],
  }));
  mesh.position.set(0, spanY / 2, -BRICK.depth * 0.16);
  mesh.name = 'CaveBrickMortar';
  return mesh;
}

function masonryPlane(variant, spanX, spanY, seed) {
  const geometry = new THREE.PlaneGeometry(spanX, spanY);
  prepareCaveSurface(geometry);
  const mesh = new THREE.Mesh(geometry, getCaveMaterial(MASONRY_MATERIAL[variant], {
    seed,
    repeat: [spanX / 3.33, spanY / 3.33],
  }));
  mesh.position.set(0, spanY / 2, BRICK.depth * 0.08);
  mesh.name = 'CaveBrickMasonryLod';
  return mesh;
}

function mossClumps(placements, seed) {
  const geometry = sharedRock(seed + 11, 0);
  const material = getCaveMaterial('mossyRock');
  const items = [];
  for (const placement of placements) {
    if (placement.row > 2 && hash2(placement.col, placement.row, seed) < 0.82) continue;
    if (items.length >= 36) break;
    items.push({
      x: placement.x + (hash2(placement.col, placement.row, 12) - 0.5) * 0.12,
      y: placement.y - BRICK.height * 0.2,
      z: BRICK.depth * 0.42,
      rx: 0.4,
      ry: hash2(placement.col, seed, 13) * 6,
      rz: 0.2,
      scale: 0.08 + hash2(placement.col, placement.row, 14) * 0.07,
      tint: instanceTint(seed, items.length, 0.02),
    });
  }
  if (!items.length) return null;
  return instanced(geometry, material, items);
}

function sharedRock(seed, detail) {
  const key = `${seed | 0}:${detail}`;
  const cached = rockCache.get(key);
  if (cached) return cached;
  const geometry = displaceRock(seed, detail);
  rockCache.set(key, geometry);
  return geometry;
}

function displaceRock(seed, detail) {
  const geometry = new THREE.IcosahedronGeometry(0.5, detail);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).normalize();
    const broad = fbm3(vertex.x * 1.7 + seed, vertex.y * 1.7, vertex.z * 1.7, seed, 4);
    const ridge = Math.abs(Math.sin(vertex.y * 8.5 + broad * 5));
    const shelf = ridge > 0.86 ? -0.07 : 0;
    const radius = 0.78 + broad * 0.38 + shelf;
    position.setXYZ(i, vertex.x * radius, vertex.y * radius * 0.86, vertex.z * radius);
  }
  geometry.computeVertexNormals();
  prepareCaveSurface(geometry);
  return geometry;
}

function displaceFace(width, height, seed, mode, amount) {
  const geometry = new THREE.PlaneGeometry(width, height, 48, 36);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const nx = (x / width) + 0.5;
    const ny = (y / height) + 0.5;
    let heightField = fbm3(nx * 2.4, ny * 2.1, seed * 0.17, seed, 4) - 0.5;
    if (mode === 'layered' || mode === 'cliff') {
      const beds = mode === 'cliff' ? 4.5 : 6;
      const frac = (ny * beds) % 1;
      const lip = smoothstep(0.72, 0.98, frac);
      heightField = heightField * 0.45 + lip * 0.55;
    }
    const fissure = mode === 'rough' ? 0 : (Math.abs(Math.sin(nx * 11 + seed)) < 0.08 ? -0.18 : 0);
    position.setZ(i, heightField * amount + fissure * amount);
  }
  geometry.computeVertexNormals();
  prepareCaveSurface(geometry);
  return geometry;
}

function embeddedRocks(width, height, seed, material, count) {
  const geometry = sharedRock(seed, 1);
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const x = (hash2(i, seed, 1) - 0.5) * width * 0.8;
    const y = 0.3 + hash2(i, seed, 2) * (height - 0.5);
    items.push({
      x,
      y,
      z: 0.12 + hash2(i, seed, 3) * 0.18,
      rx: hash2(i, seed, 4) * 2,
      ry: hash2(i, seed, 5) * 4,
      rz: hash2(i, seed, 6),
      scale: 0.18 + hash2(i, seed, 7) * 0.28,
      tint: instanceTint(seed, i, 0.04),
    });
  }
  return instanced(geometry, material, items);
}

function cliffLedges(width, height, seed) {
  const group = new THREE.Group();
  const owned = [];
  const grass = getCaveMaterial('grassEdge', { seed, repeat: [2, 1] });
  const rock = getCaveMaterial('cliffRock', { seed });
  for (let i = 0; i < 3; i += 1) {
    const ledgeWidth = width * (0.28 + hash2(i, seed, 2) * 0.3);
    const slab = new THREE.BoxGeometry(ledgeWidth, 0.08, 0.42);
    const top = new THREE.BoxGeometry(ledgeWidth * 0.96, 0.02, 0.36);
    prepareCaveSurface(slab);
    prepareCaveSurface(top);
    owned.push(slab, top);
    const y = height * (0.28 + i * 0.22);
    const x = (hash2(i, seed, 4) - 0.5) * width * 0.4;
    const rockMesh = new THREE.Mesh(slab, rock);
    rockMesh.position.set(x, y, 0.18);
    const grassMesh = new THREE.Mesh(top, grass);
    grassMesh.position.set(x, y + 0.05, 0.2);
    group.add(rockMesh, grassMesh);
  }
  group.userData.owned = owned;
  return group;
}

function sharedTimber(width, height, depth, seed, kind) {
  const key = `${kind}:${round(width)}:${round(height)}:${round(depth)}:${seed | 0}`;
  const cached = timberCache.get(key);
  if (cached) return cached;
  const geometry = new THREE.BoxGeometry(width, height, depth, 6, 4, 3);
  sculptTimber(geometry, seed);
  timberCache.set(key, geometry);
  return geometry;
}

function timberBoard(length, width, thickness, seed, materialId) {
  const geometry = new THREE.BoxGeometry(length, thickness, width, 8, 2, 3);
  sculptTimber(geometry, seed);
  for (const group of geometry.groups) {
    group.materialIndex = group.materialIndex <= 1 ? 1 : 0;
  }
  const side = getCaveMaterial(materialId, { seed, repeat: [length / 1.1, 1] });
  const end = getCaveMaterial('woodEnd', { seed });
  const mesh = new THREE.Mesh(geometry, [side, end]);
  return mesh;
}

function sculptTimber(geometry, seed) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const vertex = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    direction.fromBufferAttribute(normal, i);
    const noise = fbm3(vertex.x * 3.2, vertex.y * 6.5, vertex.z * 3.2, seed, 3);
    const warp = Math.sin(vertex.x * 2.2 + seed) * 0.004;
    vertex.addScaledVector(direction, (noise - 0.5) * 0.012 + warp);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  prepareCaveSurface(geometry);
}

function horizontalPatch(width, depth, seed, amount) {
  const geometry = new THREE.PlaneGeometry(width, depth, 32, 32);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const noise = fbm3(x * 0.8, z * 0.8, seed, seed, 3);
    position.setY(i, (noise - 0.5) * amount);
  }
  geometry.computeVertexNormals();
  prepareCaveSurface(geometry);
  return geometry;
}

function pathRibbon(length, width, seed, curve, sink) {
  const geometry = new THREE.PlaneGeometry(width, length, 10, Math.ceil(length * 2));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  let minZ = Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const along = clamp01(z / length + 0.5);
    const bow = Math.sin(along * Math.PI) * curve;
    const noise = fbm3(x * 0.9, z * 0.55, seed * 0.2, seed, 3);
    const camber = 1 - Math.min(1, Math.abs(x) / (width * 0.5));
    position.setX(i, x + bow);
    position.setY(i, (noise - 0.5) * 0.07 + camber * 0.02 - sink);
    minZ = Math.min(minZ, z);
  }
  geometry.translate(0, 0, -minZ);
  geometry.computeVertexNormals();
  prepareCaveSurface(geometry);
  return geometry;
}

function grassCards(length, width, edge, seed) {
  const geometry = new THREE.PlaneGeometry(0.22, 0.46);
  geometry.translate(0, 0.23, 0);
  prepareCaveSurface(geometry);
  const material = getCaveMaterial('grassBlade', { seed });
  const items = [];
  const step = 0.42;
  const count = Math.floor(length / step);
  for (let i = 0; i < count; i += 1) {
    for (const side of [-1, 1]) {
      const z = 0.3 + i * step;
      const x = side * (width / 2 + edge * 0.35);
      items.push(blade(x, z, seed, i, side, 0));
      items.push(blade(x, z, seed, i, side, 1.15));
    }
  }
  return instanced(geometry, material, items);
}

function blade(x, z, seed, index, side, yaw) {
  return {
    x: x + (hash2(index, seed + side, 1) - 0.5) * 0.16,
    y: 0,
    z: z + (hash2(index, seed, 2) - 0.5) * 0.1,
    rx: (hash2(index, seed, 3) - 0.5) * 0.2,
    ry: yaw + (hash2(index, seed, 4) - 0.5) * 0.4,
    rz: (hash2(index, seed, 5) - 0.5) * 0.25,
    scale: 0.75 + hash2(index, seed + side, 6) * 0.7,
    tint: instanceTint(seed + side, index, 0.06),
  };
}

function vergeStones(length, width, seed, dense) {
  const geometry = sharedRock(seed + 3, 0);
  const material = getCaveMaterial(dense ? 'cliffRock' : 'roughRock', { seed });
  const items = [];
  const count = dense ? 10 : 6;
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    items.push({
      x: side * (width * 0.5 + 0.15 + hash2(i, seed, 2) * 0.3),
      y: 0.08,
      z: (i + 0.5) * (length / count),
      rx: hash2(i, seed, 3),
      ry: hash2(i, seed, 4) * 3,
      rz: hash2(i, seed, 5),
      scale: 0.12 + hash2(i, seed, 6) * 0.16,
      tint: instanceTint(seed, i, 0.03),
    });
  }
  return instanced(geometry, material, items);
}

function instanced(geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    const scale = item.scale == null ? 1 : item.scale;
    dummy.scale.set(
      (item.scaleX || 1) * scale,
      (item.scaleY || 1) * scale,
      (item.scaleZ || 1) * scale,
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, item.tint || tint.set(0xffffff));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function brickTint(variant, seed, row, rows, col) {
  const color = instanceTint(seed, row * 17 + col, variant === 'clean' ? 0.025 : 0.045);
  if (variant === 'mossy') color.lerp(new THREE.Color(0x7f9a55), (1 - row / Math.max(1, rows - 1)) * 0.28);
  if (variant === 'worn') color.lerp(new THREE.Color(0xc2b6a4), hash2(col, row, seed) > 0.86 ? 0.18 : 0);
  return color;
}

function instanceTint(seed, index, amount) {
  const span = 0.07 + amount;
  return new THREE.Color(
    1 - hash2(index, seed, 21) * span,
    1 - hash2(index, seed, 22) * span * 0.75,
    1 - hash2(index, seed, 23) * span * 1.15,
  );
}

function tileOf(id) {
  if (id === 'gravelFloor') return 1.6;
  if (id === 'packedDirt') return 1.8;
  if (id === 'wetStoneFloor' || id === 'dirtPath') return 2;
  if (id === 'stonePath') return 2.2;
  if (id === 'grassEdge') return 1.5;
  return 2;
}

function normalizeVariant(variant) {
  return BRICK_MATERIAL[variant] ? variant : 'clean';
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
