import test from 'node:test';
import assert from 'node:assert/strict';
import { behindTarget, evaluateSpecial, SPECIAL_BALANCE } from '../src/components/duelist/core/classes.mjs';

const actorAt = (x, z) => ({ id: 'assassin', team: 'blue', hp: 100, position: { x, z } });
const targetAt = (yaw = 0) => ({
  id: 'enemy', team: 'red', hp: 100, maxHp: 100,
  position: { x: 0, z: 0, yaw }, protectedUntil: -Infinity,
});
const request = (actor, target) => evaluateSpecial({ classId: 'assassin', meter: 100, actor, target, now: 5 });

test('rear-arc eligibility follows target facing rather than world axes', () => {
  const north = targetAt(0);
  assert.equal(request(actorAt(0, -1), north).allowed, true);
  assert.equal(request(actorAt(0, 1), north).reason, 'not-behind');
  const east = targetAt(Math.PI / 2);
  assert.equal(request(actorAt(-1, 0), east).allowed, true);
  assert.equal(request(actorAt(1, 0), east).reason, 'not-behind');
});

test('rear cone rejects flanks just outside the configured half-angle', () => {
  const half = SPECIAL_BALANCE.assassinRearArcDegrees / 2 * Math.PI / 180;
  const point = (angle) => actorAt(Math.sin(angle), -Math.cos(angle));
  assert.equal(request(point(half - 0.01), targetAt()).allowed, true);
  assert.equal(request(point(half + 0.01), targetAt()).reason, 'not-behind');
  assert.equal(request(point(-half + 0.01), targetAt()).allowed, true);
  assert.equal(request(point(-half - 0.01), targetAt()).reason, 'not-behind');
});

test('degenerate or nonfinite target facing never authorizes a rear execution', () => {
  assert.equal(behindTarget({ x: 0, z: 0 }, targetAt().position), false);
  assert.equal(request(actorAt(0, 0), targetAt()).reason, 'not-behind');
  assert.equal(request(actorAt(0, -1), targetAt(Number.NaN)).reason, 'not-behind');
  assert.equal(request(actorAt(0, -1), targetAt(Infinity)).reason, 'not-behind');
});

test('spawn protection remains active until its server timestamp expires', () => {
  const target = { ...targetAt(), protectedUntil: 5.01 };
  assert.equal(request(actorAt(0, -1), target).reason, 'target-protected');
  assert.equal(request(actorAt(0, -1), { ...target, protectedUntil: 5 }).allowed, true);
});
