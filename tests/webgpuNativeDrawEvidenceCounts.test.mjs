import test from 'node:test';
import assert from 'node:assert/strict';
import { getWebGPURuntimeEvidence, formatWebGPURuntimeEvidence } from '../src/lib/webgpuRuntimeDiagnostics.mjs';

const SCENES = ['fallen-sky', 'duelist-adventure'];

function renderer(gameplayFrames, { backend = 'webgpu', frame = 4 } = {}) {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready: true, lost: null, gameplayFrames },
    backend: {
      isWebGPUBackend: backend === 'webgpu',
      device: { createCommandEncoder() {}, queue: { submit() {} } },
    },
    info: { render: { frame } },
  };
}

for (const sceneId of SCENES) {
  test(`${sceneId}: malformed gameplay draw counts never verify native WebGPU`, () => {
    for (const invalid of [undefined, null, 0, -1, -3, 0.5, 1.25, NaN, Infinity,
      -Infinity, '1', '100', true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
      const evidence = getWebGPURuntimeEvidence(renderer(invalid), { sceneId });
      assert.equal(evidence.backend, 'webgpu');
      assert.equal(evidence.gameplayFrames, 0, `invalid draw count: ${String(invalid)}`);
      assert.equal(evidence.webgpuActive, false);
      assert.equal(evidence.status, 'waiting-for-world-draws');
      assert.match(formatWebGPURuntimeEvidence(evidence), /not verified/);
    }
  });

  test(`${sceneId}: valid counted draws verify only the actual native backend`, () => {
    const valid = getWebGPURuntimeEvidence(renderer(3), { sceneId });
    assert.equal(valid.gameplayFrames, 3);
    assert.equal(valid.webgpuActive, true);
    assert.equal(valid.status, 'verified');
    assert.equal(Object.isFrozen(valid), true);

    const fallback = getWebGPURuntimeEvidence(renderer(3, { backend: 'webgl2' }), { sceneId });
    assert.equal(fallback.backend, 'webgl2-fallback');
    assert.equal(fallback.webgpuActive, false);
    assert.equal(fallback.status, 'fallback');

    const noFrames = getWebGPURuntimeEvidence(renderer(3, { frame: 0 }), { sceneId });
    assert.equal(noFrames.webgpuActive, false);
    assert.equal(noFrames.status, 'waiting-for-first-frame');
  });
}
