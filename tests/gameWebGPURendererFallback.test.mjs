import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameWebGPURenderer, createGameRendererWithFallback } from '../src/lib/gameWebGPURenderer.js';

const fakeGL = (options) => ({ domElement: options.canvas ?? { type: 'fresh-canvas' } });

test('WebGPU absence short-circuits initialization', async () => {
  let invoked = false;
  const result = await createGameWebGPURenderer({ webgpuAvailable: false, makeWebGPURenderer: () => { invoked = true; } });
  assert.equal(invoked, false);
  assert.equal(result.reason, 'webgpu-unavailable');
  assert.equal(result.renderer, null);
});

test('successful WebGPU initialization does not allocate WebGL', async () => {
  let initialized = 0;
  let webglCalls = 0;
  const canvas = {};
  const gpu = { domElement: canvas, init: async () => { initialized += 1; } };
  const result = await createGameRendererWithFallback({ canvas, webgpuAvailable: true,
    makeWebGPURenderer: async (opts) => { assert.equal(opts.canvas, canvas); return gpu; },
    makeWebGLRenderer: async () => { webglCalls += 1; },
  });
  assert.equal(result.renderer, gpu);
  assert.equal(result.backend, 'webgpu');
  assert.equal(result.canvasReplaced, false);
  assert.equal(initialized, 1);
  assert.equal(webglCalls, 0);
});

test('failed WebGPU init falls back with a fresh canvas despite dispose failure', async () => {
  const oldCanvas = {};
  const cause = new Error('adapter disappeared');
  let glOptions;
  const result = await createGameRendererWithFallback({ canvas: oldCanvas, webgpuAvailable: true,
    makeWebGPURenderer: () => ({ init: async () => { throw cause; }, dispose: () => { throw new Error('device lost'); } }),
    makeWebGLRenderer: async (options) => { glOptions = options; return fakeGL(options); },
  });
  assert.equal(Object.hasOwn(glOptions, 'canvas'), false);
  assert.equal(result.backend, 'webgl');
  assert.equal(result.fallbackReason, 'webgpu-init-failed');
  assert.equal(result.canvasReplaced, true);
  assert.notEqual(result.renderer.domElement, oldCanvas);
});

test('WebGPU constructor failure also triggers fresh-canvas WebGL fallback', async () => {
  const oldCanvas = {};
  const result = await createGameRendererWithFallback({ canvas: oldCanvas, webgpuAvailable: true,
    makeWebGPURenderer: () => { throw new Error('backend missing'); },
    makeWebGLRenderer: async (options) => { assert.equal(options.canvas, undefined); return fakeGL(options); },
  });
  assert.equal(result.fallbackReason, 'webgpu-init-failed');
  assert.equal(result.canvasReplaced, true);
});

test('missing WebGPU support reuses existing canvas for WebGL', async () => {
  const canvas = {};
  const result = await createGameRendererWithFallback({ canvas, webgpuAvailable: false,
    makeWebGPURenderer: () => { throw new Error('should not be called'); },
    makeWebGLRenderer: async (options) => fakeGL(options),
  });
  assert.equal(result.renderer.domElement, canvas);
  assert.equal(result.canvasReplaced, false);
  assert.equal(result.fallbackReason, 'webgpu-unavailable');
});

test('explicit WebGL request skips WebGPU and retains canvas', async () => {
  const canvas = {};
  const result = await createGameRendererWithFallback({ preferWebGPU: false, canvas,
    makeWebGPURenderer: () => { throw new Error('should not be called'); },
    makeWebGLRenderer: async (options) => fakeGL(options),
  });
  assert.equal(result.backend, 'webgl');
  assert.equal(result.canvasReplaced, false);
  assert.equal(result.fallbackReason, 'webgpu-not-requested');
});

test('WebGL allocation errors propagate when no renderer is usable', async () => {
  await assert.rejects(createGameRendererWithFallback({ webgpuAvailable: false,
    makeWebGLRenderer: () => { throw new Error('WebGL unavailable'); },
  }), /WebGL unavailable/);
});
