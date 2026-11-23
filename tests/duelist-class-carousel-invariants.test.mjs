import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITY_SLOTS, CLASS_IDS, CLASSES, visibleClassAbilities } from '../src/components/duelist/core/classes.mjs';

test('class ability carousel returns frozen views, wraps, and exposes every distinct move', () => {
  assert.equal(ABILITY_SLOTS, 3);
  assert.deepEqual(CLASS_IDS, ['warrior', 'duelist', 'assassin', 'healer']);
  for (const id of CLASS_IDS) {
    const abilities = CLASSES[id].abilities;
    assert.equal(new Set(abilities.map(a => a.id)).size, 4);
    for (const first of [-9, -1, 0, 1, 2, 3, 4, 9, 100]) {
      const view = visibleClassAbilities(id, first);
      assert.ok(Object.isFrozen(view));
      assert.deepEqual(view.map(a => a.id), Array.from({ length: 3 }, (_, n) => abilities[((first + n) % 4 + 4) % 4].id));
    }
    assert.deepEqual(new Set([0, 1, 2, 3].map(n => visibleClassAbilities(id, n)[0].id)),
      new Set(abilities.map(a => a.id)));
  }
});

test('invalid carousel offsets fall back to the first three moves; unknown classes are empty', () => {
  for (const id of CLASS_IDS) {
    const expected = visibleClassAbilities(id, 0).map(a => a.id);
    for (const first of [NaN, Infinity, 1.5, '2', null, undefined, {}]) {
      assert.deepEqual(visibleClassAbilities(id, first).map(a => a.id), expected);
    }
  }
  for (const id of ['constructor', '__proto__', 'toString', 'juggernaut', null, {}]) {
    assert.deepEqual(visibleClassAbilities(id), []);
  }
});
