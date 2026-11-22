import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES, ABILITY_SLOTS, classAbilityMove, visibleClassAbilities } from '../src/components/duelist/core/classes.mjs';

test('four classes expose four indexed abilities with three rotating visible slots', () => {
  assert.equal(ABILITY_SLOTS, 3);
  assert.deepEqual(CLASS_IDS, ['warrior', 'duelist', 'assassin', 'healer']);
  for (const classId of CLASS_IDS) {
    const abilities = CLASSES[classId].abilities;
    assert.equal(abilities.length, 4);
    assert.equal(new Set(abilities.map(({ id }) => id)).size, 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(classAbilityMove(classId, i), abilities[i].id);
      const visible = visibleClassAbilities(classId, i);
      assert.equal(visible.length, 3);
      assert.deepEqual(visible.map(({ id }) => id), [0, 1, 2].map(j => abilities[(i + j) % 4].id));
      assert.ok(Object.isFrozen(visible));
    }
    assert.deepEqual(visibleClassAbilities(classId, -1).map(({ id }) => id), [3, 0, 1].map(i => abilities[i].id));
    for (const slot of [-1, 4, 1.5, NaN, Infinity, '0', null]) assert.equal(classAbilityMove(classId, slot), null);
  }
});

test('unknown classes cannot resolve abilities', () => {
  for (const id of ['__proto__', 'constructor', 'toString', 'juggernaut', null, {}, '']) {
    assert.equal(classAbilityMove(id, 0), null);
    assert.deepEqual(visibleClassAbilities(id), []);
  }
});
