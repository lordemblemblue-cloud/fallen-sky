// Low-poly world, part 3 (docs/GAME3D_LOW_POLY_20261122.md): parked effect meshes in the quest givers' character
// files, the zombie download only where a camp can spawn, and a zombie release that cannot stop the game loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { hideParkedEffectMeshes, clipScaleMaxima } from '../src/components/game3d/npc/parkedEffectMeshes.mjs';
import { zombieCampsCanSpawnInArea } from '../src/components/game3d/wolfveil/WolfveilZombieAreaReach.mjs';
import { planWolfveilZombieCamps } from '../src/components/game3d/wolfveil/WolfveilZombieCamps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function characterWithEffects() {
  const model = new THREE.Group(); model.name = 'Character';
  const box = () => new THREE.BoxGeometry(1, 1, 1);
  const body = new THREE.Mesh(box(), new THREE.MeshBasicMaterial()); body.name = 'SK_Character';
  const parked = new THREE.Group(); parked.name = 'FX_Anchor'; parked.scale.setScalar(0.0001);
  const embers = [0, 1, 2].map((i) => { const m = new THREE.Mesh(box(), new THREE.MeshBasicMaterial()); m.name = `FX_Ember_${i}`; parked.add(m); return m; });
  // an effect the idle clip itself shows (it scales up during idle): must stay
  const aura = new THREE.Mesh(box(), new THREE.MeshBasicMaterial()); aura.name = 'Spirit_Aura'; aura.scale.setScalar(0.0001);
  // an effect parked by its own scale and kept parked by the idle clip
  const wisp = new THREE.Mesh(box(), new THREE.MeshBasicMaterial()); wisp.name = 'Husky_Wisp'; wisp.scale.setScalar(0.0001);
  model.add(body, parked, aura, wisp);
  const idle = new THREE.AnimationClip('Idle', 2, [
    new THREE.VectorKeyframeTrack('Spirit_Aura.scale', [0, 1, 2], [0.0001, 0.0001, 0.0001, 0.6, 0.6, 0.6, 0.0001, 0.0001, 0.0001]),
    new THREE.VectorKeyframeTrack('Husky_Wisp.scale', [0, 2], [0.0001, 0.0001, 0.0001, 0.0002, 0.0002, 0.0002]),
    new THREE.VectorKeyframeTrack('FX_Anchor.scale', [0, 2], [0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001]),
  ]);
  return { model, body, embers, aura, wisp, idle };
}

test('parked effect meshes are hidden only when the idle clip keeps them parked', () => {
  const c = characterWithEffects();
  assert.ok(Math.abs(clipScaleMaxima(c.idle).get('Spirit_Aura') - 0.6) < 1e-6); // keyframes are float32
  const r = hideParkedEffectMeshes(c.model, c.idle);
  assert.deepEqual(r, { hidden: 4, kept: 2 });
  for (const m of c.embers) assert.equal(m.visible, false);
  assert.equal(c.wisp.visible, false);
  assert.equal(c.aura.visible, true, 'the idle clip scales the aura up: it stays');
  assert.equal(c.body.visible, true);
});

test('zombie camps spawn only in the east, north and west area scenes', () => {
  const planned = planWolfveilZombieCamps();
  assert.equal(planned.length, 150);
  assert.equal(zombieCampsCanSpawnInArea(planned, 'town'), false);
  assert.equal(zombieCampsCanSpawnInArea(planned, 'south'), false);
  for (const area of ['west', 'east', 'north']) assert.equal(zombieCampsCanSpawnInArea(planned, area), true, area);
  assert.equal(zombieCampsCanSpawnInArea(planned, null), true, 'the whole valley keeps them');
});

test('valley far-grass chunks follow the player: full tile within 85 m, half to 145 m, a quarter beyond', async () => {
  const { createFarGrassLod, farGrassLevel } = await import('../src/components/game3d/wolfveil/WolfveilFarGrassLod.mjs');
  assert.equal(farGrassLevel(40), 'near'); assert.equal(farGrassLevel(100), 'mid'); assert.equal(farGrassLevel(300), 'far');
  // a far tile like the owner's: 72 blades of 10 triangles
  const blades = []; const index = [];
  for (let b = 0; b < 72; b++) { const base = blades.length / 3; for (let r = 0; r < 6; r++) blades.push(b * 0.03, r * 0.2, 0, b * 0.03 + 0.02, r * 0.2, 0); for (let r = 0; r < 5; r++) { const a = base + r * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const tile = new THREE.BufferGeometry();
  tile.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3)); tile.setIndex(index);
  const root = new THREE.Group();
  const chunkAt = (x, z, name) => { const m = new THREE.InstancedMesh(tile, new THREE.MeshBasicMaterial(), 1); m.name = name; m.position.set(x, 0, z); root.add(m); return m; };
  const near = chunkAt(10, 0, 'SWV_Owner_LongGrass_Tile_2m_Far_0:0');
  const mid = chunkAt(110, 0, 'WV_Area_town_SWV_Owner_LongGrass_Tile_2m_Far_1:0');
  const far = chunkAt(400, 0, 'SWV_Owner_LongGrass_Tile_2m_Far_6:0');
  const other = chunkAt(400, 0, 'SWV_Owner_LongGrass_Tile_2m_Near_6:0');
  root.updateMatrixWorld(true);
  const lod = createFarGrassLod({ root, sourceGeometry: tile });
  lod.update(1, { x: 0, z: 0 });
  assert.equal(near.geometry, tile);
  assert.equal(mid.geometry.index.count / 3, 360);
  assert.equal(far.geometry.index.count / 3, 180);
  assert.equal(other.geometry, tile, 'near tiles are never thinned');
  lod.update(1, { x: 400, z: 0 }); // the player walks over: that chunk gets its full tile back
  assert.equal(far.geometry, tile);
  assert.equal(near.geometry.index.count / 3, 180);
  lod.dispose();
  assert.equal(near.geometry, tile, 'dispose gives every chunk its original tile');
});

test('the game uses it; ?hiPoly=1 keeps the earlier behaviour; a zombie release cannot throw into the game loop', () => {
  const grass = read('src/components/game3d/wolfveil/WolfveilGrassTileReplacement.js');
  assert.match(grass, /if\(!game3dHiPolyRequested\(\)\)farLod=createFarGrassLod\(\{root:world\.group,sourceGeometry:far\.geometry\}\);/);
  assert.match(grass, /farLod\?\.update\(dt,playerPosition\);/);
  assert.match(read('src/components/game3d/wolfveil/WolfveilScene.js'), /ownerGrassTiles\?\.update\(dt,playerPosition\);/);
  assert.match(read('src/components/game3d/npc/axeAnimatedQuestNpcGLB.mjs'),
    /if\(!game3dHiPolyRequested\(\)\)model\.userData\.parkedEffects=hideParkedEffectMeshes\(model,embeddedIdleClip\);/);
  const zombie = read('src/components/game3d/wolfveil/WolfveilZombieHordeRuntime.js');
  assert.match(zombie, /const skipLoad=Boolean\(area\)&&!game3dHiPolyRequested\(\)&&!zombieCampsCanSpawnInArea\(planned,area,ACTIVE_RADIUS\);/);
  assert.match(zombie, /for\(const mat of entry\.tintMaterials\)safeDispose\(mat\);/);
  assert.match(zombie, /try\{item\?\.dispose\?\.\(\);\}/);
  assert.match(read('src/components/game3d/GameWorld3D.jsx'),
    /createWolfveilZombieHordeRuntime\(\{\s*scene,loader,enemies,sampleGroundY,onCountChange:setEnemyCount,area:areaScenes\?worldArea:null,/);
});
