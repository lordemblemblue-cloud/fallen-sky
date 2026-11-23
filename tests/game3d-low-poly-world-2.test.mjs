// Low-poly world, part 2 (docs/GAME3D_LOW_POLY_20261122.md): model bytes kept across gate hops, one draw group per
// material for the zombie, shared archer NPC parses with smaller textures, and the gate-hop loading watchdog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { installGame3DModelCache, isCacheableModelKey } from '../src/components/game3d/performance/Game3DModelCache.mjs';
import { consolidateMaterialGroups } from '../src/components/game3d/render/consolidateMaterialGroups.mjs';
import { loadSharedNpcModel, shrinkImage, shrinkTextureOnArrival } from '../src/components/game3d/npc/sharedNpcModel.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('model cache keeps only model-file bytes, under a size cap, least recently used out first', () => {
  const fakeCache = { enabled: false, files: {}, add() {}, get() {} };
  const c = installGame3DModelCache({ maxBytes: 1000, cache: fakeCache });
  assert.equal(fakeCache.enabled, true);
  assert.equal(installGame3DModelCache({ cache: fakeCache }), c, 'installed once');
  const buf = (n) => new ArrayBuffer(n);
  fakeCache.add('https://media.base44.com/files/a.glb', buf(400));
  fakeCache.add('/models/characters/b.fbx?v=2', buf(400));
  fakeCache.add('https://x/y/texture.png', buf(10)); // images are never kept
  fakeCache.add('blob:http://127.0.0.1/abc.glb', buf(10)); // nor blob: URLs
  fakeCache.add('/game3d/c.glb', 'not bytes'); // nor anything but ArrayBuffers
  assert.equal(c.stats().files, 2);
  assert.ok(fakeCache.get('https://media.base44.com/files/a.glb'), 'hit');
  fakeCache.add('/game3d/d.glb', buf(400)); // over the cap: the least recently used (b.fbx) goes
  assert.equal(fakeCache.get('/models/characters/b.fbx?v=2'), undefined);
  assert.ok(fakeCache.get('https://media.base44.com/files/a.glb'));
  assert.ok(fakeCache.get('/game3d/d.glb'));
  assert.equal(fakeCache.get('https://x/y/texture.png'), undefined);
  assert.equal(c.stats().evicted, 1);
  assert.equal(isCacheableModelKey('data:model/gltf-binary;base64,AAAA.glb'), false);
  assert.equal(isCacheableModelKey('https://base44.app/api/apps/1/files/public/1/3f915913a_ErikaArcher.fbx'), true);
});

// A non-indexed skinned-style geometry whose triangles alternate between two materials in short runs.
function alternatingGeometry() {
  const g = new THREE.BufferGeometry();
  const runs = [[0, 3], [1, 2], [0, 1], [1, 4], [0, 2], [1, 1]]; // [material, triangles]
  const tris = runs.reduce((n, [, t]) => n + t, 0);
  const pos = new Float32Array(tris * 9); const skinIndex = new Uint16Array(tris * 12); const skinWeight = new Float32Array(tris * 12);
  let v = 0;
  for (const [material, t] of runs) {
    const start = v;
    for (let i = 0; i < t * 3; i++, v++) {
      pos.set([material * 100 + v, v * 0.5, -v], v * 3);
      skinIndex.set([material, v % 7, 0, 0], v * 4);
      skinWeight.set([0.7, 0.3, 0, 0], v * 4);
    }
    g.addGroup(start, v - start, material);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  return g;
}

function trianglesByMaterial(g) {
  const out = new Map();
  const p = g.attributes.position; const s = g.attributes.skinIndex;
  for (const group of g.groups) {
    const list = out.get(group.materialIndex) || [];
    for (let v = group.start; v < group.start + group.count; v += 3) {
      const tri = [];
      for (let k = 0; k < 3; k++) tri.push(`${p.getX(v + k)},${p.getY(v + k)},${p.getZ(v + k)}|${s.getX(v + k)},${s.getY(v + k)}`);
      list.push(tri.join(';'));
    }
    out.set(group.materialIndex, list);
  }
  return out;
}

test('zombie draw groups: one per material, every triangle and its skinning unchanged', () => {
  const g = alternatingGeometry();
  const before = trianglesByMaterial(g);
  const r = consolidateMaterialGroups(g);
  assert.deepEqual(r, { before: 6, after: 2 });
  assert.equal(g.groups.length, 2);
  assert.deepEqual(trianglesByMaterial(g), before, 'same triangles per material, in the same order');
  // indexed geometry: the index is reordered, vertices stay
  const ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
  ig.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]);
  ig.addGroup(0, 3, 0); ig.addGroup(3, 3, 1); ig.addGroup(6, 3, 0); ig.addGroup(9, 3, 1);
  assert.deepEqual(consolidateMaterialGroups(ig), { before: 4, after: 2 });
  assert.deepEqual([...ig.index.array], [0, 1, 2, 6, 7, 8, 3, 4, 5, 9, 0, 1]);
  assert.deepEqual(ig.groups.map((x) => [x.start, x.count, x.materialIndex]), [[0, 6, 0], [6, 6, 1]]);
});

test('archer NPCs share one parse per world mount: own bones and materials, shared geometry and textures', async () => {
  let loads = 0;
  const makeArcher = () => {
    const bone = new THREE.Bone(); const texture = new THREE.Texture();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(geometry.attributes.position.count * 4), 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 4).fill(0.25), 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshPhongMaterial({ map: texture }));
    const group = new THREE.Group(); group.add(bone); group.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
    group.animations = [new THREE.AnimationClip('idle', 1, [])];
    return group;
  };
  const loader = { load(url, onLoad) { loads += 1; setTimeout(() => onLoad(makeArcher()), 0); } };
  const got = await Promise.all([1, 2, 3].map(() => new Promise((resolve, reject) => loadSharedNpcModel(loader, 'archer.fbx', resolve, reject, { hiPoly: false }))));
  assert.equal(loads, 1, 'one parse for three NPCs');
  const meshes = got.map((g) => { let m = null; g.traverse((n) => { if (n.isSkinnedMesh) m = n; }); return m; });
  assert.equal(meshes[0].geometry, meshes[1].geometry, 'geometry shared');
  assert.equal(meshes[0].material.map, meshes[2].material.map, 'textures shared');
  assert.notEqual(meshes[0].material, meshes[1].material, 'each NPC tints its own material');
  assert.notEqual(meshes[0].skeleton.bones[0], meshes[1].skeleton.bones[0], 'each NPC animates its own bones');
  assert.equal(got[1].animations[0].name, 'idle');
  // a new world mount (new loader) parses again; ?hiPoly=1 keeps one parse per NPC
  const other = { load(url, onLoad) { loads += 1; onLoad(makeArcher()); } };
  await new Promise((resolve) => loadSharedNpcModel(other, 'archer.fbx', resolve, resolve, { hiPoly: false }));
  assert.equal(loads, 2);
  await new Promise((resolve) => loadSharedNpcModel(other, 'archer.fbx', resolve, resolve, { hiPoly: true }));
  await new Promise((resolve) => loadSharedNpcModel(other, 'archer.fbx', resolve, resolve, { hiPoly: true }));
  assert.equal(loads, 4);
});

test('NPC textures are scaled to 1024 px when the image arrives, before any upload', () => {
  const drawn = [];
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (img, x, y, w, h) => drawn.push([w, h]) }) }) };
  const big = { width: 2048, height: 2048 };
  const small = { width: 512, height: 256 };
  assert.equal(shrinkImage(small, 1024, doc), small);
  const c = shrinkImage(big, 1024, doc);
  assert.equal(c.width, 1024); assert.equal(c.height, 1024);
  const texture = new THREE.Texture();
  shrinkTextureOnArrival(texture, 1024, doc);
  texture.image = { width: 2048, height: 1024 }; // what TextureLoader does once the image decodes
  assert.equal(texture.image.width, 1024);
  assert.equal(texture.image.height, 512);
});

// Runs GameView's own world-entry watchdog effect (taken from the source) on a fake clock.
function runWatchdog({ hop }) {
  const src = read('src/pages/GameView.jsx').replace(/\r\n/g, '\n');
  const head = "useEffect(()=>{\n    if(worldEntryStatus!=='loading')return undefined;\n    // A scene constructor can fail";
  const at = src.indexOf(head);
  assert.ok(at >= 0, 'watchdog effect found');
  const bodyStart = src.indexOf('\n', src.indexOf('return undefined;', at)) + 1;
  const bodyEnd = src.indexOf('},[worldEntryStatus]);', at);
  const body = src.slice(bodyStart, bodyEnd);
  let now = 0; let nextId = 1; const timers = new Map(); const listeners = new Map();
  const fakeWindow = {
    __gw3dScene: { name: 'scene before' },
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const state = { error: null, status: 'loading' };
  const cleanup = new Function('window', 'performance', 'setWorldEntryError', 'setWorldEntryStatus', body)(
    fakeWindow, { now: () => now }, (e) => { state.error = e; }, (fn) => { state.status = typeof fn === 'function' ? fn(state.status) : fn; });
  if (hop) fakeWindow.__gw3dScene = { name: 'the next area' }; // the gate hop's remount builds a new scene
  const advanceTo = (t) => {
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= t).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = t;
  };
  const progress = () => listeners.get('game3dWorldCompileProgress')?.();
  return { state, advanceTo, progress, cleanup, listeners, timers };
}

test('world-entry watchdog: progress resets 30 s; a gate hop with its new scene may run to 150 s; first entry keeps 30 s', () => {
  // first entry, no progress: interrupted at 30 s
  let w = runWatchdog({ hop: false });
  w.advanceTo(29999); assert.equal(w.state.status, 'loading');
  w.advanceTo(30000); assert.equal(w.state.status, 'error');
  // first entry with progress every 20 s: alive; stuck 30 s after the last progress
  w = runWatchdog({ hop: false });
  for (let t = 20000; t <= 100000; t += 20000) { w.advanceTo(t); w.progress(); }
  w.advanceTo(129999); assert.equal(w.state.status, 'loading');
  w.advanceTo(130000); assert.equal(w.state.status, 'error');
  // gate hop whose new scene exists, no progress at all: still loading at 149 s, interrupted at 150 s
  w = runWatchdog({ hop: true });
  w.advanceTo(149000); assert.equal(w.state.status, 'loading');
  w.advanceTo(150000); assert.equal(w.state.status, 'error');
  // gate hop with progress past 150 s: alive while progress comes, interrupted 30 s after it stops
  w = runWatchdog({ hop: true });
  for (let t = 20000; t <= 200000; t += 20000) { w.advanceTo(t); w.progress(); }
  w.advanceTo(229999); assert.equal(w.state.status, 'loading');
  w.advanceTo(230000); assert.equal(w.state.status, 'error');
  // the effect's cleanup removes its listener and timer
  w = runWatchdog({ hop: true });
  w.cleanup();
  assert.equal(w.listeners.size, 0); assert.equal(w.timers.size, 0);
});

test('the game uses all of it; ?hiPoly=1 keeps the earlier behaviour', () => {
  assert.match(read('src/components/game3d/performance/Game3DPerformanceBootstrap.jsx'), /installGame3DModelCache\(\)/);
  assert.match(read('src/components/game3d/npc/axeAnimatedQuestNpcGLB.mjs'), /loadSharedNpcModel\(fbxLoader,fallbackUrl,/);
  assert.match(read('src/components/game3d/npc/spawnLivingQuestNPC.jsx'), /loadSharedNpcModel\(loader, archerUrl,/);
  const zombie = read('src/components/game3d/wolfveil/WolfveilZombieHordeRuntime.js');
  assert.match(zombie, /if\(!game3dHiPolyRequested\(\)\)\{\s*state\.drawGroups=consolidateModelMaterialGroups\(root\);/);
  // the archer enemies' shared source opts in to 1024 px textures; other spawner users (Three Roads) keep theirs
  assert.match(read('src/components/game3d/GameWorld3D.jsx'), /createSharedSkinnedFBXSpawner\(loader,WOLFVEIL_ADMIN_C1_MODEL\.modelUrl,\{lowPolyTextures:true\}\)/);
  assert.match(read('src/components/game3d/performance/SharedSkinnedFBXSpawner.mjs'), /lowPolyTextures = false,/);
  const view = read('src/pages/GameView.jsx');
  assert.match(view, /scene&&scene!==startScene&&performance\.now\(\)-startedAt<150000/, 'a gate hop that built its scene gets 150 s');
  assert.match(view, /timer=window\.setTimeout\(check,30000\)/, 'the first check still comes at 30 s');
});
