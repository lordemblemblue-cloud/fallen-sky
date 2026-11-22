import test from 'node:test';
import assert from 'node:assert/strict';
import { isSceneWebGPUReady } from '../src/lib/webgpuSceneReadiness.mjs';
import { getWebGPURuntimeEvidence, formatWebGPURuntimeEvidence } from '../src/lib/webgpuRuntimeDiagnostics.mjs';

function sceneRenderer({ webgpu = true, ready = true, frames = 1, lost = false, device = true } = {}) {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready, lost, gameplayFrames: frames },
    backend: {
      isWebGPUBackend: webgpu,
      device: device ? { createCommandEncoder() {}, queue: { submit() {} } } : null,
    },
    info: { render: { frame: frames } },
  };
}

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: readiness does not establish runtime GPU activity`, () => {
    assert.equal(isSceneWebGPUReady(sceneId), true);
    for (const renderer of [null, sceneRenderer({ ready: false }), sceneRenderer({ webgpu: false }),
      sceneRenderer({ frames: 0 }), sceneRenderer({ lost: true }), sceneRenderer({ device: false })]) {
      const evidence = getWebGPURuntimeEvidence(renderer, { sceneId });
      assert.equal(evidence.sceneId, sceneId);
      assert.equal(evidence.webgpuActive, false);
      assert.notEqual(evidence.status, 'verified');
      assert.match(formatWebGPURuntimeEvidence(evidence), /^WebGPU not verified/);
    }
  });

  test(`${sceneId}: verified evidence requires a real initialized backend and frames`, () => {
    const evidence = getWebGPURuntimeEvidence(sceneRenderer(), { sceneId });
    assert.equal(evidence.backend, 'webgpu');
    assert.equal(evidence.webgpuActive, true);
    assert.equal(evidence.status, 'verified');
    assert.equal(Object.isFrozen(evidence), true);
  });
}

test('classic WebGL rendering remains distinct even with many frames', () => {
  const evidence = getWebGPURuntimeEvidence({ info: { render: { frame: 900 } } }, { sceneId: 'fallen-sky' });
  assert.equal(evidence.backend, 'classic-webgl');
  assert.equal(evidence.webgpuActive, false);
  assert.equal(evidence.status, 'fallback');
});
