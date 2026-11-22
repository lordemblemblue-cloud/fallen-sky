import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceZeroDrawStreak } from '../src/lib/webgpuZeroDrawStreak.mjs';

const seed = (sceneId, rendererId) => ({ sceneId, rendererId, consecutive: 0, alert: false });
const sample = (frame, calls) => ({ frame, calls });

for (const sceneId of ['fallen-sky', 'duelist-adventure']) {
  test(`${sceneId}: only alerts after three consecutive advancing zero-draw pairs`, () => {
    const rendererId = 'instance-1';
    let state = seed(sceneId, rendererId);
    for (let i = 1; i <= 3; i++) {
      state = advanceZeroDrawStreak(state, sample(i, 0), sample(i + 1, 0), { sceneId, rendererId });
      assert.equal(state.consecutive, i);
      assert.equal(state.alert, i >= 3);
    }
    assert.equal(Object.isFrozen(state), true);
    state = advanceZeroDrawStreak(state, sample(4, 0), sample(5, 2), { sceneId, rendererId });
    assert.equal(state.alert, false);
    assert.equal(state.consecutive, 0);
  });
}
test('scene switch and renderer replacement invalidate prior streaks', () => {
  const prior = { sceneId: 'fallen-sky', rendererId: 'old', consecutive: 100 };
  for (const [sceneId, rendererId] of [['duelist-adventure', 'old'], ['fallen-sky', 'new']]) {
    const state = advanceZeroDrawStreak(prior, sample(9, 0), sample(10, 0), { sceneId, rendererId });
    assert.equal(state.alert, false);
    assert.equal(state.consecutive, 0);
  }
});
test('missing, corrupt and stalled counters fail closed', () => {
  const prior = seed('fallen-sky', 'r1');
  for (const [a, b] of [[sample(1, 0), sample(1, 0)], [sample(2, 0), sample(1, 0)],
    [sample(1, -1), sample(2, 0)], [sample(NaN, 0), sample(2, 0)], [null, sample(2, 0)],
    [sample(1, 0), { frame: 2, get calls() { throw Error('blocked'); } }]]) {
    assert.equal(advanceZeroDrawStreak(prior, a, b, { sceneId: 'fallen-sky', rendererId: 'r1' }).alert, false);
  }
});
test('invalid thresholds never produce alerts', () => {
  for (const threshold of [0, 1, NaN, Infinity, 2.5]) {
    assert.equal(advanceZeroDrawStreak(seed('fallen-sky', 'r'), sample(1, 0), sample(2, 0),
      { sceneId: 'fallen-sky', rendererId: 'r', threshold }).alert, false);
  }
});
