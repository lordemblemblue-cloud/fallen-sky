import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploymentMatrix } from '../scripts/webgpu-deployment-matrix.mjs';

function report(sceneId, origin, patch = {}) {
  const sample = (frameCount, gameplayFrames) => ({
    sceneId, backend: 'webgpu', deviceConfirmed: true, deviceLost: false,
    frameCount, gameplayFrames, canvasAttached: true,
  });
  return {
    sceneId, checkedAt: '2026-11-23T03:00:00.000Z',
    tabUrl: origin + (sceneId === 'fallen-sky' ? '/gameview' : '/duelist-next/play'),
    first: sample(20, 10), last: sample(22, 12),
    ok: true, reason: 'native-webgpu-gameplay-draws-advancing',
    ...patch,
  };
}

const preview = 'https://preview.example.test';
const live = 'https://live.example.test';
const matrix = () => [
  report('fallen-sky', preview), report('duelist-adventure', preview),
  report('fallen-sky', live), report('duelist-adventure', live),
];

test('requires four separately labeled reports, two per deployment', () => {
  assert.equal(validateDeploymentMatrix(matrix()).ok, true);
  for (const count of [0, 1, 2, 3]) {
    assert.equal(validateDeploymentMatrix(matrix().slice(0, count)).reason, 'four-reports-required');
  }
  assert.equal(validateDeploymentMatrix([...matrix(), matrix()[0]]).reason, 'four-reports-required');
});

test('accepts native counters for both games on distinct preview and live origins', () => {
  const result = validateDeploymentMatrix(matrix());
  assert.equal(result.ok, true);
  assert.equal(result.previewOrigin, preview);
  assert.equal(result.liveOrigin, live);
  assert.match(result.warning, /visible pixels/);
});

test('rejects reusing one deployment for preview and live', () => {
  const reports = matrix();
  reports[2] = report('fallen-sky', preview);
  reports[3] = report('duelist-adventure', preview);
  assert.equal(validateDeploymentMatrix(reports).reason, 'preview-and-live-share-origin');
});

test('rejects a mismatched origin within either deployment', () => {
  for (const index of [0, 1, 2, 3]) {
    const reports = matrix();
    reports[index] = { ...reports[index], tabUrl: 'https://other.example.test' +
      (reports[index].sceneId === 'fallen-sky' ? '/gameview' : '/duelist-next/play') };
    assert.match(validateDeploymentMatrix(reports).reason, /^(preview|live):reports-from-different-origins$/);
  }
});

test('rejects fallback, stalled counters, and fake success on either deployment', () => {
  for (const index of [0, 1, 2, 3]) {
    for (const patch of [
      { ok: false },
      { last: { ...matrix()[index].last, backend: 'webgl2-fallback' } },
      { last: { ...matrix()[index].last, gameplayFrames: 10 } },
    ]) {
      const reports = matrix();
      reports[index] = { ...reports[index], ...patch };
      assert.equal(validateDeploymentMatrix(reports).ok, false);
      assert.match(validateDeploymentMatrix(reports).reason, /^(preview|live):unverified-native-evidence:/);
    }
  }
});

test('rejects swapped or duplicated game reports in either deployment', () => {
  for (const [a, b] of [[0, 1], [2, 3]]) {
    const reports = matrix();
    reports[b] = reports[a];
    assert.match(validateDeploymentMatrix(reports).reason, /^(preview|live):duplicate-scene-id$/);
  }
});
