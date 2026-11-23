import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_IDS, CLASSES, SPECIAL_CHARGE, SPECIAL_MAX,
  awardSpecialCharge, evaluateSpecial,
} from '../src/components/duelist/core/classes.mjs';

const actor = { id: 'human', team: 'blue', hp: 100, position: { x: 0, z: 0 } };
const target = { id: 'enemy', team: 'red', hp: 20, maxHp: 100,
  position: { x: 0, z: 1 }, protectedUntil: -Infinity };

test('all trusted event awards remain finite and bounded at meter edges', () => {
  for (const event of Object.keys(SPECIAL_CHARGE)) {
    for (const meter of [0, 0.01, 50, 99.99, SPECIAL_MAX]) {
      const next = awardSpecialCharge(meter, event);
      assert.ok(Number.isFinite(next), event);
      assert.ok(next >= meter && next <= SPECIAL_MAX, event);
      assert.equal(next, Math.min(SPECIAL_MAX, meter + SPECIAL_CHARGE[event]));
    }
  }
});

test('malformed and inherited event names cannot mint charge', () => {
  for (const event of [null, undefined, '', 'constructor', '__proto__', 'toString', {}, 1, 'elimination ', 'Elimination']) {
    assert.equal(awardSpecialCharge(0, event), null, String(event));
  }
  for (const meter of [NaN, Infinity, -Infinity, -0.01, 100.01, '100', null]) {
    assert.equal(awardSpecialCharge(meter, 'elimination'), null, String(meter));
  }
});

test('every class special rejects malformed meter before evaluating effects', () => {
  for (const classId of CLASS_IDS) {
    for (const meter of [-1, 100.01, NaN, Infinity, '100', null]) {
      const result = evaluateSpecial({ classId, meter, actor, target });
      assert.deepEqual(result, { allowed: false, reason: 'invalid-meter' }, classId + ':' + meter);
    }
    const cost = CLASSES[classId].special.cost;
    assert.equal(evaluateSpecial({ classId, meter: cost - 0.01, actor, target }).reason, 'not-charged', classId);
  }
});
