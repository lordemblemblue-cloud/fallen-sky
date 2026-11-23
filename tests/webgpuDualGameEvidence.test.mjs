import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDualGameEvidence } from '../scripts/webgpu-dual-game-evidence.mjs';

const now = '2026-11-22T23:00:00.000Z';
function report(sceneId, overrides = {}) {
  const sample = (frameCount, gameplayFrames) => ({
    sceneId, backend: 'webgpu', deviceConfirmed: true, deviceLost: false,
    frameCount, gameplayFrames, canvasAttached: true,
  });
  return {
    sceneId, checkedAt: now, tabUrl: sceneId === 'fallen-sky'
      ? 'https://example.test/gameview' : 'https://example.test/duelist-next/play',
    first: sample(10, 4), last: sample(12, 6),
    ok: true, reason: 'native-webgpu-gameplay-draws-advancing', ...overrides,
  };
}
const pair = () => [report('fallen-sky'), report('duelist-adventure')];

test('both current games are required and order does not matter', () => {
  assert.equal(validateDualGameEvidence(pair()).ok, true);
  assert.equal(validateDualGameEvidence(pair().reverse()).ok, true);
  assert.equal(validateDualGameEvidence(pair().slice(0, 1)).reason, 'exactly-two-reports-required');
  assert.equal(validateDualGameEvidence([pair()[0], pair()[0]]).reason, 'duplicate-scene-id');
});

test('rejects spoofed success and missing native draw evidence', () => {
  for (const patch of [
    { ok: false }, { reason: 'fake-success' },
    { last: { ...pair()[0].last, backend: 'webgl2-fallback' } },
    { last: { ...pair()[0].last, frameCount: 10 } },
    { last: { ...pair()[0].last, gameplayFrames: 4 } },
    { first: { ...pair()[0].first, deviceConfirmed: false } },
    { last: { ...pair()[0].last, deviceLost: true } },
    { last: { ...pair()[0].last, canvasAttached: false } },
    { last: { ...pair()[0].last, frameCount: 12.5 } },
  ]) {
    const result = validateDualGameEvidence([report('fallen-sky', patch), report('duelist-adventure')]);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.match(result.reason, /^unverified-native-evidence:/);
  }
});

test('scene IDs and playable routes must match the report and both samples', () => {
  const cases = [
    { sceneId: 'unknown' },
    { tabUrl: 'https://example.test/duelist-next/play' },
    { tabUrl: 'https://example.test/gameviewer' },
    { tabUrl: 'file:///gameview' },
    { tabUrl: 'bad-url' },
    { first: { ...pair()[0].first, sceneId: 'duelist-adventure' } },
  ];
  for (const patch of cases) assert.equal(
    validateDualGameEvidence([report('fallen-sky', patch), report('duelist-adventure')]).ok, false,
    JSON.stringify(patch),
  );
});

test('only same-window valid ISO timestamps are accepted', () => {
  for (const checkedAt of [
    '', 'yesterday', '2026-11-22', '2026-11-22T23:00:00Z',
    '2026-13-22T23:00:00.000Z', '2026-11-22T23:00:00.000+00:00',
    '2026-11-23T00:00:00.001Z',
  ]) {
    assert.equal(validateDualGameEvidence([
      report('fallen-sky', { checkedAt }), report('duelist-adventure'),
    ]).ok, false, checkedAt);
  }
  assert.equal(validateDualGameEvidence([
    report('fallen-sky'), report('duelist-adventure', { checkedAt: '2026-11-23T00:00:00.000Z' }),
  ]).ok, true);
});

test('successful evidence is still explicitly not a visible-pixel or performance certification', () => {
  const decision = validateDualGameEvidence(pair());
  assert.equal(decision.ok, true);
  assert.match(decision.warning, /Physical screenshots/);
});
