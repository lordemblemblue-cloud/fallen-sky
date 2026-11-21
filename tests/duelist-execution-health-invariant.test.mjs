import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpecial } from '../src/components/duelist/core/classes.mjs';

const actor = { id: 'a', team: 'blue', hp: 100, position: { x: 0, z: 0 } };
const target = { id: 'b', team: 'red', hp: 25, maxHp: 100,
  position: { x: 0, z: 1.5, yaw: 0 }, protectedUntil: -Infinity };

test('execution rejects impossible over-max target health for both execution classes', () => {
  for (const classId of ['duelist', 'assassin']) {
    const result = evaluateSpecial({ classId, meter: 100, actor,
      target: { ...target, hp: 101 } });
    assert.equal(result.allowed, false, classId);
    assert.equal(result.reason, 'invalid-context', classId);
  }
});

test('valid full-health assassin and threshold-health duelist targets remain eligible', () => {
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor,
    target: { ...target, hp: 100 } }).allowed, true);
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor,
    target: { ...target, hp: 25 } }).allowed, true);
});

test('invalid target health cannot authorize spending a partially charged special', () => {
  const result = evaluateSpecial({ classId: 'duelist', meter: 100, actor,
    target: { ...target, hp: Number.POSITIVE_INFINITY } });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'target-required');
});
