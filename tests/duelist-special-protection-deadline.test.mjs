import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpecial } from '../src/components/duelist/core/classes.mjs';

const actor = { id: 'a', team: 'blue', hp: 100, position: { x: 0, z: 0 } };
const target = { id: 'b', team: 'red', hp: 20, maxHp: 100, position: { x: 0, z: 1, yaw: 0 } };
const request = (protectedUntil, now = 2) => evaluateSpecial({
  classId: 'duelist', meter: 100, actor,
  target: { ...target, protectedUntil }, now,
});

test('malformed spawn-protection deadlines fail closed for execution requests', () => {
  for (const deadline of [NaN, Infinity, '3', {}, false]) {
    assert.deepEqual(request(deadline), { allowed: false, reason: 'invalid-context' });
  }
  // -Infinity is what a fighter that was never protected carries (core/fighter.mjs): not malformed
  assert.equal(request(-Infinity).allowed, true);
});

test('finite protection deadlines retain inclusive expiration behavior', () => {
  assert.deepEqual(request(3), { allowed: false, reason: 'target-protected' });
  assert.equal(request(2).allowed, true, 'protection ends at the deadline');
  assert.equal(request(1).allowed, true);
  assert.equal(request(null).allowed, true, 'missing protection remains valid');
});

test('an invulnerable target remains protected after the timer expires', () => {
  const result = evaluateSpecial({
    classId: 'duelist', meter: 100, actor,
    target: { ...target, protectedUntil: 1, invulnerable: true }, now: 2,
  });
  assert.deepEqual(result, { allowed: false, reason: 'target-protected' });
});
