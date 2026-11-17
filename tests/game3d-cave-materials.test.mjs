import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShaderLib } from 'three';
import { fbm, worley } from '../src/components/game3d/cave/materials/noise.js';
import { getCaveTextureSet } from '../src/components/game3d/cave/materials/textures.js';
import {
  CAVE_LIBRARY_VERSION,
  CAVE_MATERIAL_IDS,
  createApproachPath,
  createBrickPiece,
  createBrickWall,
  createCaveFloor,
  createCaveMaterialShowcase,
  createCliffFace,
  createPlankDeck,
  createRockCluster,
  createRockWall,
  createWoodPlank,
  createWoodSupport,
  getCaveMaterial,
  listCaveMaterials,
  listCavePieces,
  prepareCaveSurface,
  releaseCaveLibrary,
} from '../src/components/game3d/cave/materials/index.js';

test('cave noise repeats across a texture tile', () => {
  assert.ok(Math.abs(fbm(0, 0.37, 5) - fbm(1, 0.37, 5)) < 1e-6);
  assert.ok(Math.abs(fbm(0.2, 0, 9, 4, 4) - fbm(0.2, 1, 9, 4, 4)) < 1e-6);
  const left = worley(0, 0.4, 8, 3);
  const right = worley(1, 0.4, 8, 3);
  assert.ok(Math.abs(left.f1 - right.f1) < 1e-6);
});

test('every catalog id builds a shared PBR material', () => {
  assert.equal(CAVE_LIBRARY_VERSION, 1);
  assert.equal(listCaveMaterials().length, CAVE_MATERIAL_IDS.length);
  assert.equal(new Set(CAVE_MATERIAL_IDS).size, CAVE_MATERIAL_IDS.length);
  for (const id of CAVE_MATERIAL_IDS) {
    const material = getCaveMaterial(id);
    assert.equal(material, getCaveMaterial(id));
    assert.equal(material.userData.caveMaterialId, id);
    assert.ok(material.map, id);
    assert.equal(material.map.image.width, material.map.image.height);
    assert.ok([128, 256, 512].includes(material.map.image.width), id);
    assert.equal(material.map.wrapS, THREE.RepeatWrapping);
    assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
    assert.equal(material.map.generateMipmaps, true);
    assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace);
    assert.equal(material.roughnessMap.colorSpace, THREE.NoColorSpace);
    assert.ok(material.aoMap, id);
    assert.equal(typeof material.onBeforeCompile, 'function');
    const spread = channelSpread(material.map.image.data);
    assert.ok(spread > 24, `${id} albedo is too flat (${spread})`);
    const normalSpread = channelSpread(material.normalMap.image.data);
    assert.ok(normalSpread > 8, `${id} normal map is flat`);
  }
});

test('seed tints a cached variant without copying the albedo image', () => {
  const base = getCaveMaterial('mossyRock');
  const tinted = getCaveMaterial('mossyRock', { seed: 2 });
  const again = getCaveMaterial('mossyRock', { seed: 2 });
  assert.equal(tinted, again);
  assert.notEqual(base, tinted);
  assert.equal(base.map, tinted.map);
  assert.notEqual(base.color.getHex(), tinted.color.getHex());
  assert.equal(base.defines.CAVE_TRIPLANAR, '');
  assert.equal(getCaveMaterial('cleanBrick').defines.CAVE_TRIPLANAR, undefined);
});

test('repeat keeps the source image and changes the sampler repeat', () => {
  const repeated = getCaveMaterial('packedDirt', { repeat: [3, 2] });
  const base = getCaveMaterial('packedDirt');
  assert.equal(repeated.map.image, base.map.image);
  assert.equal(repeated.map.repeat.x, 3);
  assert.equal(repeated.map.repeat.y, 2);
  assert.equal(base.map.repeat.x, 1);
});

test('cave shader samples triplanar maps and world-space variation', () => {
  const material = getCaveMaterial('layeredRock');
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vCaveWPos/);
  assert.match(shader.fragmentShader, /caveTriSample/);
  assert.match(shader.fragmentShader, /caveVary|caveMacro/);
  assert.equal(shader.fragmentShader.includes('#include <map_fragment>'), false);
  assert.equal(shader.fragmentShader.includes('#include <roughnessmap_fragment>'), false);
  assert.equal(shader.fragmentShader.includes('#include <aomap_fragment>'), false);
});

test('piece factories build instanced walls, timber, floors, and the approach', () => {
  const wall = createBrickWall({ variant: 'broken', width: 2.4, height: 1.5, seed: 4 });
  assert.equal(wall.object.isLOD, true);
  assert.equal(wall.object.userData.front, '+z');
  let bricks = 0;
  wall.object.traverse((child) => {
    if (child.isInstancedMesh) bricks += child.count;
  });
  assert.ok(bricks > 20, `expected instanced bricks, got ${bricks}`);

  const support = createWoodSupport({ seed: 2 });
  assert.ok(support.object.children.length >= 4);
  const deck = createPlankDeck({ seed: 1, width: 2, depth: 1.4 });
  assert.equal(deck.object.isInstancedMesh, true);
  assert.ok(deck.object.count >= 4);

  const cluster = createRockCluster({ material: 'crystalRock', count: 5, seed: 8 });
  assert.ok(cluster.object.children.length >= 1);
  const rockWall = createRockWall({ material: 'wetRock', width: 3, height: 2, seed: 3 });
  assert.equal(rockWall.object.userData.material, 'wetRock');
  const floor = createCaveFloor({ material: 'gravelFloor', width: 3, depth: 3, seed: 1 });
  assert.equal(floor.object.userData.cavePiece, true);
  const path = createApproachPath({ surface: 'stonePath', length: 4, width: 2, seed: 6 });
  assert.ok(path.object.children.length >= 3);
  const cliff = createCliffFace({ width: 3, height: 2, seed: 7 });
  assert.equal(cliff.object.name, 'CaveCliffFace');
  const brick = createBrickPiece({ variant: 'worn', seed: 9 });
  const plank = createWoodPlank({ seed: 4 });
  assert.equal(brick.object.isMesh, true);
  assert.equal(plank.object.material.length, 2);

  const geometry = new THREE.PlaneGeometry(1, 1);
  prepareCaveSurface(geometry);
  assert.ok(geometry.getAttribute('uv2'));

  for (const piece of [wall, support, deck, cluster, rockWall, floor, path, cliff, brick, plank]) {
    piece.dispose();
  }
});

test('the showcase can assemble every material without throwing', () => {
  assert.ok(listCavePieces().length >= 8);
  const rock = createCaveMaterialShowcase({ focus: 'rock' });
  assert.equal(rock.object.userData.caveShowcase, true);
  assert.ok(rock.object.children.length >= 5);
  rock.dispose();
  const one = createCaveMaterialShowcase({ focus: 'mossyRock' });
  assert.ok(one.frame.position[2] > one.frame.target[2]);
  one.dispose();
});

test('unknown materials name the catalog', () => {
  assert.throws(() => getCaveMaterial('lava'), /roughRock/);
});

test('crystal veins carry an emissive map and wet rock uses a clearcoat', () => {
  const crystal = getCaveMaterial('crystalRock');
  const wet = getCaveMaterial('wetRock');
  assert.ok(crystal.emissiveMap);
  assert.ok(crystal.emissiveIntensity > 0);
  assert.ok(wet.clearcoat > 0.2);
  const set = getCaveTextureSet('cleanMasonry');
  assert.equal(set.size, 512);
});

test.after(() => {
  releaseCaveLibrary();
});

function channelSpread(data) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}
