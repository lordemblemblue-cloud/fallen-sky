import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextWebGLRecoveryStep, recoveryAttemptOf, withRecoveryAttempt,
  WEBGL_RECOVERY_RETRY_MS, WEBGL_RECOVERY_RELOAD_KEY, WEBGL_RECOVERY_RELOAD_GUARD_MS,
} from '../src/components/game3d/render/liveRendererRecovery.mjs';
import { chooseSceneRendererFor, rememberRendererFailure } from '../src/lib/rendererBackendChoice.mjs';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); } };
}

// GameWorld3D after a lost WebGPU device: the world remounts at once on WebGL; a start fails while the browser's GPU
// process is still restarting, and each failure asks nextWebGLRecoveryStep what to do next.
function recover({ gpuBackAfterMs, storage, startAt, reason = 'webgpu-device-lost' }) {
  let now = startAt;
  for (let mounts = 1; mounts <= 20; mounts++) {
    if (now - startAt >= gpuBackAfterMs) return { recovered: true, afterMs: now - startAt, mounts };
    const step = nextWebGLRecoveryStep({ attempt: recoveryAttemptOf(reason), storage, now });
    if (step.action !== 'retry') return { recovered: false, action: step.action, afterMs: now - startAt, mounts };
    now += step.delayMs;
    reason = withRecoveryAttempt(reason, step.attempt);
  }
  throw new Error('no decision');
}

const LOSSES = [
  { message: 'DXGI_ERROR_DEVICE_HUNG', gpuBackAfterMs: 1500 }, // two game tabs on one GPU
  { message: 'A valid external Instance reference no longer exists', gpuBackAfterMs: 6000 }, // after a viewport change
];

for (const loss of LOSSES) {
  test(`lost device (${loss.message}): the tab keeps WebGL and the world comes back once the GPU process is back`, () => {
    const session = memoryStorage();
    const host = { location: { search: '' }, navigator: { gpu: {} }, localStorage: memoryStorage(), sessionStorage: session };
    assert.equal(chooseSceneRendererFor('fallen-sky', host).kind, 'webgpu');
    rememberRendererFailure(host, 'fallen-sky'); // what recoverRenderer does on the loss
    assert.deepEqual(chooseSceneRendererFor('fallen-sky', host), { kind: 'webgl', reason: 'webgpu-failed-earlier' });
    const result = recover({ gpuBackAfterMs: loss.gpuBackAfterMs, storage: session, startAt: 1_000_000 });
    assert.equal(result.recovered, true);
    assert.ok(result.afterMs >= loss.gpuBackAfterMs && result.afterMs < loss.gpuBackAfterMs + 5000, `back after ${result.afterMs} ms`);
    assert.equal(session.getItem(WEBGL_RECOVERY_RELOAD_KEY), null, 'no reload was needed');
  });
}

test('a GPU that does not come back: one reload, then the world says it is unavailable, never a reload loop', () => {
  const session = memoryStorage();
  const total = WEBGL_RECOVERY_RETRY_MS.reduce((a, b) => a + b, 0);
  const first = recover({ gpuBackAfterMs: Infinity, storage: session, startAt: 1_000_000 });
  assert.deepEqual(first, { recovered: false, action: 'reload', afterMs: total, mounts: WEBGL_RECOVERY_RETRY_MS.length + 1 });
  // after the reload the tab starts on WebGL ('webgpu-failed-earlier') and tries the same short waits again
  const afterReload = recover({ gpuBackAfterMs: Infinity, storage: session, startAt: 1_000_000 + total + 3000,
    reason: 'webgpu-failed-earlier' });
  assert.equal(afterReload.action, 'give-up');
  // much later, a new loss in the same tab may reload once more
  const later = recover({ gpuBackAfterMs: Infinity, storage: session,
    startAt: 1_000_000 + total + WEBGL_RECOVERY_RELOAD_GUARD_MS + 1, reason: 'webgpu-device-lost' });
  assert.equal(later.action, 'reload');
});

test('without session storage it never reloads; the attempt count rides on the reason', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(nextWebGLRecoveryStep({ attempt: 9, storage: blocked }), { action: 'give-up' });
  assert.deepEqual(nextWebGLRecoveryStep({ attempt: 9, storage: null }), { action: 'give-up' });
  assert.deepEqual(nextWebGLRecoveryStep({ attempt: 0, storage: null }), { action: 'retry', delayMs: 600, attempt: 1 });
  assert.equal(recoveryAttemptOf('webgpu-device-lost'), 0);
  assert.equal(recoveryAttemptOf('webgpu-device-lost#3'), 3);
  assert.equal(withRecoveryAttempt('webgpu-device-lost#3', 4), 'webgpu-device-lost#4');
  assert.equal(withRecoveryAttempt(null, 1), 'webgl-recovery#1');
  assert.equal(nextWebGLRecoveryStep({ attempt: -2 }).attempt, 1);
});
