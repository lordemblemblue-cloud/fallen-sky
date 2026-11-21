import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, stepMatch, matchView, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const tick = (match, seconds) => {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds / dt); i++) stepMatch(match, dt);
};

test('invalid and prototype-key class IDs cannot queue or change an existing selection', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'owner' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'owner', 'assassin').accepted, true);
  for (const value of ['__proto__', 'constructor', 'toString', '', null, 7, {}, ['healer']]) {
    const result = queueMatchClass(match, 'owner', value);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'unknown-class');
    assert.equal(match.seats.get('owner').pendingClass, 'assassin');
  }
  tick(match, COUNTDOWN + 0.1);
  assert.equal(match.seats.get('owner').classId, 'assassin');
  assert.equal(matchView(match, 'owner').me.specialMeter, 0);
});

test('only the selected human seat can queue a class; live input cannot forge a class or meter', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'owner' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'bot1', 'healer').accepted, false);
  assert.equal(queueMatchClass(match, 'stranger', 'healer').accepted, false);
  assert.equal(queueMatchClass(match, 'owner', 'healer').accepted, true);
  tick(match, COUNTDOWN + 0.1);
  assert.equal(match.seats.get('owner').classId, 'healer');
  const original = match.seats.get('owner').specialMeter;
  stepMatch(match, 1 / 60, { owner: { classId: 'warrior', pendingClass: 'warrior', specialMeter: 100, objective: true, elimination: true } });
  assert.equal(match.seats.get('owner').classId, 'healer');
  assert.equal(match.seats.get('owner').pendingClass, null);
  assert.equal(match.seats.get('owner').specialMeter, original);
  assert.equal(queueMatchClass(match, 'owner', 'warrior').reason, 'alive-in-match');
});

test('legal respawn class change never applies early and cannot carry another class special meter', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'owner' }], seats: 2 });
  queueMatchClass(match, 'owner', 'duelist');
  tick(match, COUNTDOWN + 0.1);
  const seat = match.seats.get('owner');
  seat.specialMeter = 99;
  const fighter = match.world.fighters.get('owner');
  fighter.vitals.dead = true;
  seat.respawnAt = match.world.time + 0.2;
  assert.equal(queueMatchClass(match, 'owner', 'assassin').accepted, true);
  tick(match, 0.05);
  assert.equal(seat.classId, 'duelist');
  assert.equal(seat.specialMeter, 99);
  tick(match, 0.3);
  assert.equal(seat.classId, 'assassin');
  assert.equal(seat.specialMeter, 0);
  assert.equal(seat.pendingClass, null);
});
