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

test('malformed or non-positive frame counts never verify native WebGPU', () => {
  for (const frame of [-2, -0.1, 0, NaN, Infinity, -Infinity, 'not-a-frame', null]) {
    const evidence = getWebGPURuntimeEvidence(renderer({ frame }), { sceneId: 'fallen-sky' });
    assert.equal(evidence.frameCount, 0, String(frame));
    assert.equal(evidence.status, 'waiting-for-first-frame', String(frame));
    assert.equal(evidence.webgpuActive, false, String(frame));
  }
});

test('incomplete GPUDevice and command queue cannot verify native WebGPU', () => {
  for (const gpuDevice of [
    {}, { queue: { submit() {} } },
    { createCommandEncoder() {} },
    { createCommandEncoder: true, queue: { submit() {} } },
    { createCommandEncoder() {}, queue: { submit: true } },
  ]) {
    const evidence = getWebGPURuntimeEvidence(renderer({ gpuDevice }), { sceneId: 'duelist-adventure' });
    assert.equal(evidence.deviceConfirmed, false);
    assert.equal(evidence.status, 'device-unconfirmed');
    assert.equal(evidence.webgpuActive, false);
  }
});

test('both playable scenes require live evidence rather than a scene label', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    const inactive = getWebGPURuntimeEvidence(renderer({ draws: 0 }), { sceneId });
    assert.equal(inactive.sceneId, sceneId);
    assert.equal(inactive.webgpuActive, false);
    assert.equal(inactive.status, 'waiting-for-world-draws');
    const active = getWebGPURuntimeEvidence(renderer(), { sceneId });
    assert.equal(active.sceneId, sceneId);
    assert.equal(active.webgpuActive, true);
  }
});

test('device loss overrides otherwise verified draw evidence', () => {
  const evidence = getWebGPURuntimeEvidence(renderer({ lost: true, frame: 120, draws: 80 }));
  assert.equal(evidence.deviceLost, true);
  assert.equal(evidence.status, 'device-lost');
  assert.equal(evidence.webgpuActive, false);
  assert.match(formatWebGPURuntimeEvidence(evidence), /not verified/);
});

test('fallback cannot be promoted by fabricated device and draw counters', () => {
  const evidence = getWebGPURuntimeEvidence(renderer({ native: false, frame: 500, draws: 500 }));
  assert.equal(evidence.backend, 'webgl2-fallback');
  assert.equal(evidence.status, 'fallback');
  assert.equal(evidence.webgpuActive, false);
});

test('zero and valid positive boundary counters are distinguished', () => {
  const waiting = getWebGPURuntimeEvidence(renderer({ frame: 0, draws: 1 }));
  assert.equal(waiting.status, 'waiting-for-first-frame');
  const first = getWebGPURuntimeEvidence(renderer({ frame: 1, draws: 1 }));
  assert.equal(first.frameCount, 1);
  assert.equal(first.gameplayFrames, 1);
  assert.equal(first.status, 'verified');
});

test('missing scene readiness never promotes a native-looking renderer', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    for (const state of [undefined, null, {}, { ready: 1 }, { ready: 'true' }]) {
      const candidate = renderer({ frame: 25, draws: 25 });
      candidate.__sceneState = state;
      const evidence = getWebGPURuntimeEvidence(candidate, { sceneId });
      assert.equal(evidence.initialized, false, sceneId);
      assert.equal(evidence.status, 'initializing', sceneId);
      assert.equal(evidence.webgpuActive, false, sceneId);
      assert.match(formatWebGPURuntimeEvidence(evidence), /not verified/, sceneId);
    }
  }
});

test('a failed initialization cannot be verified even with a device and stale draws', () => {
  const evidence = getWebGPURuntimeEvidence(renderer({
    ready: false, frame: 999, draws: 999,
  }), { sceneId: 'fallen-sky' });
  assert.equal(evidence.backend, 'initializing');
  assert.equal(evidence.initialized, false);
  assert.equal(evidence.webgpuActive, false);
  assert.equal(evidence.status, 'initializing');
});


test('runtime evidence is a detached immutable snapshot across renderer recovery', () => {
  for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
    const live = renderer({ frame: 4, draws: 3 });
    const first = getWebGPURuntimeEvidence(live, { sceneId });
    assert.equal(first.status, 'verified');
    live.__sceneState.lost = true;
    live.__sceneState.gameplayFrames = 0;
    live.info.render.frame = 0;
    const afterLoss = getWebGPURuntimeEvidence(live, { sceneId });
    assert.equal(afterLoss.status, 'device-lost');
    assert.equal(afterLoss.webgpuActive, false);
    assert.equal(first.status, 'verified');
    assert.equal(first.frameCount, 4);
    assert.equal(first.gameplayFrames, 3);
    assert.equal(Object.isFrozen(first), true);
    live.__sceneState.lost = false;
    live.info.render.frame = 1;
    live.__sceneState.gameplayFrames = 1;
    const recovered = getWebGPURuntimeEvidence(live, { sceneId });
    assert.equal(recovered.status, 'verified');
    assert.equal(recovered.frameCount, 1);
    assert.equal(afterLoss.status, 'device-lost');
  }
});
