import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  buildBrowserExpression, classifySamplePair, pickTarget,
} from '../scripts/webgpu-native-browser-qa.mjs';

const SCENES = ['fallen-sky', 'duelist-adventure'];
const KEY = {
  'fallen-sky': '__gw3dRenderer',
  'duelist-adventure': '__duelistGameRenderer',
};

function sample(sceneId, overrides = {}) {
  return {
    sceneId, backend: 'webgpu', deviceConfirmed: true, deviceLost: false,
    frameCount: 5, gameplayFrames: 3, ...overrides,
  };
}

function fakeRenderer(backend = 'webgpu') {
  return {
    isWebGPURenderer: true,
    __sceneState: { ready: true, lost: null, gameplayFrames: 3 },
    backend: {
      isWebGPUBackend: backend === 'webgpu',
      device: { createCommandEncoder() {}, queue: { submit() {} } },
    },
    info: { render: { frame: 5 } },
    domElement: { isConnected: true },
  };
}

for (const sceneId of SCENES) {
  test(sceneId + ': browser probe distinguishes native WebGPU from WebGL2 fallback', () => {
    const window = { [KEY[sceneId]]: fakeRenderer() };
    const native = runInNewContext(buildBrowserExpression(sceneId), { window });
    assert.equal(native.backend, 'webgpu');
    assert.equal(native.deviceConfirmed, true);
    assert.equal(native.frameCount, 5);
    assert.equal(native.gameplayFrames, 3);
    assert.equal(native.canvasAttached, true);

    window[KEY[sceneId]] = fakeRenderer('webgl2');
    const fallback = runInNewContext(buildBrowserExpression(sceneId), { window });
    assert.equal(fallback.backend, 'webgl2-fallback');
    assert.equal(fallback.deviceConfirmed, false);
  });

  test(sceneId + ': only advancing native gameplay draws pass', () => {
    assert.deepEqual(classifySamplePair(sample(sceneId), sample(sceneId, {
      frameCount: 7, gameplayFrames: 4,
    })), { ok: true, reason: 'native-webgpu-gameplay-draws-advancing' });

    for (const backend of ['webgl2-fallback', 'classic-webgl', 'none', 'initializing']) {
      const decision = classifySamplePair(sample(sceneId), sample(sceneId, { backend }));
      assert.equal(decision.ok, false);
      assert.match(decision.reason, /not-native-webgpu/);
    }
    assert.equal(classifySamplePair(sample(sceneId), sample(sceneId)).ok, false);
    assert.equal(classifySamplePair(sample(sceneId), sample(sceneId, {
      frameCount: 6, gameplayFrames: 3,
    })).reason, 'gameplay-draw-counter-not-advancing');
  });

  test(sceneId + ': unsafe counters and lost devices fail closed', () => {
    for (const value of [null, -1, 0.5, Infinity, '8', Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(classifySamplePair(sample(sceneId), sample(sceneId, {
        frameCount: value, gameplayFrames: 6,
      })).ok, false);
      assert.equal(classifySamplePair(sample(sceneId), sample(sceneId, {
        frameCount: 8, gameplayFrames: value,
      })).ok, false);
    }
    assert.equal(classifySamplePair(sample(sceneId), sample(sceneId, {
      deviceLost: true, frameCount: 8, gameplayFrames: 6,
    })).reason, 'gpu-device-lost');
    assert.equal(classifySamplePair(sample(sceneId), sample(sceneId, {
      deviceConfirmed: false, frameCount: 8, gameplayFrames: 6,
    })).reason, 'gpu-device-not-confirmed');
  });

  test(sceneId + ': never attribute another scene renderer to this session', () => {
    const other = SCENES.find((id) => id !== sceneId);
    const window = { [KEY[other]]: fakeRenderer() };
    const snapshot = runInNewContext(buildBrowserExpression(sceneId), { window });
    assert.equal(snapshot.backend, 'none');
    assert.equal(classifySamplePair(sample(other), sample(sceneId)).reason, 'invalid-scene-samples');
  });
}

test('target selection requires one local page with the requested playable route', () => {
  const target = (url) => ({
    type: 'page', url, webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
  });
  const tabs = [
    target('https://example.com/gameview?renderer=webgpu'),
    target('https://example.com/duelist-next/play?mode=practice'),
    target('https://example.com/duelist-classic'),
  ];
  assert.equal(pickTarget(tabs, 'fallen-sky').url, tabs[0].url);
  assert.equal(pickTarget(tabs, 'duelist-adventure').url, tabs[1].url);
  assert.throws(() => pickTarget([tabs[0], tabs[0]], 'fallen-sky'), /exactly one/);
  assert.throws(() => pickTarget(tabs, 'unknown'), /Unknown scene ID/);
  assert.equal(pickTarget(tabs, 'fallen-sky', '?renderer=webgpu').url, tabs[0].url);
});

test('unknown scene ids cannot inject executable code into the browser probe', () => {
  assert.throws(() => buildBrowserExpression('constructor'), /Unknown scene ID/);
  assert.throws(() => buildBrowserExpression('__proto__'), /Unknown scene ID/);
  assert.throws(() => buildBrowserExpression('fallen-sky;alert(1)'), /Unknown scene ID/);
});
