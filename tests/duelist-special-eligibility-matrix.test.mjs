import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, CLASS_IDS, evaluateSpecial } from '../src/components/duelist/core/classes.mjs';

const actor = { id: 'human-a', team: 'red', hp: 100, position: { x: 0, z: 0 } };
const target = { id: 'human-b', team: 'blue', hp: 20, maxHp: 100,
  position: { x: 0, z: 1.5, yaw: 0 }, protectedUntil: 0 };

test('every class special refuses forged or invalid charge before producing an intent', () => {
  for (const classId of CLASS_IDS) {
    for (const meter of [-1, 100.001, NaN, Infinity, '100', null]) {
      const result = evaluateSpecial({ classId, meter, actor, target, now: 1 });
      assert.equal(result.allowed, false, classId + ' accepted invalid charge');
      assert.equal(result.reason, 'invalid-meter');
      assert.equal(Object.hasOwn(result, 'meterAfter'), false);
    }
    const cost = CLASSES[classId].special.cost;
    const insufficient = evaluateSpecial({ classId, meter: cost - 0.01, actor, target, now: 1 });
    assert.equal(insufficient.reason, 'not-charged', classId);
    assert.equal(insufficient.allowed, false);
  }
});

test('execution classes refuse protected, friendly, and defeated targets without spending charge', () => {
  for (const classId of ['assassin', 'duelist']) {
    for (const [label, changed, reason] of [
      ['protected', { protectedUntil: 10 }, 'target-protected'],
      ['invulnerable', { invulnerable: true }, 'target-protected'],
      ['friendly', { team: 'red' }, 'friendly-target'],
      ['defeated', { hp: 0 }, 'target-defeated'],
      ['self', { id: 'human-a' }, 'self-target'],
    ]) {
      const result = evaluateSpecial({ classId, meter: 100, actor, target: { ...target, ...changed }, now: 1 });
      assert.equal(result.reason, reason, classId + ': ' + label);
      assert.equal(result.allowed, false);
      assert.equal(Object.hasOwn(result, 'meterAfter'), false);
    }
  }
});

test('successful special intents specify server-derived costs and class animation identifiers', () => {
  for (const classId of CLASS_IDS) {
    const result = evaluateSpecial({ classId, meter: 100, actor, target, now: 1 });
    assert.equal(result.allowed, true, classId);
    assert.equal(result.effect, CLASSES[classId].special.id);
    assert.equal(result.cost, CLASSES[classId].special.cost);
    assert.equal(result.meterAfter, 100 - result.cost);
    assert.equal(result.animation, CLASSES[classId].special.animation);
    assert.match(result.animation, /^class\./);
  }
});
