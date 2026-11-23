// Low-poly world budgets (docs/GAME3D_LOW_POLY_20261122.md). Pins the low-poly world models' triangles, draw calls,
// texture sizes and download sizes so they cannot creep back, checks that each keeps what the game reads from it
// (node names, materials, alpha mode, UV channels), and that ?hiPoly=1 still reaches the earlier models.
// The town plaza's draw-call budget is in tests/game3d-low-poly-town-merge.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { glbStatsFile, readGlb } from '../scripts/game3d-glb-stats.mjs';
import { LOW_POLY_WORLD_MODELS, game3dHiPolyRequested, worldModelUrl } from '../src/components/game3d/render/lowPolyWorld.mjs';
import { thinGrassClump, createMeadowClumpLods, MEADOW_CLUMP_KEEP } from '../src/components/game3d/wolfveil/WolfveilGrassClumpLod.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicFile = (url) => path.join(root, 'public', url.replace(/^\//, ''));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// Measured 2026-11-22 with scripts/game3d-glb-stats.mjs; each budget is the measured value plus a little headroom.
export const LOW_POLY_MODEL_BUDGETS = Object.freeze({
  elm: { triangles: 25000, drawCalls: 6, maxTexture: 1024, megabytes: 3.3 }, // was 88,362 / 6.46 MB
  ambientBird: { triangles: 7000, drawCalls: 1, maxTexture: 512, megabytes: 0.5 }, // texture was 4096 px, 2.14 MB
  plantPack: { triangles: 48000, drawCalls: 6, maxTexture: 1024, megabytes: 2.0 }, // was 6.69 MB of PNG
  gardenLeaves: { triangles: 19500, drawCalls: 4, maxTexture: 1024, megabytes: 1.1 }, // was 5.44 MB of PNG
});

test('every low-poly world model is in the repo and within its budget', () => {
  for (const [key, budget] of Object.entries(LOW_POLY_MODEL_BUDGETS)) {
    const url = LOW_POLY_WORLD_MODELS[key].low;
    const file = publicFile(url);
    assert.ok(fs.existsSync(file), `${key}: ${url} is in public/`);
    const s = glbStatsFile(file);
    assert.ok(s.triangles <= budget.triangles, `${key}: ${s.triangles} triangles > ${budget.triangles}`);
    assert.ok(s.drawCalls <= budget.drawCalls, `${key}: ${s.drawCalls} draw calls > ${budget.drawCalls}`);
    for (const t of s.textures) assert.ok(Math.max(t.width, t.height) <= budget.maxTexture, `${key}: texture ${t.name} ${t.width}x${t.height}`);
    assert.ok(s.bytes <= budget.megabytes * 1048576, `${key}: ${(s.bytes / 1048576).toFixed(2)} MB > ${budget.megabytes} MB`);
  }
});

test('the low-poly elm keeps what forestOwnerElmAssets.js reads: variant names, bark/leaf children, materials', () => {
  const { json } = readGlb(fs.readFileSync(publicFile(LOW_POLY_WORLD_MODELS.elm.low)));
  const names = new Set(json.nodes.map((n) => n.name));
  for (const v of ['elm-broad', 'elm-slim', 'elm-wild']) {
    assert.ok(names.has(v), v);
    assert.ok(names.has(`${v}-bark`) && names.has(`${v}-leaf`), `${v} children`);
  }
  const foliage = json.materials.find((m) => m.name === 'foliage');
  const bark = json.materials.find((m) => m.name === 'bark');
  assert.equal(foliage.alphaMode, 'MASK', 'leaves stay alpha-cut (never blended: depth would break)');
  assert.ok(Math.abs(foliage.alphaCutoff - 0.13) < 1e-3);
  assert.equal(bark.normalTexture.texCoord, 2, 'bark normal map stays on its own UV channel');
  // the elm's authored transforms are multiplied per instance: they must be the high-poly file's
  const high = readGlb(fs.readFileSync(publicFile(LOW_POLY_WORLD_MODELS.elm.high))).json;
  for (const node of high.nodes) {
    const low = json.nodes.find((n) => n.name === node.name);
    for (const k of ['translation', 'rotation', 'scale']) {
      const a = node[k] || []; const b = low[k] || [];
      a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) <= 1e-4 * Math.max(1, Math.abs(value)), `${node.name} ${k}`));
    }
  }
});

test('?hiPoly=1 loads the earlier models; the default loads the low-poly ones', () => {
  assert.equal(game3dHiPolyRequested(''), false);
  assert.equal(game3dHiPolyRequested('?renderer=webgpu&hiPoly=1'), true);
  assert.equal(game3dHiPolyRequested('?hiPoly=0'), false);
  for (const [key, entry] of Object.entries(LOW_POLY_WORLD_MODELS)) {
    assert.equal(worldModelUrl(key, '?threeRoads=1'), entry.low);
    assert.equal(worldModelUrl(key, '?hiPoly=1'), entry.high);
  }
  assert.ok(fs.existsSync(publicFile(LOW_POLY_WORLD_MODELS.elm.high)), 'the high-poly elm stays in the repo for comparison');
  // the game's loaders read the switch
  assert.match(read('src/components/game3d/render/forestOwnerElmAssets.js'), /worldModelUrl\('elm'\)/);
  assert.match(read('src/components/game3d/wolfveil/ambient/WolfveilAmbientBirds.mjs'), /worldModelUrl\('ambientBird'\)/);
  assert.match(read('src/components/game3d/wolfveil/WolfveilOwnerLandscapeAssets.mjs'), /worldModelUrl\('plantPack'\)/);
  assert.match(read('src/components/game3d/wolfveil/WolfveilOwnerLandscapeAssets.mjs'), /worldModelUrl\('gardenLeaves'\)/);
  assert.match(read('src/components/game3d/wolfveil/WolfveilArtisanTownScene.mjs'), /deepStaticMerge: !game3dHiPolyRequested\(\)/);
  assert.match(read('src/components/game3d/wolfveil/WolfveilLivingMeadow.js'), /game3dHiPolyRequested\(\)\?null:createMeadowClumpLods\(\)/);
});

// A synthetic clump shaped like the owner's 2 m long-grass tile: 72 blades, each a strip of 6 left/right pairs
// (12 vertices, 10 triangles), leaning a little.
function syntheticClump() {
  const positions = []; const normals = []; const index = [];
  for (let b = 0; b < 72; b++) {
    const x0 = ((b * 37) % 72) / 36 - 1; const z0 = ((b * 53) % 72) / 36 - 1; const angle = b * 0.7;
    const dx = Math.cos(angle) * 0.02; const dz = Math.sin(angle) * 0.02;
    const base = positions.length / 3;
    for (let r = 0; r < 6; r++) {
      const y = r * 0.2; const lean = r * r * 0.01; const w = 1 - r / 6;
      positions.push(x0 - dx * w + lean, y, z0 - dz * w, x0 + dx * w + lean, y, z0 + dz * w);
      normals.push(0, 0, 1, 0, 0, 1);
    }
    for (let r = 0; r < 5; r++) {
      const a = base + r * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

test('meadow clump thinning: fewer blades, each wider, same heights, stable choice', () => {
  const clump = syntheticClump();
  assert.equal(clump.index.count / 3, 720);
  const half = thinGrassClump(clump, { keep: MEADOW_CLUMP_KEEP.mid });
  const quarter = thinGrassClump(clump, { keep: MEADOW_CLUMP_KEEP.far });
  assert.equal(half.index.count / 3, 360);
  assert.equal(quarter.index.count / 3, 180);
  half.computeBoundingBox(); clump.computeBoundingBox();
  assert.ok(Math.abs(half.boundingBox.max.y - clump.boundingBox.max.y) < 1e-6, 'blade heights unchanged');
  // a kept blade's base pair is wider by 1/sqrt(keep)
  const p = half.attributes.position;
  const width = Math.hypot(p.getX(1) - p.getX(0), p.getZ(1) - p.getZ(0));
  assert.ok(Math.abs(width - 0.04 * Math.SQRT2) < 1e-3, `base width ${width}`);
  const again = thinGrassClump(clump, { keep: MEADOW_CLUMP_KEEP.mid });
  assert.deepEqual([...again.attributes.position.array], [...half.attributes.position.array], 'deterministic');
  const lods = createMeadowClumpLods();
  assert.equal(lods.get(clump, 'near'), clump, 'near squares keep the full clump');
  assert.equal(lods.get(clump, 'mid'), lods.get(clump, 'mid'), 'one thinned copy per source and level');
  lods.dispose();
});
