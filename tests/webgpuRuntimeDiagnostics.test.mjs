import test from 'node:test';
import assert from 'node:assert/strict';
import { getWebGPURuntimeEvidence, formatWebGPURuntimeEvidence } from '../src/lib/webgpuRuntimeDiagnostics.mjs';

function renderer({ backend = 'webgpu', ready = true, frames = 3, lost = null, device = true } = {}) {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready, lost, gameplayFrames: 1 },
    backend: { isWebGPUBackend: backend === 'webgpu',
      device: device ? { createCommandEncoder() {}, queue: { submit() {} } } : null },
    info: { render: { frame: frames } },
  };
}

test('verifies actual initialized backend, GPUDevice and rendered frames', () => {
  const evidence = getWebGPURuntimeEvidence(renderer(), { sceneId: 'fallen-sky' });
  assert.equal(evidence.webgpuActive, true);
  assert.equal(evidence.status, 'verified');
  assert.match(formatWebGPURuntimeEvidence(evidence), /WebGPU active/);
});

test('does not mistake WebGPU renderer WebGL2 fallback for real WebGPU', () => {
  const evidence = getWebGPURuntimeEvidence(renderer({ backend: 'webgl2' }));
  assert.equal(evidence.backend, 'webgl2-fallback');
  assert.equal(evidence.webgpuActive, false);
});

test('does not mistake classic WebGL for WebGPU', () => {
  const evidence = getWebGPURuntimeEvidence({ info: { render: { frame: 20 } } });
  assert.equal(evidence.backend, 'classic-webgl');
  assert.equal(evidence.webgpuActive, false);
});

test('requires initialized renderer and a live device', () => {
  assert.equal(getWebGPURuntimeEvidence(renderer({ ready: false })).webgpuActive, false);
  assert.equal(getWebGPURuntimeEvidence(renderer({ device: false })).status, 'device-unconfirmed');
});

test('requires real frames, rejects device loss', () => {
  assert.equal(getWebGPURuntimeEvidence(renderer({ frames: 0 })).status, 'waiting-for-first-frame');
  assert.equal(getWebGPURuntimeEvidence(renderer({ lost: { reason: 'destroyed' } })).status, 'device-lost');
});
