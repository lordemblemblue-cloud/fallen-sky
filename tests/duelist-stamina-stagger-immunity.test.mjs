// Duelist 2 combat update: attacks/sprinting are stamina-free; three landed strikes break stagger lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVES, SPRINT, STAGGER_IMMUNITY, VITALS,
  createVitals, createFighter, press, strike, resolveHit, isStunned,
} from '../src/components/duelist/core/index.mjs';
import { createWorld, addFighter, bodyOf, step } from '../src/components/duelist/sim/world.mjs';
import { PROTOCOL, encodeOwn, applyOwn, encodeFighter, applyFighter } from '../src/components/duelist/net/protocol.mjs';

const hit = (attacker, defender, now, id = 'swordLight1') =>
  strike(attacker, defender, id, { now });

test('all attacks are stamina-free, including heavy, directional, dual, staff and ranged attacks', () => {
  for (const [id, move] of Object.entries(MOVES)) {
    if (move.kind === 'attack') assert.equal(move.stamina, 0, id);
  }
  for (const [weapon, direction] of [['sword', 'forward'], ['dualBlades', 'left'], ['staff', 'back'], ['bow', null]]) {
    for (const command of ['light', 'heavy']) {
      const f = createFighter({ id: weapon + command, weapon });
      f.vitals.stamina = 0;
      f.vitals.winded = true;
      const res = press(f, command, 0, { direction });
      assert.equal(res.accepted, true, weapon + ' ' + command);
      assert.equal(f.vitals.stamina, 0);
    }
  }
  const rolling = createFighter({ id: 'roller' });
  rolling.vitals.stamina = 0;
  rolling.vitals.winded = true;
  assert.equal(press(rolling, 'roll', 0).reason, 'stamina', 'rolls still require stamina');
  const guard = createVitals();
  const defended = resolveHit({ vitals: guard, invulnerable: false, guard: { since: 0, facing: true }, breached: false },
    { damage: 10, blockable: true }, 1);
  assert.equal(defended.outcome, 'blocked');
  assert.ok(guard.stamina < guard.max.stamina, 'blocking still costs stamina');
});

test('sprinting works at zero stamina without spending any stamina', () => {
  assert.equal(SPRINT.staminaPerSec, 0);
  const world = createWorld();
  const f = addFighter(world, { id: 'runner' });
  f.vitals.stamina = 0;
  f.vitals.winded = true;
  const b = bodyOf(world, 'runner');
  for (let i = 0; i < 20; i++) {
    step(world, 1 / 60, { runner: { run: true, sprint: true, move: { x: 0, z: 1 }, presses: [] } });
    assert.equal(b.speed, SPRINT.speed);
    assert.equal(f.vitals.lastStaminaSpend, -Infinity);
  }
  assert.ok(b.z > 2, 'the runner moved at sprint speed');
});

test('third consecutive unblocked damaging attack immediately frees defender for one second', () => {
  assert.deepEqual([STAGGER_IMMUNITY.hits, STAGGER_IMMUNITY.seconds], [3, 1]);
  const a = createFighter({ id: 'attacker' });
  const d = createFighter({ id: 'defender' });
  hit(a, d, 0);
  hit(a, d, 0.1);
  assert.equal(d.recentStaggerHits, 2);
  assert.ok(isStunned(d, 0.15));
  const third = hit(a, d, 0.2);
  assert.equal(d.recentStaggerHits, 0);
  assert.equal(d.staggerImmuneUntil, 1.2);
  assert.ok(!isStunned(d, 0.2), 'prior hit stagger is lifted on hit three');
  assert.equal(third.effects.filter(e => e.type === 'staggerImmunity').length, 1);
  assert.equal(press(d, 'light', 0.21).accepted, true, 'defender can fight back');
  const action = d.action;
  const defenseBefore = d.vitals.shield + d.vitals.will + d.vitals.hp;
  hit(a, d, 0.4);
  assert.equal(d.action, action, 'incoming hit cannot interrupt the response attack');
  assert.ok(d.vitals.shield + d.vitals.will + d.vitals.hp < defenseBefore, 'damage still applies; no invulnerability');
  assert.equal(d.staggerImmuneUntil, 1.2, 'hits cannot keep extending the response window');
  hit(a, d, 1.21);
  assert.ok(isStunned(d, 1.21), 'normal stagger resumes after immunity expires');
  assert.equal(d.recentStaggerHits, 1);
});

test('blocked, parried, protected and spaced-out hits do not trigger immunity', () => {
  const a = createFighter({ id: 'a' });
  const d = createFighter({ id: 'd' });
  d.guard = { since: 0 };
  assert.equal(hit(a, d, 0.05).result.outcome, 'parried');
  assert.equal(d.recentStaggerHits, 0);
  d.guard = { since: 0 };
  assert.equal(hit(a, d, 1).result.outcome, 'blocked');
  assert.equal(d.recentStaggerHits, 0);
  d.guard = null;
  d.protectedUntil = 4;
  assert.equal(hit(a, d, 2).result.outcome, 'evaded');
  assert.equal(d.recentStaggerHits, 0);
  d.protectedUntil = -Infinity;
  hit(a, d, 5);
  hit(a, d, 5 + STAGGER_IMMUNITY.comboWindowSeconds + 0.01);
  assert.equal(d.recentStaggerHits, 1);
  assert.equal(d.staggerImmuneUntil, -Infinity);
});

test('hit streak and immunity survive authoritative own snapshots and public mirror snapshots', () => {
  assert.equal(PROTOCOL, 12);
  const world = createWorld();
  const a = addFighter(world, { id: 'a' });
  const d = addFighter(world, { id: 'd' });
  hit(a, d, 0.1);
  hit(a, d, 0.2);
  const snapshot = JSON.parse(JSON.stringify(encodeOwn(d, bodyOf(world, 'd'), 0.2)));
  const copyWorld = createWorld();
  const copy = addFighter(copyWorld, { id: 'd' });
  applyOwn(copy, bodyOf(copyWorld, 'd'), snapshot);
  assert.equal(copy.recentStaggerHits, 2);
  assert.equal(copy.lastStaggerHitAt, 0.2);
  hit(a, d, 0.3);
  const live = JSON.parse(JSON.stringify(encodeOwn(d, bodyOf(world, 'd'), 0.3)));
  applyOwn(copy, bodyOf(copyWorld, 'd'), live);
  assert.equal(copy.staggerImmuneUntil, 1.3);
  const mirror = createWorld();
  addFighter(mirror, { id: 'd' });
  applyFighter(mirror, encodeFighter(d, bodyOf(world, 'd')), () => { throw Error('unexpected'); }, () => { throw Error('unexpected'); });
  assert.equal(mirror.fighters.get('d').staggerImmuneUntil, 1.3);
  assert.equal(mirror.fighters.get('d').recentStaggerHits, 0, 'other players do not receive the private streak');
});
