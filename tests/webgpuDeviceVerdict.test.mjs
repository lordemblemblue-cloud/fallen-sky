import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_VERDICT_KEY, VERDICT_MAX_AGE_MS, VERDICT_TOLERANCE,
  verdictFromTimings, readDeviceVerdict, writeDeviceVerdict,
} from '../src/lib/webgpuDeviceVerdict.mjs';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, map };
}

test('WebGPU counts as at least as fast up to the tolerance, and only with real timings', () => {
  assert.equal(verdictFromTimings({ webglMs: 10, webgpuMs: 9 }).webgpuAtLeastAsFast, true);
  assert.equal(verdictFromTimings({ webglMs: 10, webgpuMs: 10 * VERDICT_TOLERANCE }).webgpuAtLeastAsFast, true);
  assert.equal(verdictFromTimings({ webglMs: 10, webgpuMs: 10.6 }).webgpuAtLeastAsFast, false);
  assert.equal(verdictFromTimings({ webglMs: 4.2, webgpuMs: 8.4 }).ratio, 2);
  for (const bad of [{}, { webglMs: 0, webgpuMs: 1 }, { webglMs: 1, webgpuMs: NaN }, { webglMs: -1, webgpuMs: 1 }]) {
    assert.equal(verdictFromTimings(bad), null);
  }
});

test('a stored verdict holds for the same browser build only, for 30 days', () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  assert.equal(writeDeviceVerdict({ storage, fingerprint: 'UA-1', verdict: verdictFromTimings({ webglMs: 10, webgpuMs: 8 }), now }), true);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'UA-1', now }).webgpuAtLeastAsFast, true);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'UA-2', now }), null);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'UA-1', now: now + VERDICT_MAX_AGE_MS + 1 }), null);
  assert.equal(readDeviceVerdict({ storage, fingerprint: 'UA-1', now: now - 3_600_000 }), null); // from the future
});

test('unreadable or forged storage never yields a verdict', () => {
  const now = Date.now();
  const cases = ['not json', JSON.stringify({ webgpuAtLeastAsFast: 'true', fingerprint: 'UA', measuredAt: now }),
    JSON.stringify({ webgpuAtLeastAsFast: true, fingerprint: 'UA' }), JSON.stringify([true])];
  for (const raw of cases) {
    assert.equal(readDeviceVerdict({ storage: memoryStorage({ [DEVICE_VERDICT_KEY]: raw }), fingerprint: 'UA', now }), null);
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readDeviceVerdict({ storage: blocked, fingerprint: 'UA', now }), null);
  assert.equal(writeDeviceVerdict({ storage: blocked, fingerprint: 'UA', verdict: { webgpuAtLeastAsFast: true }, now }), false);
  assert.equal(writeDeviceVerdict({ storage: memoryStorage(), fingerprint: 'UA', verdict: { webgpuAtLeastAsFast: 1 }, now }), false);
  assert.equal(readDeviceVerdict({ storage: null, fingerprint: 'UA', now }), null);
});
