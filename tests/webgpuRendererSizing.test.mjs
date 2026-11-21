import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeRendererSize, applySafeRendererSize } from '../src/lib/webgpuRendererSizing.mjs';

test('rejects zero, negative, nonfinite and fractional subpixel viewports', () => {
  for (const [w, h, dpr, cap] of [[0, 100, 1, 2], [-1, 10, 1, 2], [10, 0, 1, 2], [NaN, 10, 1, 2], [10, Infinity, 1, 2], [10, 10, 0, 2], [10, 10, 1, -1], [0.5, 20, 1, 2]]) {
    assert.equal(getSafeRendererSize(w, h, dpr, cap), null);
  }
});

test('floors viewport dimensions and caps device pixel ratio', () => {
  assert.deepEqual(getSafeRendererSize(320.9, 240.2, 3, 1.5), { width: 320, height: 240, pixelRatio: 1.5 });
});

test('applies sizing to either renderer backend without changing canvas style', () => {
  const calls = [];
  const renderer = { setPixelRatio: (...a) => calls.push(['dpr', ...a]), setSize: (...a) => calls.push(['size', ...a]) };
  assert.equal(applySafeRendererSize(renderer, 800, 600, 2.5), true);
  assert.deepEqual(calls, [['dpr', 2], ['size', 800, 600, false]]);
});

test('hidden canvas and missing renderer methods are no-ops', () => {
  const renderer = { setPixelRatio() { throw Error('must not run'); }, setSize() { throw Error('must not run'); } };
  assert.equal(applySafeRendererSize(renderer, 0, 600), false);
  assert.equal(applySafeRendererSize({}, 800, 600), false);
  assert.equal(applySafeRendererSize(null, 800, 600), false);
});
