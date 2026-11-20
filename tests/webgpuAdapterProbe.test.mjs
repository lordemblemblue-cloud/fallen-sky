import test from 'node:test';
import assert from 'node:assert/strict';
import { probeWebGPUAdapter } from '../src/lib/webgpuAdapterProbe.mjs';

test('server environment or missing WebGPU reports unavailable', async () => {
  assert.deepEqual(await probeWebGPUAdapter({ gpu: undefined }), { available: false, reason: 'webgpu-unavailable' });
  assert.deepEqual(await probeWebGPUAdapter({ gpu: {} }), { available: false, reason: 'webgpu-unavailable' });
});

test('browser WebGPU API with no usable adapter falls back', async () => {
  assert.deepEqual(await probeWebGPUAdapter({ gpu: { requestAdapter: async () => null } }), {
    available: false, reason: 'webgpu-no-adapter',
  });
});

test('adapter request rejection is a nonfatal fallback', async () => {
  assert.deepEqual(await probeWebGPUAdapter({ gpu: { requestAdapter: async () => { throw Error('blocked'); } } }), {
    available: false, reason: 'webgpu-adapter-failed',
  });
});

test('successful adapter probe forwards power preference', async () => {
  let received;
  const gpu = { requestAdapter: async (options) => { received = options; return {}; } };
  assert.deepEqual(await probeWebGPUAdapter({ gpu, powerPreference: 'low-power' }), {
    available: true, reason: null,
  });
  assert.deepEqual(received, { powerPreference: 'low-power' });
});
