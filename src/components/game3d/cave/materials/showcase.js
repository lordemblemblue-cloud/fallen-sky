import * as THREE from 'three';
import { getCaveMaterial, listCaveMaterials, prepareCaveSurface } from './library.js';
import {
  createApproachPath,
  createBrickWall,
  createCaveFloor,
  createCliffFace,
  createPlankDeck,
  createRockCluster,
  createRockWall,
  createWoodSupport,
} from './pieces.js';

const GROUP_ALIAS = {
  rock: 'Rock',
  floor: 'Floor',
  masonry: 'Masonry',
  brick: 'Brick',
  wood: 'Wood',
  approach: 'Approach',
  path: 'Approach',
};

export function planCaveShowcase(focus = 'all') {
  const key = normalizeFocus(focus);
  const materials = filterMaterials(key);
  const pieces = filterPieces(key);
  const stations = [];
  if (materials.length && pieces.length && key === 'all') {
    placeGrid(stations, materials, 0);
    placePieces(stations, pieces, -17.5);
  } else if (materials.length && !pieces.length) {
    placeGrid(stations, materials, 0);
  } else if (pieces.length && !materials.length) {
    placePieces(stations, pieces, 0);
  } else if (materials.length === 1) {
    stations.push({ ...materials[0], kind: 'material', x: -1.35, y: 0, z: 0 });
    const related = relatedPiece(materials[0].id);
    if (related) stations.push({ ...related, kind: 'piece', x: 2.15, y: 0, z: 0 });
  } else {
    placeGrid(stations, materials, 0);
    if (pieces.length) placePieces(stations, pieces, -6.5);
  }
  return {
    focus: key,
    title: titleFor(key),
    stations,
    frame: frameFor(stations, key),
  };
}

export function getCaveShowcaseFrame(focus = 'all') {
  return planCaveShowcase(focus).frame;
}

export function createCaveMaterialShowcase(options = {}) {
  const plan = planCaveShowcase(options.focus);
  const root = new THREE.Group();
  root.name = 'CaveMaterialShowcase';
  const owned = [];
  const disposables = [];
  const plinth = new THREE.BoxGeometry(2.15, 0.24, 1.35);
  prepareCaveSurface(plinth);
  owned.push(plinth);
  const plinthMaterial = getCaveMaterial('mortar', { repeat: [2, 1] });

  for (const station of plan.stations) {
    if (station.kind === 'material') {
      owned.push(...addSwatch(root, station, plinth, plinthMaterial, disposables));
    } else {
      const piece = station.build();
      piece.object.position.set(station.x, station.y, station.z);
      root.add(piece.object);
      const label = makeLabel(station.label);
      if (label) {
        label.position.set(station.x, station.labelY || 2.35, station.z);
        root.add(label);
        disposables.push(label);
      }
      disposables.push(piece);
    }
  }

  const ground = showcaseGround(plan.stations);
  root.add(ground);
  owned.push(ground.geometry);
  disposables.push(ground.material);

  root.userData.caveShowcase = true;
  root.userData.focus = plan.focus;
  return {
    object: root,
    frame: plan.frame,
    title: plan.title,
    dispose() {
      for (const item of disposables) {
        if (item.dispose) item.dispose();
        else {
          item.userData?.ownedMaterial?.dispose();
          item.userData?.ownedTexture?.dispose();
        }
      }
      root.removeFromParent();
      for (const geometry of owned) geometry.dispose();
    },
  };
}

function addSwatch(root, station, plinthGeometry, plinthMaterial, disposables) {
  const owned = [];
  const group = new THREE.Group();
  group.position.set(station.x, station.y, station.z);
  group.name = `CaveSwatch_${station.id}`;
  const plinth = new THREE.Mesh(plinthGeometry, plinthMaterial);
  plinth.position.y = 0.12;
  plinth.receiveShadow = true;
  group.add(plinth);

  const repeat = station.triplanar ? null : [station.swatchTiles || 1, station.swatchTiles || 1];
  const material = getCaveMaterial(station.id, repeat ? { repeat } : {});
  const planeGeometry = new THREE.PlaneGeometry(1.5, 1.5);
  const sphereGeometry = new THREE.SphereGeometry(0.36, 40, 28);
  prepareCaveSurface(planeGeometry);
  prepareCaveSurface(sphereGeometry);
  owned.push(planeGeometry, sphereGeometry);
  const plane = new THREE.Mesh(planeGeometry, material);
  plane.position.set(-0.22, 1.18, 0);
  plane.castShadow = true;
  plane.receiveShadow = true;
  const sphere = new THREE.Mesh(sphereGeometry, material);
  sphere.position.set(0.78, 0.62, 0.2);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  group.add(plane, sphere);
  const label = makeLabel(station.label);
  if (label) {
    label.position.set(0.15, 2.2, 0);
    group.add(label);
    disposables.push(label);
  }
  root.add(group);
  return owned;
}

function showcaseGround(stations) {
  const box = bounds(stations);
  const width = Math.max(8, box.maxX - box.minX + 8);
  const depth = Math.max(8, box.maxZ - box.minZ + 8);
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((box.minX + box.maxX) / 2, -0.001, (box.minZ + box.maxZ) / 2);
  mesh.receiveShadow = true;
  mesh.name = 'CaveShowcaseGround';
  return mesh;
}

function placeGrid(stations, materials, z0) {
  const columns = materials.length > 6 ? 6 : Math.max(1, materials.length);
  materials.forEach((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    stations.push({
      ...entry,
      kind: 'material',
      x: (col - (columns - 1) / 2) * 3.15,
      y: 0,
      z: z0 - row * 3.45,
    });
  });
}

function placePieces(stations, pieces, z0) {
  const columns = Math.min(4, pieces.length);
  pieces.forEach((piece, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    stations.push({
      ...piece,
      kind: 'piece',
      x: (col - (columns - 1) / 2) * 4.3,
      y: 0,
      z: z0 - row * 5.4,
    });
  });
}

function filterMaterials(key) {
  const all = listCaveMaterials();
  if (key === 'pieces') return [];
  if (GROUP_ALIAS[key]) return all.filter((entry) => entry.group === GROUP_ALIAS[key]);
  if (key !== 'all') {
    const match = all.find((entry) => entry.id === key);
    return match ? [match] : [];
  }
  return all;
}

function filterPieces(key) {
  const pieces = pieceCatalog();
  if (key === 'all' || key === 'pieces') return pieces;
  if (GROUP_ALIAS[key]) return [];
  const direct = pieces.filter((piece) => piece.id === key || piece.matches?.includes(key));
  return direct;
}

function pieceCatalog() {
  return [
    { id: 'cleanWall', matches: ['brickWall', 'cleanBrick', 'cleanMasonry'], label: 'Clean brick wall', labelY: 2.15, build: () => createBrickWall({ variant: 'clean', width: 2.6, height: 1.7, seed: 2 }) },
    { id: 'wornWall', matches: ['wornBrick', 'wornMasonry'], label: 'Worn brick wall', labelY: 2.15, build: () => createBrickWall({ variant: 'worn', width: 2.6, height: 1.7, seed: 3 }) },
    { id: 'brokenWall', matches: ['brokenBrick', 'brokenMasonry'], label: 'Broken brick wall', labelY: 2.15, build: () => createBrickWall({ variant: 'broken', width: 2.6, height: 1.7, seed: 4 }) },
    { id: 'mossyWall', matches: ['mossyBrick', 'mossyMasonry'], label: 'Mossy brick wall', labelY: 2.15, build: () => createBrickWall({ variant: 'mossy', width: 2.6, height: 1.7, seed: 5 }) },
    { id: 'woodSupport', matches: ['woodSupport', 'forgedIron', 'woodEnd'], label: 'Timber support', labelY: 2.9, build: () => createWoodSupport({ seed: 6 }) },
    { id: 'plankDeck', matches: ['plankDeck', 'woodPlank'], label: 'Plank deck', labelY: 0.7, build: () => createPlankDeck({ seed: 7, width: 2.3, depth: 1.5 }) },
    { id: 'rockCluster', matches: ['rockCluster', 'rockChunk'], label: 'Rock cluster', labelY: 1.3, build: () => createRockCluster({ seed: 8, material: 'roughRock', count: 7, spread: 1 }) },
    { id: 'rockWall', matches: ['rockWall', 'layeredRock'], label: 'Layered rock wall', labelY: 2.5, build: () => createRockWall({ material: 'layeredRock', width: 3.1, height: 2.3, seed: 9 }) },
    { id: 'wetWall', matches: ['wetRock'], label: 'Wet rock wall', labelY: 2.5, build: () => createRockWall({ material: 'wetRock', width: 3.1, height: 2.3, seed: 10 }) },
    { id: 'crystalWall', matches: ['crystalRock'], label: 'Crystal-veined wall', labelY: 2.5, build: () => createRockWall({ material: 'crystalRock', width: 3.1, height: 2.3, seed: 11 }) },
    { id: 'mossWall', matches: ['mossyRock'], label: 'Mossy rock wall', labelY: 2.5, build: () => createRockWall({ material: 'mossyRock', width: 3.1, height: 2.3, seed: 12 }) },
    { id: 'roughWall', matches: ['roughRock'], label: 'Rough rock wall', labelY: 2.5, build: () => createRockWall({ material: 'roughRock', width: 3.1, height: 2.3, seed: 13 }) },
    { id: 'caveFloor', matches: ['caveFloor', 'gravelFloor', 'packedDirt', 'wetStoneFloor'], label: 'Cave floors', labelY: 0.55, build: floorTrio },
    { id: 'approachPath', matches: ['approachPath', 'dirtPath', 'stonePath', 'grassEdge', 'grassBlade'], label: 'Approach path', labelY: 0.7, build: () => createApproachPath({ seed: 15, length: 5.5, width: 2.2, curve: 0.4 }) },
    { id: 'cliffFace', matches: ['cliffFace', 'cliffRock'], label: 'Cliff face', labelY: 2.7, build: () => createCliffFace({ seed: 16, width: 3.4, height: 2.5 }) },
  ];
}

function floorTrio() {
  const group = new THREE.Group();
  const floors = [
    createCaveFloor({ material: 'gravelFloor', width: 1.7, depth: 1.7, seed: 21 }),
    createCaveFloor({ material: 'packedDirt', width: 1.7, depth: 1.7, seed: 22 }),
    createCaveFloor({ material: 'wetStoneFloor', width: 1.7, depth: 1.7, seed: 23 }),
  ];
  floors.forEach((floor, index) => {
    floor.object.position.x = (index - 1) * 1.85;
    group.add(floor.object);
  });
  group.userData.childDispose = floors;
  return {
    object: group,
    dispose() {
      for (const floor of floors) floor.dispose();
      group.removeFromParent();
    },
  };
}

function relatedPiece(materialId) {
  return pieceCatalog().find((piece) => piece.matches?.includes(materialId)) || null;
}

function frameFor(stations, key) {
  if (!stations.length) return { position: [0, 2, 6], target: [0, 1, 0] };
  if (key !== 'all' && key !== 'pieces' && stations.length <= 3) {
    const box = bounds(stations);
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const span = Math.max(box.maxX - box.minX, 2);
    return {
      position: [cx + 0.15, 1.7 + span * 0.08, cz + 4.8 + span * 0.35],
      target: [cx, 1.05, cz],
    };
  }
  const box = bounds(stations);
  const span = Math.max(box.maxX - box.minX, box.maxZ - box.minZ, 4);
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  return {
    position: [cx, span * 0.38 + 2.4, cz + span * 0.62 + 5],
    target: [cx, 1, cz],
  };
}

function bounds(stations) {
  const xs = stations.map((station) => station.x);
  const zs = stations.map((station) => station.z);
  return {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, 0),
    minZ: Math.min(...zs, 0),
    maxZ: Math.max(...zs, 0),
  };
}

function titleFor(key) {
  if (key === 'all') return 'All cave surfaces';
  if (key === 'pieces') return 'Cave building pieces';
  if (GROUP_ALIAS[key]) return `${GROUP_ALIAS[key]} surfaces`;
  const material = listCaveMaterials().find((entry) => entry.id === key);
  if (material) return material.label;
  const piece = pieceCatalog().find((entry) => entry.id === key);
  return piece ? piece.label : 'Cave surfaces';
}

function normalizeFocus(focus) {
  if (!focus || focus === 'all') return 'all';
  return String(focus);
}

function makeLabel(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(14, 12, 10, 0.8)';
  roundedRect(context, 20, 36, 600, 92, 22);
  context.fill();
  context.fillStyle = '#f4efe4';
  context.font = '600 44px Georgia, "Times New Roman", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 320, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.85, 0.46, 1);
  sprite.userData.ownedTexture = texture;
  sprite.userData.ownedMaterial = material;
  return sprite;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
