import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, SPECIAL_BALANCE, evaluateSpecial } from '../src/components/duelist/core/classes.mjs';

const actor = Object.freeze({ id: 'assassin-seat', team: 'blue', hp: 100, position: { x: 0, z: 0 } });
const enemy = (z, overrides = {}) => ({
  id: 'enemy-seat', team: 'red', hp: 100, maxHp: 100,
  position: { x: 0, z, yaw: 0 }, protectedUntil: -Infinity, ...overrides,
});
const attempt = (target, extras = {}) => evaluateSpecial({
  classId: 'assassin', meter: 100, actor, target, now: 10, ...extras,
});

test('cloaked Assassin blink extends reach without bypassing hostile-target checks', () => {
  assert.equal(attempt(enemy(-10)).reason, 'out-of-range', 'ordinary attack must use short reach');
  const blink = attempt(enemy(-10), { cloaked: true });
  assert.equal(blink.allowed, true);
  assert.equal(blink.blink, true);
  assert.equal(blink.effect, 'shadowExecution');
  assert.equal(blink.animation, CLASSES.assassin.special.animation);
  assert.equal(blink.meterAfter, 0);
  assert.equal(attempt(enemy(-SPECIAL_BALANCE.assassinBlinkReach - 0.1), { cloaked: true }).reason, 'out-of-range');

  for (const [label, target, reason] of [
    ['friendly', enemy(-2, { team: 'blue' }), 'friendly-target'],
    ['self', enemy(-2, { id: actor.id }), 'self-target'],
    ['dead', enemy(-2, { hp: 0 }), 'target-defeated'],
    ['spawn protected', enemy(-2, { protectedUntil: 11 }), 'target-protected'],
    ['invulnerable', enemy(-2, { invulnerable: true }), 'target-protected'],
    ['invalid coordinates', enemy(-2, { position: { x: NaN, z: -2, yaw: 0 } }), 'invalid-context'],
  ]) {
    assert.equal(attempt(target, { cloaked: true }).reason, reason, label);
  }
});

test('cloaked blink is not a client-side meter override or a free execution', () => {
  assert.equal(attempt(enemy(-2), { cloaked: true, meter: 99 }).reason, 'not-charged');
  assert.equal(attempt(enemy(-2), { cloaked: true, meter: 101 }).reason, 'invalid-meter');
  assert.equal(attempt(enemy(-2), { cloaked: true, actor: { ...actor, hp: 0 } }).reason, 'actor-defeated');
  assert.equal(attempt(enemy(-2), { cloaked: true, now: Infinity }).reason, 'invalid-context');
});
