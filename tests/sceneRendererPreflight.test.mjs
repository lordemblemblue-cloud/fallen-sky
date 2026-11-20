import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightSceneRenderer } from '../src/lib/sceneRendererPreflight.mjs';

test('unmigrated scenes never probe', async () => {
  let calls = 0;
  const result = await preflightSceneRenderer({ sceneWebGPUReady: false, probeAdapter: async () => { calls++; return { available: true }; } });
  assert.equal(result.backend, 'webgl');
  assert.equal(result.reason, 'scene-not-migrated');
  assert.equal(calls, 0);
});
test('explicit WebGL selection never probes', async () => {
  let calls = 0;
  const result = await preflightSceneRenderer({ requested: 'webgl', sceneWebGPUReady: true, probeAdapter: async () => { calls++; return { available: true }; } });
  assert.equal(result.backend, 'webgl');
  assert.equal(calls, 0);
});
test('ready scene with available adapter selects WebGPU', async () => {
  const result = await preflightSceneRenderer({ sceneWebGPUReady: true, probeAdapter: async () => ({ available: true }) });
  assert.equal(result.backend, 'webgpu');
});
test('missing probe safely falls back', async () => {
  const result = await preflightSceneRenderer({ sceneWebGPUReady: true });
  assert.deepEqual(result, { backend: 'webgl', reason: 'adapter-probe-missing' });
});
test('null adapter result safely falls back', async () => {
  const result = await preflightSceneRenderer({ sceneWebGPUReady: true, probeAdapter: async () => null });
  assert.deepEqual(result, { backend: 'webgl', reason: 'adapter-unavailable' });
});
test('probe failure safely falls back', async () => {
  const result = await preflightSceneRenderer({ sceneWebGPUReady: true, probeAdapter: async () => { throw new Error('GPU denied'); } });
  assert.deepEqual(result, { backend: 'webgl', reason: 'adapter-probe-failed' });
});
test('probe reason is preserved', async () => {
  const result = await preflightSceneRenderer({ sceneWebGPUReady: true, probeAdapter: async () => ({ available: false, reason: 'no-adapter' }) });
  assert.deepEqual(result, { backend: 'webgl', reason: 'no-adapter' });
});
