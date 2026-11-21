import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpecial, CLASSES } from '../src/components/duelist/core/classes.mjs';

// These are pure validation contracts. No packet authentication, meter debit,
// execution damage or animation playback is implemented by evaluateSpecial.
const actor = () => ({ id: 'attacker', team: 'red', hp: 100, position: { x: 0, z: 0 } });
const target = () => ({ id: 'victim', team: 'blue', hp: 20, maxHp: 100,
  position: { x: 0, z: -1, yaw: 0 }, protectedUntil: -Infinity });

for (const classId of ['duelist', 'assassin']) {
  test(`${classId} execution rejects friendly, self, dead and protected targets without spending meter`, () => {
    const cases = [
      [{ ...target(), team: 'red' }, 'friendly-target'],
      [{ ...target(), id: 'attacker' }, 'self-target'],
      [{ ...target(), hp: 0 }, 'target-defeated'],
      [{ ...target(), protectedUntil: 11 }, 'target-protected'],
      [{ ...target(), invulnerable: true }, 'target-protected'],
      [{ ...target(), protectedUntil: NaN }, 'invalid-context'],
      [{ ...target(), hp: 101 }, 'invalid-context'],
      [{ ...target(), position: { x: Infinity, z: -1, yaw: 0 } }, 'invalid-context'],
    ];
    for (const [victim, expected] of cases) {
      const before = structuredClone(victim);
      const result = evaluateSpecial({ classId, meter: 100, actor: actor(), target: victim, now: 10 });
      assert.equal(result.allowed, false, `${classId}: ${expected}`);
      assert.equal(result.reason, expected);
      assert.equal(result.meterAfter, undefined, 'rejected intent cannot debit meter');
      assert.deepEqual(victim, before, 'validation cannot mutate target');
    }
  });

  test(`${classId} execution is a non-mutating intent only at legal range and full context`, () => {
    const source = actor();
    const victim = target();
    const beforeSource = structuredClone(source);
    const beforeTarget = structuredClone(victim);
    const ok = evaluateSpecial({ classId, meter: 100, actor: source, target: victim, now: 10 });
    assert.equal(ok.allowed, true);
    assert.equal(ok.cost, CLASSES[classId].special.cost);
    assert.equal(ok.animation, CLASSES[classId].special.animation);
    assert.deepEqual(source, beforeSource);
    assert.deepEqual(victim, beforeTarget);
    assert.equal(evaluateSpecial({ classId, meter: 100, actor: source,
      target: { ...victim, position: { x: 0, z: -100, yaw: 0 } }, now: 10 }).reason, 'out-of-range');
  });
}
