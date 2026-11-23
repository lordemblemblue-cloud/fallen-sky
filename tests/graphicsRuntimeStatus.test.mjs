import test from 'node:test';
import assert from 'node:assert/strict';
import { readGraphicsRuntimeStatus, humanGraphicsStatus } from '../src/lib/graphicsRuntimeStatus.mjs';

function gpuRenderer({ backend = 'webgpu', ready = true, frame = 4, lost = null } = {}) {
  return {
    isWebGPURenderer: true, __sceneState: { ready, lost, gameplayFrames: 1 },
    backend: { isWebGPUBackend: backend === 'webgpu', device: {
      createCommandEncoder() {}, queue: { submit() {} },
      adapterInfo: { vendor: 'NVIDIA', device: 'RTX test device' },
    } },
    info: { render: { frame } },
  };
}

test('Fallen Sky reports the initialized gameplay GPU, not mere browser support', () => {
  const status = readGraphicsRuntimeStatus('fallen-sky', {
    __gw3dRenderer: gpuRenderer(), __gw3dRendererChoice: { reason: 'scene-ready' },
  });
  assert.equal(status.webgpuActive, true);
  assert.equal(status.adapterName, 'NVIDIA RTX test device');
  assert.equal(status.selectionReason, 'scene-ready');
});

test('Duelist reports its live match renderer, not the hangar or GPU support', () => {
  assert.equal(readGraphicsRuntimeStatus('duelist-adventure', { navigator: { gpu: {} } }).rendererPresent, false);
  const status = readGraphicsRuntimeStatus('duelist-adventure', {
    __duelistGameRenderer: gpuRenderer({ backend: 'webgl2' }),
  });
  assert.equal(status.backend, 'webgl2-fallback');
  assert.equal(status.webgpuActive, false);
  assert.equal(status.adapterName, null);
});

test('game sessions cannot be confused with one another', () => {
  const host = { __gw3dRenderer: gpuRenderer() };
  assert.equal(readGraphicsRuntimeStatus('duelist-adventure', host).rendererPresent, false);
  assert.equal(readGraphicsRuntimeStatus('unknown', host).rendererPresent, false);
});

test('classic WebGL and device loss never claim verified WebGPU', () => {
  const classic = readGraphicsRuntimeStatus('fallen-sky', {
    __gw3dRenderer: { info: { render: { frame: 55 } } },
    __gw3dGpuInfo: { renderer: 'NVIDIA WebGL adapter' },
  });
  assert.equal(classic.webgpuActive, false);
  assert.match(humanGraphicsStatus(classic), /not WebGPU/);
  assert.equal(classic.webglRendererName, 'NVIDIA WebGL adapter');
  const lost = readGraphicsRuntimeStatus('duelist-adventure', {
    __duelistGameRenderer: gpuRenderer({ lost: { reason: 'destroyed' } }),
  });
  assert.equal(lost.webgpuActive, false);
  assert.match(humanGraphicsStatus(lost), /lost/i);
});

test('a renderer without submitted frame calls remains unverified', () => {
  const status = readGraphicsRuntimeStatus('duelist-adventure', {
    __duelistGameRenderer: gpuRenderer({ frame: 0 }),
  });
  assert.equal(status.webgpuActive, false);
  assert.equal(status.status, 'waiting-for-first-frame');
});
