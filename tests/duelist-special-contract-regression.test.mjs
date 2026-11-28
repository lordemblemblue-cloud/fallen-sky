import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_IDS, CLASSES, SPECIAL_MAX, SPECIAL_CHARGE, awardSpecialCharge,
  classAbilityMove, visibleClassAbilities, evaluateSpecial,
} from '../src/components/duelist/core/classes.mjs';

// Contract tests only: these pure helpers do not authenticate packets, spend
// server match-seat meter, execute damage, or play an animation.
test('each canonical class exposes four distinct ability IDs and an original animation contract', () => {
  assert.deepEqual(CLASS_IDS, ['warrior', 'duelist', 'assassin', 'healer']);
  for (const classId of CLASS_IDS) {
    const def = CLASSES[classId];
    const ids = def.abilities.map(a => a.id);
    assert.equal(ids.length, 4, classId);
    assert.equal(new Set(ids).size, 4, classId);
    assert.deepEqual(Array.from({ length: 4 }, (_, slot) => classAbilityMove(classId, slot)), ids);
    assert.equal(classAbilityMove(classId, -1), null);
    assert.equal(classAbilityMove(classId, 4), null);
    assert.equal(classAbilityMove(classId, 1.5), null);
    for (const move of def.abilities) assert.equal(move.animation, 'class.power.' + move.id);
    assert.equal(def.special.animation, 'class.' + classId + '.special.' + def.special.id);
    for (const name of ['idle', 'light', 'heavy', 'dodge', 'special', 'death', 'spawn']) {
      assert.match(def.animationSlots[name], new RegExp('^class\\.' + classId + '\\.'));
    }
    for (let first = 0; first < 4; first++) {
      const shown = visibleClassAbilities(classId, first).map(a => a.id);
      assert.deepEqual(shown, [ids[first], ids[(first + 1) % 4], ids[(first + 2) % 4]]);
    }
  }
  assert.equal(classAbilityMove('__proto__', 0), null);
  assert.deepEqual(visibleClassAbilities('constructor'), []);
});

test('trusted event awards saturate 0–100 and reject malformed or client-shaped events', () => {
  for (const [event, amount] of Object.entries(SPECIAL_CHARGE)) {
    assert.equal(awardSpecialCharge(0, event), amount, event);
    assert.equal(awardSpecialCharge(99, event), SPECIAL_MAX, event);
    assert.equal(awardSpecialCharge(100, event), SPECIAL_MAX, event);
  }
  for (const invalid of [NaN, Infinity, -Infinity, -1, 100.01, null, '99']) {
    assert.equal(awardSpecialCharge(invalid, 'elimination'), null);
  }
  for (const invalid of ['__proto__', 'constructor', 'special', '', { event: 'elimination' }, null]) {
    assert.equal(awardSpecialCharge(40, invalid), null);
  }
});

test('each special returns an intent with class-specific cost and animation, never mutating the actor', () => {
  const actor = { id: 'alpha', team: 'red', hp: 100, position: { x: 0, z: 0 } };
  // yaw 0 faces +z (core/classes.mjs behindTarget, as the sim moves): this enemy faces -z, its back to the actor,
  // as the Assassin's Shadow Execution requires
  const enemy = { id: 'beta', team: 'blue', hp: 20, maxHp: 100,
    position: { x: 0, z: -1, yaw: Math.PI }, protectedUntil: -Infinity };
  const actorBefore = structuredClone(actor);
  const enemyBefore = structuredClone(enemy);
  for (const classId of CLASS_IDS) {
    const def = CLASSES[classId];
    const result = evaluateSpecial({ classId, meter: 100, actor, target: enemy, now: 10 });
    assert.equal(result.allowed, true, classId);
    assert.equal(result.effect, def.special.id, classId);
    assert.equal(result.cost, def.special.cost, classId);
    assert.equal(result.meterAfter, 100 - def.special.cost, classId);
    assert.equal(result.animation, def.special.animation, classId);
  }
  assert.deepEqual(actor, actorBefore);
  assert.deepEqual(enemy, enemyBefore);
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 99, actor, target: enemy }).reason, 'not-charged');
  assert.equal(evaluateSpecial({ classId: 'healer', meter: 99, actor }).reason, 'not-charged');
  assert.equal(evaluateSpecial({ classId: 'warrior', meter: 99, actor }).reason, 'not-charged');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 0, actor, target: enemy }).reason, 'not-charged');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor,
    target: { ...enemy, hp: 50 } }).reason, 'target-too-healthy');
  // the same enemy turned to face the actor
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor,
    target: { ...enemy, position: { x: 0, z: -1, yaw: 0 } } }).reason, 'not-behind');
});
