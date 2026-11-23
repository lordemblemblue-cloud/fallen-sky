// Sliced shader precompile (src/lib/webgpuSceneRenderer.js precompileSceneObjects sliceMs): a Game 3D cold load
// built ~490 shaders in one 22 s first frame plus a 6.5 s precompile block (docs/GAME3D_CHARACTER_SCREEN_PERF_20261122.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial, DirectionalLight, PointLight, PerspectiveCamera, Points, BufferGeometry } from 'three';
import { precompileSceneObjects, planSceneSlices, nextSliceBatch, PRECOMPILE_SLICE_LAYER } from '../src/lib/webgpuSceneRenderer.js';

const geometry = new BoxGeometry();
const material = new MeshStandardMaterial();
const mesh = (name) => { const m = new Mesh(geometry, material); m.name = name; return m; };
const DRAWN = ['lantern', 'house', 'door', 'sparks', ...Array.from({ length: 12 }, (_, i) => 'tree' + i)];

function buildScene() {
  const scene = new Scene();
  const sun = new DirectionalLight();
  scene.add(sun);
  const town = new Group(); town.name = 'town'; scene.add(town);
  const lantern = mesh('lantern'); town.add(lantern);
  const lanternLight = new PointLight(); lantern.add(lanternLight); // a light inside a renderable
  const house = mesh('house'); town.add(house);
  const door = mesh('door'); house.add(door); // a renderable inside a renderable
  for (let i = 0; i < 12; i++) town.add(mesh('tree' + i));
  const hidden = mesh('hidden'); hidden.visible = false; scene.add(hidden);
  hidden.add(mesh('underHidden'));
  const parked = mesh('parked'); parked.layers.mask = 0; scene.add(parked); // e.g. avatarDrawCalls' parked effects
  const sparks = new Points(new BufferGeometry()); sparks.name = 'sparks'; scene.add(sparks);
  return { scene, sun, lanternLight, lantern, house, door };
}

const visibleInTree = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };

function fakeRenderer({ costMs = 0, log = [] } = {}) {
  const calls = [];
  const renderer = {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    __sceneState: { ready: true, holdRender: 0 },
    _pipelines: { caches: new Map() },
    shadowMap: { needsUpdate: false },
    target: null,
    getRenderTarget() { return this.target; },
    setRenderTarget(t) { this.target = t; },
    // what r171's _projectObject draws: visible in the tree and on one of the camera's layers
    compileAsync(scene, camera) {
      const seen = [];
      const lights = [];
      scene.traverse((o) => {
        if (!visibleInTree(o) || !o.layers.test(camera.layers)) return;
        if (o.isLight) lights.push(o);
        else if (o.isMesh || o.isPoints) seen.push(o.name);
      });
      calls.push({ seen, lights: lights.length, holdRender: renderer.__sceneState.holdRender, target: renderer.target });
      log.push(1);
      const end = performance.now() + costMs * seen.length;
      while (performance.now() < end) { /* a shader build costs main-thread time */ }
      return Promise.resolve();
    },
  };
  return { renderer, calls };
}

test('planSceneSlices lists what the camera draws: renderables and lights', () => {
  const { scene } = buildScene();
  const { renderables, lights } = planSceneSlices(scene, new PerspectiveCamera());
  const names = renderables.map((o) => o.name);
  for (const name of DRAWN) assert.ok(names.includes(name), name);
  assert.ok(!names.includes('hidden') && !names.includes('underHidden'), 'hidden subtrees are not compiled now either');
  assert.ok(!names.includes('parked'), 'objects on no camera layer are not compiled now either');
  assert.equal(lights.length, 2);
});

test('a sliced precompile compiles every drawn renderable, with the full light set in each slice', async () => {
  const { scene } = buildScene();
  const { renderer, calls } = fakeRenderer({ costMs: 3 });
  const target = { isRenderTarget: true };
  const progress = [];
  const result = await precompileSceneObjects(renderer, scene, new PerspectiveCamera(), { target, sliceMs: 8,
    onProgress: (p) => progress.push(p) });
  assert.equal(result.timedOut, false);
  assert.ok(calls.length > 3, 'more than one slice: ' + calls.length);
  const compiled = new Set(calls.flatMap((c) => c.seen));
  for (const name of DRAWN) assert.ok(compiled.has(name), name + ' compiled');
  assert.ok(!compiled.has('hidden') && !compiled.has('underHidden') && !compiled.has('parked'));
  for (const call of calls) {
    assert.equal(call.lights, 2, 'both lights in every slice (shader keys include the light set)');
    assert.equal(call.holdRender, 1, 'frames are held while slicing');
    assert.equal(call.target, target, 'compiled for the scene\'s render target');
    assert.ok(call.seen.length >= 1 && call.seen.length <= 16, 'a slice is a batch, not the scene: ' + call.seen.length);
  }
  assert.deepEqual(progress.at(-1), { done: 16, total: 16 });
});

test('a sliced precompile never writes `visible` and gives every layer and culling flag back', async () => {
  const { scene, house } = buildScene();
  // the area loader's gate: writing `visible` runs callbacks (WolfveilAreaLoader installGate)
  let visibleWrites = 0;
  let visible = true;
  Object.defineProperty(house, 'visible', { get: () => visible, set: (v) => { visibleWrites++; visible = v; } });
  const camera = new PerspectiveCamera();
  camera.layers.enable(3);
  const cameraMask = camera.layers.mask;
  const before = [];
  scene.traverse((o) => before.push([o, o.layers.mask, o.frustumCulled]));
  const { renderer } = fakeRenderer();
  await precompileSceneObjects(renderer, scene, camera, { sliceMs: 5 });
  assert.equal(visibleWrites, 0, 'no visibility writes');
  for (const [o, mask, culled] of before) {
    assert.equal(o.layers.mask, mask, o.name + ' layers');
    assert.equal(o.frustumCulled, culled, o.name + ' culling');
    assert.equal(o.layers.isEnabled(PRECOMPILE_SLICE_LAYER), false);
  }
  assert.equal(camera.layers.mask, cameraMask, 'the camera sees its own layers again');
  assert.equal(renderer.__sceneState.holdRender, 0);
  assert.equal(renderer.__sceneState.backgroundCompile, true);
  assert.equal(renderer.target, null);
});

test('after a sliced precompile the static shadow map is redrawn whole', async () => {
  const sliced = fakeRenderer();
  await precompileSceneObjects(sliced.renderer, buildScene().scene, new PerspectiveCamera(), { sliceMs: 5 });
  assert.equal(sliced.renderer.shadowMap.needsUpdate, true, 'a slice drew the shadow with only its batch');
  const whole = fakeRenderer();
  await precompileSceneObjects(whole.renderer, buildScene().scene, new PerspectiveCamera());
  assert.equal(whole.renderer.shadowMap.needsUpdate, false, 'one pass draws it with everything, as before');
});

test('without sliceMs the precompile is one compileAsync call, as before', async () => {
  const { scene } = buildScene();
  const { renderer, calls } = fakeRenderer();
  await precompileSceneObjects(renderer, scene, new PerspectiveCamera());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].seen.length, 16);
});

test('precompiles on one renderer run one after another', async () => {
  const { scene } = buildScene();
  const { renderer, calls } = fakeRenderer();
  const camera = new PerspectiveCamera();
  const a = precompileSceneObjects(renderer, scene, camera, { sliceMs: 5 });
  const b = precompileSceneObjects(renderer, scene, camera, { sliceMs: 5 });
  await Promise.all([a, b]);
  assert.ok(calls.length >= 4, 'both runs sliced the scene: ' + calls.length);
  // overlapping runs would each hold the frames: the hold count would reach 2 during a compile call
  assert.ok(calls.every((c) => c.holdRender === 1), 'the later run started only after the earlier one finished');
  assert.equal(renderer.__sceneState.precompiling, null);
  assert.equal(renderer.__sceneState.holdRender, 0);
});

test('at most six slices compile their pipelines in the GPU process at once', async () => {
  const { scene } = buildScene();
  for (let i = 0; i < 40; i++) scene.add(mesh('rock' + i));
  const { renderer } = fakeRenderer({ costMs: 2 });
  let inFlight = 0;
  let most = 0;
  const compile = renderer.compileAsync;
  renderer.compileAsync = function(...a) {
    compile.apply(this, a);
    inFlight++;
    most = Math.max(most, inFlight);
    return new Promise((resolve) => { setTimeout(() => { inFlight--; resolve(); }, 15); });
  };
  await precompileSceneObjects(renderer, scene, new PerspectiveCamera(), { sliceMs: 4 });
  assert.ok(most <= 6, 'pipelines of at most 6 slices in flight, saw ' + most);
  assert.equal(inFlight, 0);
});

test('a slice holds about sliceMs of shader builds, between 1 and 16 objects', () => {
  assert.equal(nextSliceBatch(75, 40), 1, 'one ~75 ms shader build per slice');
  assert.equal(nextSliceBatch(10, 40), 4);
  assert.equal(nextSliceBatch(0.05, 40), 16, 'cached objects: the largest batch');
  assert.equal(nextSliceBatch(0, 40), 4);
});

test('the world slices its cold-load and avatar precompiles and reports progress to the entry timers', () => {
  const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(world, /precompileSceneObjects\(gpuRenderer, scene, camera, \{ target: inkLook\.sceneTarget\(\),\n\s+sliceMs: WORLD_PRECOMPILE_SLICE_MS, onProgress: reportCompileProgress \}\)/);
  assert.match(world, /precompileSceneObjects\(renderer, scene, camera, \{ target: inkLook\.sceneTarget\(\),\n\s+sliceMs: WORLD_PRECOMPILE_SLICE_MS, onProgress: reportCompileProgress \}\)/);
  const view = readFileSync(new URL('../src/pages/GameView.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(view.split("addEventListener('game3dWorldCompileProgress',progress)").length - 1, 2, 'both 30 s entry timers restart on progress');
  assert.equal(view.split("removeEventListener('game3dWorldCompileProgress',progress)").length - 1, 2);
});
