import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_IDS, CLASSES, SPECIAL_MAX, SPECIAL_CHARGE,
  awardSpecialCharge, evaluateSpecial,
} from '../src/components/duelist/core/classes.mjs';

const actor = Object.freeze({ id: 'a', team: 'blue', hp: 100, position: { x: 0, z: 0 } });
const target = Object.freeze({
  id: 'b', team: 'red', hp: 20, maxHp: 100,
  position: { x: 0, z: 1 }, protectedUntil: -Infinity,
});

test('special charge never accepts malformed or inherited event keys', () => {
  for (const meter of [-Infinity, Infinity, NaN, -1, SPECIAL_MAX + 1, '50', null]) {
    assert.equal(awardSpecialCharge(meter, 'landedHit'), null);
  }
  for (const event of ['constructor', '__proto__', 'toString', '', null, 4, {}]) {
    assert.equal(awardSpecialCharge(50, event), null);
  }
  for (const [event, amount] of Object.entries(SPECIAL_CHARGE)) {
    assert.equal(awardSpecialCharge(0, event), amount);
    assert.equal(awardSpecialCharge(99, event), SPECIAL_MAX);
  }
});

test('all class specials require server-bounded meter and never mutate input', () => {
  for (const classId of CLASS_IDS) {
    const special = CLASSES[classId].special;
    const args = { classId, actor, target, meter: special.cost };
    const result = evaluateSpecial(args);
    assert.equal(result.allowed, true, classId);
    assert.equal(result.effect, special.id, classId);
    assert.equal(result.cost, special.cost, classId);
    assert.ok(Math.abs(result.meterAfter) < 1e-8, classId);
    assert.equal(args.meter, special.cost, 'validation must not spend the caller meter');
    assert.equal(actor.hp, 100);
    assert.equal(target.hp, 20);
    for (const invalid of [-1, SPECIAL_MAX + 1, NaN, Infinity, '100']) {
      assert.equal(evaluateSpecial({ ...args, meter: invalid }).reason, 'invalid-meter', classId);
    }
    assert.equal(evaluateSpecial({ ...args, meter: 0 }).reason, 'not-charged', classId);
  }
});
