// Character screen performance (docs/GAME3D_CHARACTER_SCREEN_PERF_20261122.md): one renderer for every creator stage,
// GPU devices and WebGL contexts freed on purpose, and the world's backdrop held behind the open creator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCreatorRendererPool, CREATOR_RENDERER_IDLE_MS } from '../src/components/onboarding/creatorRendererPool.mjs';
import { createEntryBackdropHold, CREATOR_BACKDROP_SETTLE_MS } from '../src/components/game3d/player/game3dEntryBackdropHold.mjs';
import { destroySceneRenderer } from '../src/lib/webgpuSceneRenderer.js';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function fakePool({ idleMs = CREATOR_RENDERER_IDLE_MS } = {}) {
  const made = [];
  const destroyed = [];
  const timers = new Map();
  let nextTimer = 1;
  const pool = createCreatorRendererPool({
    create: () => { const value = { id: made.length + 1, lost: false }; made.push(value); return value; },
    destroy: (value, data) => { destroyed.push(value.id); data.disposed = true; },
    isLost: (value) => value.lost,
    idleMs,
    setTimer: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  });
  const runTimers = () => { for (const [id, { fn }] of [...timers]) { timers.delete(id); fn(); } };
  return { pool, made, destroyed, timers, runTimers };
}

test('creator stages that follow each other share one renderer', () => {
  const { pool, made, destroyed } = fakePool();
  // React's development double mount, then select -> creator -> select for the next character
  for (let i = 0; i < 5; i++) {
    const lease = pool.acquire();
    assert.equal(lease.value, made[0]);
    assert.equal(lease.shared, true);
    lease.release();
  }
  assert.equal(made.length, 1, 'one renderer (one GPU device or WebGL context) for all five stages');
  assert.deepEqual(destroyed, []);
  assert.equal(pool.stats().reused, 4);
});

test('the shared renderer keeps its cache (the studio environment) between stages', () => {
  const { pool } = fakePool();
  const first = pool.acquire();
  first.data.studio = 'env';
  first.release();
  assert.equal(pool.acquire().data.studio, 'env');
});

test('a stage opened while the shared renderer is busy gets a private renderer, destroyed with it', () => {
  const { pool, made, destroyed } = fakePool();
  const a = pool.acquire();
  const b = pool.acquire();
  assert.notEqual(b.value, a.value);
  assert.equal(b.shared, false);
  b.release();
  assert.deepEqual(destroyed, [2], 'the private renderer is freed at once');
  a.release();
  assert.equal(made.length, 2);
  assert.equal(pool.stats().private, 1);
});

test('the idle shared renderer is destroyed after the grace period (entering the world leaves none behind)', () => {
  const { pool, destroyed, timers, runTimers } = fakePool();
  pool.acquire().release();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, CREATOR_RENDERER_IDLE_MS);
  runTimers();
  assert.deepEqual(destroyed, [1]);
  assert.equal(pool.stats().live, 0);
  // a later creator visit makes a fresh renderer
  const again = pool.acquire();
  assert.equal(again.value.id, 2);
});

test('acquiring within the grace period cancels the pending destroy', () => {
  const { pool, destroyed, timers } = fakePool();
  pool.acquire().release();
  const lease = pool.acquire();
  assert.equal(timers.size, 0);
  assert.deepEqual(destroyed, []);
  lease.release();
  pool.flushIdle();
  assert.deepEqual(destroyed, [1]);
});

test('a lost shared renderer is replaced, never handed out again', () => {
  const { pool, made, destroyed } = fakePool();
  const lease = pool.acquire();
  made[0].lost = true;
  lease.release();
  assert.deepEqual(destroyed, [1]);
  assert.equal(pool.acquire().value.id, 2);
});

test('releasing a lease twice destroys nothing twice', () => {
  const { pool, destroyed, runTimers } = fakePool();
  const lease = pool.acquire();
  lease.release();
  lease.release();
  runTimers();
  runTimers();
  assert.deepEqual(destroyed, [1]);
});

test('destroySceneRenderer frees a classic WebGL context instead of leaving it to the garbage collector', () => {
  const calls = [];
  destroySceneRenderer({ isWebGPURenderer: false, dispose: () => calls.push('dispose'), forceContextLoss: () => calls.push('lose') });
  assert.deepEqual(calls, ['dispose', 'lose']);
});

test('destroySceneRenderer destroys the GPU device of a disposed WebGPU renderer', () => {
  const calls = [];
  const renderer = { isWebGPURenderer: true, __sceneState: { ready: true, disposed: true },
    dispose: () => calls.push('dispose'), backend: { device: { destroy: () => calls.push('device.destroy') } } };
  destroySceneRenderer(renderer);
  assert.deepEqual(calls, ['device.destroy']);
  assert.equal(renderer.__sceneState.destroyDevice, true);
});

test('destroySceneRenderer loses the context of WebGPURenderer\'s WebGL2 fallback backend', () => {
  const calls = [];
  const gl = { getExtension: (name) => (name === 'WEBGL_lose_context' ? { loseContext: () => calls.push('loseContext') } : null) };
  destroySceneRenderer({ isWebGPURenderer: true, __sceneState: { ready: true, disposed: true }, dispose() {}, backend: { gl } });
  assert.deepEqual(calls, ['loseContext']);
});

test('destroySceneRenderer on a live WebGPU renderer asks its dispose to destroy the device', () => {
  const state = { ready: true, disposed: false };
  let disposed = 0;
  destroySceneRenderer({ isWebGPURenderer: true, __sceneState: state, dispose: () => { disposed++; } });
  assert.equal(disposed, 1);
  assert.equal(state.destroyDevice, true, 'the createWebGPUSceneRenderer dispose wrapper destroys the device after three\'s dispose');
});

test('the world keeps drawing on start, faction and select, and holds its frame behind the settled creator', () => {
  const hold = createEntryBackdropHold();
  assert.equal(hold.shouldHold('start', 0), false);
  assert.equal(hold.shouldHold('start', 60000), false);
  assert.equal(hold.shouldHold('faction', 61000), false);
  assert.equal(hold.shouldHold('creator', 62000), false, 'the camera first eases into the creator framing');
  assert.equal(hold.shouldHold('creator', 62000 + CREATOR_BACKDROP_SETTLE_MS - 1), false);
  assert.equal(hold.shouldHold('creator', 62000 + CREATOR_BACKDROP_SETTLE_MS), true);
  assert.equal(hold.shouldHold('creator', 90000), true);
  assert.equal(hold.shouldHold('select', 90010), false, 'closing the creator draws the world again at once');
  assert.equal(hold.shouldHold('creator', 90020), false, 'a new creator visit settles again');
  hold.reset();
  assert.equal(hold.shouldHold('creator', 100000), false);
});

test('GameWorld3D holds the backdrop only in its entry branch, after the menu state is cleared', () => {
  const src = source('src/components/game3d/GameWorld3D.jsx');
  const entry = src.indexOf('if (entryModeRef.current) {\n        menuCameraHeld=true;');
  assert.ok(entry > 0, 'entry branch found');
  const holdAt = src.indexOf('if(entryBackdrop.shouldHold(entryPreviewModeRef.current,renderNow))return;', entry);
  const drawAt = src.indexOf('if(renderThisFrame)drawWorld(camera,renderNow);\n        return;', entry);
  assert.ok(holdAt > entry && holdAt < drawAt, 'the hold check sits inside the entry branch, before its draw');
  assert.ok(src.indexOf('keys.current={};', entry) < holdAt, 'input is still cleared every menu frame');
  assert.equal(src.split('entryBackdrop.shouldHold(').length - 1, 1, 'gameplay frames never hold');
});

test('creator stages take their renderer from the pool and give it back', () => {
  const src = source('src/components/onboarding/creatorStageScene.js');
  assert.match(src, /const lease = creatorRenderers\.acquire\(\);/);
  assert.match(src, /lease\.release\(\);/);
  assert.equal(src.split("createSceneRenderer('fallen-sky'").length - 1, 1, 'only the pool creates renderers');
  assert.doesNotMatch(src, /renderer\.forceContextLoss/, 'the pool frees the context, not each stage');
  assert.match(src, /precompileSceneObjects\(renderer, scene, camera/, 'WebGPU stages compile before their first draw');
});
