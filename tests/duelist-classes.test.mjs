import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/components/duelist/core/moves.mjs';
import {
  ABILITY_SLOTS, CLASS_IDS, CLASSES, SPECIAL_MAX, SPECIAL_BALANCE,
  awardSpecialCharge, classAtSpawn, classById, evaluateSpecial,
  requestClassSelection, visibleClassAbilities,
} from '../src/components/duelist/core/classes.mjs';

const actor = { id: 'attacker', team: 'blue', hp: 100, position: { x: 0, z: 0 } };
const enemy = (hp = 25, x = 0, z = -1.5) => ({
  id: 'enemy', team: 'red', hp, maxHp: 100, position: { x, z, yaw: 0 },
  protectedUntil: -Infinity,
});

test('four distinct classes share weapons recognized by the combat core', () => {
  assert.deepEqual(CLASS_IDS, ['assassin', 'duelist', 'juggernaut', 'healer']);
  for (const id of CLASS_IDS) {
    const def = classById(id);
    assert.equal(def?.id, id);
    assert.ok(WEAPONS.includes(def.weapon), id + ' must use a supported crystal weapon');
    assert.equal(def.abilities.length, 4);
    assert.equal(new Set(def.abilities.map(a => a.id)).size, 4);
    assert.equal(ABILITY_SLOTS, 3);
    for (const animation of Object.values(def.animationSlots)) assert.match(animation, /^class\./);
    assert.match(def.special.animation, /^class\./);
    assert.ok(Object.isFrozen(def.abilities));
  }
  assert.equal(CLASSES.assassin.weapon, 'staff');
  assert.equal(CLASSES.duelist.weapon, 'dualBlades');
  assert.equal(CLASSES.juggernaut.weapon, 'sword');
  assert.equal(CLASSES.healer.weapon, 'sword');
  assert.equal(classById('constructor'), null, 'prototype property must not be interpreted as a class');
  assert.equal(classById('__proto__'), null);
  assert.equal(classById('not-a-class'), null);
});

test('three ability circles rotate through all four powers', () => {
  for (const id of CLASS_IDS) {
    const all = new Set(CLASSES[id].abilities.map(a => a.id));
    const visited = new Set();
    for (let offset = 0; offset < 4; offset++) {
      const view = visibleClassAbilities(id, offset);
      assert.equal(view.length, 3);
      for (const a of view) visited.add(a.id);
    }
    assert.deepEqual(visited, all);
    assert.deepEqual(visibleClassAbilities(id, 4), visibleClassAbilities(id, 0));
    assert.deepEqual(visibleClassAbilities(id, -1), visibleClassAbilities(id, 3));
  }
  assert.deepEqual(visibleClassAbilities('invalid'), []);
});

test('class requests queue until spawn; a live character cannot swap during combat', () => {
  const denied = requestClassSelection({ requestedClass: 'assassin', currentClass: 'healer', phase: 'live', dead: false });
  assert.deepEqual(denied, { accepted: false, reason: 'alive-in-match', currentClass: 'healer', pendingClass: null });
  const wait = requestClassSelection({ requestedClass: 'assassin', currentClass: 'healer', phase: 'live', dead: true });
  assert.equal(wait.accepted, true);
  assert.equal(wait.currentClass, 'healer', 'not applied before respawn');
  assert.equal(wait.pendingClass, 'assassin');
  assert.deepEqual(classAtSpawn(wait), { classId: 'assassin', weapon: 'staff', pendingClass: null });
  assert.deepEqual(classAtSpawn({ currentClass: 'healer', pendingClass: 'unknown' }), { classId: 'healer', weapon: 'sword', pendingClass: null });
  assert.equal(requestClassSelection({ requestedClass: 'bad', phase: 'countdown' }).accepted, false);
  assert.equal(requestClassSelection({ requestedClass: 'duelist', phase: 'countdown' }).accepted, true);
  assert.equal(requestClassSelection({ requestedClass: 'duelist', phase: 'roundOver' }).accepted, true);
});

test('special charge is clamped, earned by trusted events, and never trusted as client-input meters', () => {
  assert.equal(awardSpecialCharge(0, 'landedHit'), 5);
  assert.equal(awardSpecialCharge(98, 'objective'), 100);
  assert.equal(awardSpecialCharge(40, 'notAnEvent'), null);
  assert.equal(awardSpecialCharge(Number.NaN, 'landedHit'), null);
  assert.equal(awardSpecialCharge(101, 'landedHit'), null);
  assert.equal(awardSpecialCharge(-2, 'landedHit'), null);
});

test('duelist execution consumes roughly a third at or below a tunable HP threshold', () => {
  const cost = CLASSES.duelist.special.cost;
  assert.ok(Math.abs(cost * 3 - SPECIAL_MAX) < 1e-9);
  const ready = evaluateSpecial({ classId: 'duelist', meter: SPECIAL_MAX, actor, target: enemy(25) });
  assert.equal(ready.allowed, true);
  assert.ok(Math.abs(ready.meterAfter - (SPECIAL_MAX - cost)) < 1e-6);
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 20, actor, target: enemy(20) }).reason, 'not-charged');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor, target: enemy(26) }).reason, 'target-too-healthy');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor, target: enemy(20, 0, 4) }).reason, 'out-of-range');
  assert.equal(SPECIAL_BALANCE.duelistExecuteThreshold, .25);
});

test('assassin execution costs the entire meter and requires striking from behind', () => {
  const good = evaluateSpecial({ classId: 'assassin', meter: 100, actor, target: enemy(100) });
  assert.equal(good.allowed, true, 'assassin is not gated by enemy HP threshold');
  assert.equal(good.meterAfter, 0);
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 99, actor, target: enemy() }).reason, 'not-charged');
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor, target: enemy(100, 0, 1) }).reason, 'not-behind');
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor, target: enemy(100, 0, -3) }).reason, 'out-of-range');
});

test('an execution never passes spawn protection or targets allies or fallen enemies', () => {
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor, target: { ...enemy(), protectedUntil: 3 }, now: 2 }).reason, 'target-protected');
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor, target: { ...enemy(), team: 'blue' } }).reason, 'friendly-target');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor, target: enemy(0) }).reason, 'target-defeated');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor, target: { ...enemy(), id: 'attacker' } }).reason, 'self-target');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor, target: null }).reason, 'target-required');
});

test('Rage and healer field register distinct, server-resolved effects', () => {
  assert.deepEqual(evaluateSpecial({ classId: 'juggernaut', meter: 100, actor }), {
    allowed: true, effect: 'rage', cost: 100, meterAfter: 0,
    animation: CLASSES.juggernaut.special.animation,
  });
  assert.deepEqual(evaluateSpecial({ classId: 'healer', meter: 100, actor }), {
    allowed: true, effect: 'wardField', cost: 100, meterAfter: 0,
    animation: CLASSES.healer.special.animation,
  });
  assert.equal(evaluateSpecial({ classId: 'healer', meter: 100, actor: { ...actor, hp: 0 } }).reason, 'actor-defeated');
  assert.equal(evaluateSpecial({ classId: 'healer', meter: 101, actor }).reason, 'invalid-meter');
  assert.equal(SPECIAL_BALANCE.rageDamageMultiplier, 2);
});


test('execution checks reject non-finite coordinates or time rather than accepting out-of-range attacks', () => {
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor: { ...actor, position: { x: NaN, z: 0 } }, target: enemy() }).reason, 'invalid-context');
  assert.equal(evaluateSpecial({ classId: 'duelist', meter: 100, actor, target: { ...enemy(), position: { x: Infinity, z: -1 } } }).reason, 'invalid-context');
  assert.equal(evaluateSpecial({ classId: 'assassin', meter: 100, actor, target: enemy(), now: NaN }).reason, 'invalid-context');
});
