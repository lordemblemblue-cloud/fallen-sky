import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSceneRendererFor } from '../src/lib/rendererBackendChoice.mjs';

// Devices upgraded from the measured-default release may retain a benchmark verdict.
// A speed estimate must never substitute for the capabilities of today's browser.
for (const faster of [true, false]) {
  test(`old benchmark (WebGPU faster = ${faster}) cannot select a gameplay backend`, () => {
    const host = { localStorage: { getItem: () => JSON.stringify({ webgpuAtLeastAsFast: faster }) },
      location: {search:''}, navigator:{gpu:{}} };
    for (const scene of ['fallen-sky', 'duelist-adventure']) {
      assert.equal(chooseSceneRendererFor(scene, host).kind,'webgpu');
      assert.equal(chooseSceneRendererFor(scene, { ...host, navigator:{} }).kind,'webgl');
    }
    assert.equal(chooseSceneRendererFor('unlisted',host).kind,'webgl');
  });
}
