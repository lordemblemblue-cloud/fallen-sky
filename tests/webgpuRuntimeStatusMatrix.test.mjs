import test from 'node:test';
import assert from 'node:assert/strict';
import { getWebGPURuntimeEvidence, formatWebGPURuntimeEvidence } from '../src/lib/webgpuRuntimeDiagnostics.mjs';

const device = { createCommandEncoder() {}, queue: { submit() {} } };
function renderer({ native = true, ready = true, lost = false, frame = 2, draws = 1, gpuDevice = device } = {}) {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready, lost, gameplayFrames: draws },
    backend: { isWebGPUBackend: native, device: gpuDevice },
    info: { render: { frame } },
  };
}

test('native WebGPU needs a ready backend, live device, frame and world draw', () => {
  const evidence = getWebGPURuntimeEvidence(renderer(), { sceneId: 'fallen-sky' });
  assert.equal(evidence.sceneId, 'fallen-sky');
  assert.equal(evidence.status, 'verified');
  assert.equal(evidence.webgpuActive, true);
  assert.equal(Object.isFrozen(evidence), true);
  assert.match(formatWebGPURuntimeEvidence(evidence), /WebGPU active/);
});

test('initialization, fallback, device and world-draw gaps are never verified', () => {
  const cases = [
    [{ ready: false }, 'initializing'],
    [{ native: false }, 'fallback'],
    [{ gpuDevice: null }, 'device-unconfirmed'],
    [{ frame: 0 }, 'waiting-for-first-frame'],
    [{ draws: 0 }, 'waiting-for-world-draws'],
    [{ lost: true }, 'device-lost'],
  ];
  for (const [options, status] of cases) {
    const evidence = getWebGPURuntimeEvidence(renderer(options), { sceneId: 'duelist-adventure' });
    assert.equal(evidence.status, status, JSON.stringify(options));
    assert.equal(evidence.webgpuActive, false, status);
    assert.match(formatWebGPURuntimeEvidence(evidence), /not verified/, status);
  }
});

test('malformed gameplay draw counters never prove a rendered world', () => {
  for (const draws of [-1, 0.5, Infinity, NaN, '3', {}, Number.MAX_SAFE_INTEGER + 1]) {
    const evidence = getWebGPURuntimeEvidence(renderer({ draws }));
    assert.equal(evidence.gameplayFrames, 0);
    assert.equal(evidence.webgpuActive, false);
    assert.equal(evidence.status, 'waiting-for-world-draws');
  }
});

test('classic WebGL and absent renderer are not native WebGPU', () => {
  const classic = getWebGPURuntimeEvidence({ info: { render: { frame: 4 } } });
  assert.equal(classic.backend, 'classic-webgl');
  assert.equal(classic.webgpuActive, false);
  const absent = getWebGPURuntimeEvidence(null);
  assert.equal(absent.backend, 'none');
  assert.equal(absent.webgpuActive, false);
  assert.equal(formatWebGPURuntimeEvidence(null), 'WebGPU not verified (unknown; none)');
});
