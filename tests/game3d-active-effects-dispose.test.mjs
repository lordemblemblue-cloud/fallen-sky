// GameWorld3D's activeEffects list must dispose an effect once it is no longer alive (vfx/activeEffects.mjs).
// On main ab603e4 the world dropped finished effects without calling dispose(): every skill cast left its
// PlayerCastLightBeam Group and PointLight in the scene and its playerSkillCastCancel listener on window.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { tickActiveEffects, disposeActiveEffects } from '../src/components/game3d/vfx/activeEffects.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'axe-active-effects-'));
after(() => rm(temp, { recursive: true, force: true }));

// The real effects that GameWorld3D (cast beam, skill-use burst, level-up celebration), companionAbilityHandler
// (companion abilities) and legacyTargetedAbilities (legacy spells) push onto activeEffects, bundled with their
// three.js instance.
const bundle = path.join(temp, 'effects.mjs');
const game3d = './src/components/game3d/';
await build({
  stdin: {
    contents: [
      "export * as THREE from 'three';",
      `export { createPlayerCastLightBeam } from '${game3d}vfx/playerCastLightBeam.jsx';`,
      `export { createSkillUseBurst, createLevelUpCelebration } from '${game3d}vfx/playerMomentEffects.jsx';`,
      `export { createHealEffect } from '${game3d}HealEffect.jsx';`,
      `export { createBiteEffect } from '${game3d}BiteEffect.jsx';`,
      `export { createLifeDrainEffect } from '${game3d}LifeDrainEffect.jsx';`,
      `export { createCompanionTeleportDash } from '${game3d}CompanionTeleportDashEffect.jsx';`,
      `export { createShadowTeleport } from '${game3d}ShadowTeleportEffect.jsx';`,
      `export { createFrostTornado } from '${game3d}FrostTornadoEffect.jsx';`,
      `export { createLightningStrike } from '${game3d}LightningStrikeEffect.jsx';`,
    ].join('\n'),
    resolveDir: root,
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent',
});

// A window that can count its listeners. Each test imports its own module copy with a fresh window, because
// the beam module caches its GLB load for the life of the page.
function createWindow() {
  const target = new globalThis.EventTarget();
  const listeners = new Map();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = (type, listener, options) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    add(type, listener, options);
  };
  target.removeEventListener = (type, listener, options) => {
    listeners.get(type)?.delete(listener);
    remove(type, listener, options);
  };
  target.listenerCount = (type) => listeners.get(type)?.size ?? 0;
  return target;
}
let copies = 0;
async function loadEffects() {
  globalThis.window = createWindow();
  return import(`${pathToFileURL(bundle).href}?copy=${++copies}`);
}

// Stands in for GLTFLoader: the test decides when the beam's GLB arrives.
function deferredLoader() {
  const pending = [];
  return {
    load(url, onLoad, onProgress, onError) { pending.push({ onLoad, onError }); },
    arrive(gltf) { for (const request of pending.splice(0)) request.onLoad(gltf); },
  };
}
function fakeBeamAsset(THREE) {
  const asset = new THREE.Group();
  asset.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3), new THREE.MeshBasicMaterial()));
  return asset;
}
const flushMicrotasks = () => new Promise((resolve) => globalThis.setImmediate(resolve));

function sceneSnapshot(scene) {
  let objects = 0, lights = 0, beams = 0;
  scene.traverse((node) => {
    objects++;
    if (node.isLight) lights++;
    if (node.name === 'PlayerCastLightBeam') beams++;
  });
  return { objects, lights, beams };
}
function runOut(effects, dt, maxSeconds = 10) {
  let list = effects, ticks = 0;
  while (list.length && ticks * dt < maxSeconds) { list = tickActiveEffects(list, dt); ticks++; }
  return { list, ticks };
}

test('a finished effect is disposed exactly once as it leaves the list; live ones keep their order', () => {
  const log = [];
  const effect = (name, lifetime) => {
    let t = 0;
    return {
      update(dt) { t += dt; log.push(`update ${name}`); },
      alive: () => t < lifetime,
      dispose() { log.push(`dispose ${name}`); },
    };
  };
  const a = effect('a', 0.25), b = effect('b', 0.05), c = effect('c', 1);

  let list = tickActiveEffects([a, b, c], 0.1);
  assert.deepEqual(list, [a, c]);
  assert.deepEqual(log.splice(0), ['update a', 'update b', 'dispose b', 'update c']);
  list = tickActiveEffects(list, 0.1);
  assert.deepEqual(list, [a, c]);
  assert.deepEqual(log.splice(0), ['update a', 'update c']);
  list = tickActiveEffects(list, 0.1);
  assert.deepEqual(list, [c]);
  assert.deepEqual(log.splice(0), ['update a', 'dispose a', 'update c']);
});

test('self-cleaning effects without dispose() are dropped; a throwing dispose() cannot keep an effect or stop the frame', (t) => {
  const warn = t.mock.method(globalThis.console, 'warn', () => {});
  const selfCleaning = { update() {}, alive: () => false }; // HealEffect & co. remove themselves in update()
  const broken = { update() {}, alive: () => false, dispose() { throw new Error('dispose failed'); } };
  let laterUpdates = 0;
  const later = { update() { laterUpdates++; }, alive: () => true };

  assert.deepEqual(tickActiveEffects([selfCleaning, broken, later], 1 / 60), [later]);
  assert.equal(laterUpdates, 1);
  assert.equal(warn.mock.callCount(), 1);
});

test('world teardown disposes every effect still in the list, alive or not', () => {
  const disposed = [];
  const playing = { update() {}, alive: () => true, dispose: () => disposed.push('playing') };
  const finished = { update() {}, alive: () => false, dispose: () => disposed.push('finished') };
  const selfCleaning = { update() {}, alive: () => true };
  assert.deepEqual(disposeActiveEffects([playing, finished, selfCleaning]), []);
  assert.deepEqual(disposed, ['playing', 'finished']);
});

test('a finished cast beam leaves the scene with its light and cancel listener; a late GLB is not attached', async () => {
  const fx = await loadEffects();
  const { THREE } = fx;
  const scene = new THREE.Scene();
  const loader = deferredLoader();
  const player = { position: new THREE.Vector3(1, 0, 2) };
  const before = sceneSnapshot(scene);

  const beam = fx.createPlayerCastLightBeam({
    scene, loader, playerRef: { current: player }, getGroundY: () => 0, duration: 0.45,
  });
  const group = scene.getObjectByName('PlayerCastLightBeam');
  assert.ok(group, 'the beam is in the scene while the cast plays');
  assert.equal(sceneSnapshot(scene).lights, before.lights + 1);
  assert.equal(globalThis.window.listenerCount('playerSkillCastCancel'), 1);

  const { list, ticks } = runOut([beam], 0.1);
  assert.deepEqual(list, []);
  assert.equal(ticks, 5, 'a 0.45 s cast ends on the fifth 0.1 s frame');
  assert.deepEqual(sceneSnapshot(scene), before);
  assert.equal(group.parent, null);
  assert.equal(globalThis.window.listenerCount('playerSkillCastCancel'), 0);

  // The first cast of a session can be over before the beam GLB has loaded.
  const children = group.children.length;
  loader.arrive({ scene: fakeBeamAsset(THREE) });
  await flushMicrotasks();
  assert.equal(group.children.length, children, 'no GLB is attached to a disposed beam');

  beam.dispose(); // idempotent: a second call changes nothing and does not throw
  assert.deepEqual(sceneSnapshot(scene), before);
});

test('a cancelled cast beam is disposed on the next frame and leaves the cached GLB geometry and materials alone', async () => {
  const fx = await loadEffects();
  const { THREE } = fx;
  const scene = new THREE.Scene();
  const loader = deferredLoader();
  const asset = fakeBeamAsset(THREE);
  let sharedDisposals = 0;
  asset.children[0].geometry.addEventListener('dispose', () => sharedDisposals++);
  asset.children[0].material.addEventListener('dispose', () => sharedDisposals++);
  const before = sceneSnapshot(scene);

  const beam = fx.createPlayerCastLightBeam({
    scene, loader, playerRef: { current: { position: new THREE.Vector3() } }, getGroundY: () => 0, duration: 0.45,
  });
  loader.arrive({ scene: asset });
  await flushMicrotasks();
  const group = scene.getObjectByName('PlayerCastLightBeam');
  assert.equal(group.children.length, 4, 'ring, core, light and the GLB clone');

  let list = tickActiveEffects([beam], 1 / 60);
  assert.equal(list.length, 1);
  globalThis.window.dispatchEvent(new globalThis.CustomEvent('playerSkillCastCancel')); // a dodge or world teardown
  list = tickActiveEffects(list, 1 / 60);
  assert.deepEqual(list, []);
  assert.deepEqual(sceneSnapshot(scene), before);
  assert.equal(globalThis.window.listenerCount('playerSkillCastCancel'), 0);
  assert.equal(sharedDisposals, 0, 'the clone shares the cached GLB geometry and materials');
});

test('every effect GameWorld3D puts on activeEffects leaves the scene once it finishes', async () => {
  const fx = await loadEffects();
  const { THREE } = fx;
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  player.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), new THREE.MeshStandardMaterial()));
  scene.add(player);
  const at = (x, z) => () => ({ x, y: 0, z });
  const loader = deferredLoader();
  const effects = {
    'cast light beam': () => fx.createPlayerCastLightBeam({
      scene, loader, playerRef: { current: player }, getGroundY: () => 0, duration: 0.45,
    }),
    'skill-use burst': () => fx.createSkillUseBurst({
      scene, playerRef: { current: player }, getGroundY: () => 0, duration: 0.65,
    }),
    'level-up celebration': () => fx.createLevelUpCelebration({
      scene, playerRef: { current: player }, getGroundY: () => 0,
    }),
    heal: () => fx.createHealEffect(scene, at(0, 0)),
    bite: () => fx.createBiteEffect(scene, 2, 0, 2),
    'life drain': () => fx.createLifeDrainEffect(scene, at(0, 0), at(3, 0)),
    'teleport dash': () => fx.createCompanionTeleportDash(scene, at(0, 0), at(3, 0)),
    'shadow teleport': () => fx.createShadowTeleport(scene, player, () => ({ x: 4, y: 0, z: 4 })),
    'frost tornado': () => fx.createFrostTornado(scene, 2, 2, 0),
    'lightning strike': () => fx.createLightningStrike(scene, 2, 2, 0),
  };
  const before = sceneSnapshot(scene);

  for (const [name, create] of Object.entries(effects)) {
    const effect = create();
    assert.ok(sceneSnapshot(scene).objects > before.objects, `${name} adds to the scene while it plays`);
    assert.deepEqual(runOut([effect], 1 / 30).list, [], `${name} finishes`);
    assert.deepEqual(sceneSnapshot(scene), before, `${name} leaves nothing behind`);
  }

  // Many casts at once, as in a fight. Live, the scene gained one light per skill cast and kept it.
  const all = [];
  for (let round = 0; round < 3; round++) for (const create of Object.values(effects)) all.push(create());
  assert.ok(sceneSnapshot(scene).lights >= before.lights + all.length);
  assert.deepEqual(runOut(all, 1 / 30).list, []);
  assert.deepEqual(sceneSnapshot(scene), before);
  assert.equal(globalThis.window.listenerCount('playerSkillCastCancel'), 0);
});

test('a lightning strike keeps one set of materials across bolt rebuilds and disposes every material it showed', async () => {
  const fx = await loadEffects();
  const { THREE } = fx;
  const scene = new THREE.Scene();
  // Every material the strike puts in the scene, and whether it was disposed by the end.
  const seen = new Map();
  const collect = () => scene.traverse((node) => {
    for (const material of [node.material].flat()) {
      if (!material || seen.has(material)) continue;
      seen.set(material, false);
      material.addEventListener('dispose', () => seen.set(material, true));
    }
  });

  let list = [fx.createLightningStrike(scene, 2, 2, 0)];
  collect();
  const atStart = seen.size;
  let frames = 0;
  while (list.length && frames < 600) { list = tickActiveEffects(list, 1 / 60); collect(); frames++; }

  assert.deepEqual(list, []);
  assert.ok(frames >= 40, 'the bolts are rebuilt every 35 ms over the ~0.8 s strike');
  assert.equal(seen.size, atStart, 'rebuilding the bolts adds no materials');
  assert.equal([...seen.values()].filter((disposed) => !disposed).length, 0, 'every material is disposed');
});

test('GameWorld3D ticks its effects through the disposing list and disposes what is left on teardown', () => {
  const world = readFileSync(path.join(root, 'src/components/game3d/GameWorld3D.jsx'), 'utf8');
  assert.match(world, /import \{ tickActiveEffects, disposeActiveEffects \} from '\.\/vfx\/activeEffects\.mjs';/);
  assert.match(world, /activeEffects\.current = tickActiveEffects\(activeEffects\.current, delta\);/);
  assert.doesNotMatch(world, /activeEffects\.current\.filter\(/, 'no loop may drop effects without disposing them');
  const teardown = world.slice(world.indexOf('rendererGuard.markDisposed();'));
  assert.ok(teardown.includes('cancelAnimationFrame(frameId);'), 'teardown stops the render loop');
  assert.match(teardown, /activeEffects\.current = disposeActiveEffects\(activeEffects\.current\);/);
});
