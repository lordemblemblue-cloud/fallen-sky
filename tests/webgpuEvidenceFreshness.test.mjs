import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceFreshness, DEFAULT_MAX_AGE_MS, MAX_FUTURE_SKEW_MS } from '../scripts/webgpu-evidence-freshness.mjs';

const now = Date.parse('2026-11-23T05:00:00.000Z');
const report = (time) => ({ checkedAt: new Date(time).toISOString() });
test('accepts recent reports including exact age boundary', () => {
  assert.equal(validateEvidenceFreshness([report(now), report(now - DEFAULT_MAX_AGE_MS)], now).ok, true);
});
test('rejects stale reports and identifies offending report', () => {
  assert.deepEqual(validateEvidenceFreshness([report(now), report(now - DEFAULT_MAX_AGE_MS - 1)], now),
    { ok: false, reason: 'stale-check-time', reportIndex: 1 });
});
test('rejects timestamps beyond permitted clock skew', () => {
  assert.equal(validateEvidenceFreshness([report(now + MAX_FUTURE_SKEW_MS)], now).ok, true);
  assert.equal(validateEvidenceFreshness([report(now + MAX_FUTURE_SKEW_MS + 1)], now).reason, 'future-check-time');
});
test('rejects malformed, noncanonical and impossible timestamps', () => {
  for (const value of ['2026-11-23', '2026-11-23T05:00:00Z', '2026-02-30T05:00:00.000Z', null]) {
    assert.equal(validateEvidenceFreshness([{ checkedAt: value }], now).reason, 'invalid-check-time');
  }
});
test('rejects empty or invalid input and invalid time configuration', () => {
  assert.equal(validateEvidenceFreshness([], now).reason, 'invalid-freshness-input');
  assert.equal(validateEvidenceFreshness([report(now)], Infinity).reason, 'invalid-freshness-input');
  assert.equal(validateEvidenceFreshness([report(now)], now, 0).reason, 'invalid-freshness-input');
});
