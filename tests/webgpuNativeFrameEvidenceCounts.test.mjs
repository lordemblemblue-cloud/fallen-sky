import test from 'node:test';
import assert from 'node:assert/strict';
import { getWebGPURuntimeEvidence } from '../src/lib/webgpuRuntimeDiagnostics.mjs';

function renderer(frame) {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready: true, lost: null, gameplayFrames: 3 },
    backend: { isWebGPUBackend: true, device: {
      createCommandEncoder() {}, queue: { submit() {} },
    } },
    info: { render: { frame } },
  };
}

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: malformed renderer frame evidence cannot verify WebGPU`, () => {
    for (const invalid of [undefined, null, false, true, '', '4', '0', -1, 0.5, 1.25,
      NaN, Infinity, -Infinity, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
      const evidence = getWebGPURuntimeEvidence(renderer(invalid), { sceneId });
      assert.equal(evidence.backend, 'webgpu');
      assert.equal(evidence.frameCount, 0, `invalid frame: ${String(invalid)}`);
      assert.equal(evidence.webgpuActive, false);
      assert.equal(evidence.status, 'waiting-for-first-frame');
    }
  });

  test(`${sceneId}: only valid submitted frame counters verify the initialized native backend`, () => {
    const zero = getWebGPURuntimeEvidence(renderer(0), { sceneId });
    assert.equal(zero.webgpuActive, false);
    assert.equal(zero.status, 'waiting-for-first-frame');
    const valid = getWebGPURuntimeEvidence(renderer(4), { sceneId });
    assert.equal(valid.frameCount, 4);
    assert.equal(valid.webgpuActive, true);
    assert.equal(valid.status, 'verified');
  });
}
