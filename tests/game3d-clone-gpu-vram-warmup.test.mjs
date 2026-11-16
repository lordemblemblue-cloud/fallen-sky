import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame3DSceneWarmup,
  shouldPrewarmGame3DTexture,
  shouldDeferGame3DWarmup,
} from '../src/components/game3d/performance/SceneWarmup.mjs';

const texture = (width, height, extra = {}) => ({
  isTexture: true, image: { width, height }, ...extra,
});

test('speculative uploads skip oversized uncompressed textures without changing actual visibility', () => {
  const enormous = texture(8192, 8192);
  const standard = texture(2048, 2048);
  assert.equal(shouldPrewarmGame3DTexture(enormous, 'auto'), false);
  assert.equal(shouldPrewarmGame3DTexture(enormous, 'quality'), true);
  assert.equal(shouldPrewarmGame3DTexture(enormous, 'off'), true);
  assert.equal(shouldPrewarmGame3DTexture(standard, 'performance'), false);
  assert.equal(shouldPrewarmGame3DTexture(standard, 'balanced'), true);
  assert.equal(shouldPrewarmGame3DTexture(texture(1024, 1024), 'performance'), true);
  assert.equal(shouldPrewarmGame3DTexture(texture(8192, 8192, { isCompressedTexture: true })), true);
  assert.equal(shouldPrewarmGame3DTexture({ isTexture: true, image: {} }), true);
});

test('only recent sustained pressure suppresses optional GPU preparation', () => {
  const slow = { sampledAt: 1000, frames: 120, p95Ms: 40, p99Ms: 180 };
  assert.equal(shouldDeferGame3DWarmup(slow, 1500), true);
  assert.equal(shouldDeferGame3DWarmup({ ...slow, frames: 1 }, 1500), false);
  assert.equal(shouldDeferGame3DWarmup({ ...slow, p95Ms: 18, p99Ms: 145 }, 1500), true);
  assert.equal(shouldDeferGame3DWarmup({ ...slow, p95Ms: 22, p99Ms: 40 }, 1500), false);
  assert.equal(shouldDeferGame3DWarmup(slow, 9000), false);
  assert.equal(shouldDeferGame3DWarmup(null, 2000), false);
});

function harness({ imageSize = 8192, profile = 'auto', overloaded = false } = {}) {
  let scheduled = null;
  let time = 1000;
  const calls = { meshes: [], textures: [] };
  const tex = texture(imageSize, imageSize);
  const mesh = { isMesh: true, material: { map: tex }, children: [] };
  const scene = { children: [mesh] };
  mesh.parent = scene;
  const host = {
    performance: { now: () => time },
    __axe3dCloneGovernor: {
      getSnapshot: () => ({
        profile, sampledAt: 900, frames: 120,
        p95Ms: overloaded ? 45 : 18, p99Ms: overloaded ? 150 : 22,
      }),
    },
    setTimeout(cb) { scheduled = cb; return 1; },
    clearTimeout() { scheduled = null; },
    addEventListener() {}, removeEventListener() {},
  };
  const renderer = {
    initTexture(t) { calls.textures.push(t); },
    async compileAsync(m) { calls.meshes.push(m); },
  };
  const manager = createGame3DSceneWarmup({ scene, camera: {}, renderer, host });
  return {
    manager, calls,
    async next() { const callback = scheduled; scheduled = null; await callback?.(); },
    setTime(value) { time = value; },
  };
}

test('background uploads respect profile but still compile small objects', async () => {
  const auto = harness();
  await auto.next();
  assert.equal(auto.calls.meshes.length, 1);
  assert.equal(auto.calls.textures.length, 0); // no eager 8192² upload
  auto.manager.dispose();

  const quality = harness({ profile: 'quality' });
  await quality.next();
  assert.equal(quality.calls.textures.length, 1);
  quality.manager.dispose();
});

test('slow-frame governor pauses optional warmup but retries when sample is stale', async () => {
  const h = harness({ imageSize: 256, overloaded: true });
  await h.next();
  assert.equal(h.calls.meshes.length, 0);
  assert.equal(h.calls.textures.length, 0);
  h.setTime(9000);
  await h.next();
  assert.equal(h.calls.meshes.length, 1);
  assert.equal(h.calls.textures.length, 1);
  h.manager.dispose();
});
