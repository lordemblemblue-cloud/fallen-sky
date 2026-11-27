import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFreshDeploymentMatrix } from '../scripts/webgpu-fresh-deployment-matrix.mjs';

const now = Date.parse('2026-11-23T12:00:00.000Z');
function report(sceneId, origin, checkedAt = new Date(now).toISOString()) {
  const sample = (frameCount, gameplayFrames) => ({
    sceneId, backend: 'webgpu', deviceConfirmed: true, deviceLost: false,
    frameCount, gameplayFrames, canvasAttached: true,
  });
  return {
    sceneId, checkedAt,
    tabUrl: origin + (sceneId === 'fallen-sky' ? '/gameview' : '/duelist-next/play'),
    first: sample(20, 10), last: sample(22, 12),
    documentCheck: { ok: true, reason: 'same-browser-document' },
    ok: true, reason: 'native-webgpu-gameplay-draws-advancing',
  };
}
function matrix() {
  return [
    report('fallen-sky', 'https://preview.example.test'),
    report('duelist-adventure', 'https://preview.example.test'),
    report('fallen-sky', 'https://live.example.test'),
    report('duelist-adventure', 'https://live.example.test'),
  ];
}
test('accepts current native reports for both games on both origins', () => {
  const result = validateFreshDeploymentMatrix(matrix(), now);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.freshness, 'report-times-within-freshness-window');
});
test('rejects stale or future reports at every game/deployment position', () => {
  for (const index of [0, 1, 2, 3]) {
    for (const [timestamp, reason] of [
      [new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString(), 'freshness:stale-check-time'],
      [new Date(now + 5 * 60 * 1000 + 1).toISOString(), 'freshness:future-check-time'],
    ]) {
      const reports = matrix();
      reports[index] = { ...reports[index], checkedAt: timestamp };
      const result = validateFreshDeploymentMatrix(reports, now);
      assert.equal(result.ok, false);
      assert.match(result.reason, /^(freshness:|preview:|live:)/);
      // Same-deployment one-hour correlation can reject old captures earlier.
      if (result.reason.startsWith('freshness:')) assert.equal(result.reason, reason);
    }
  }
});
test('does not let fresh timestamps override invalid native evidence', () => {
  const reports = matrix();
  reports[2] = { ...reports[2], documentCheck: { ok: false, reason: 'browser-tab-navigated-or-reloaded' } };
  assert.match(validateFreshDeploymentMatrix(reports, now).reason, /^live:unverified-browser-document:/);
});
test('rejects incomplete deployment coverage before considering freshness', () => {
  assert.equal(validateFreshDeploymentMatrix(matrix().slice(0, 3), now).reason, 'four-reports-required');
});
