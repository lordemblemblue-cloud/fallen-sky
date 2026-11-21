import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, joinMatch, queueMatchClass, stepMatch, matchView, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

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

test('countdown re-selection is last valid choice per seat and never changes another player', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'alpha' }, { id: 'beta' }] });
  assert.equal(queueMatchClass(match, 'alpha', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'beta', 'healer').accepted, true);
  assert.equal(queueMatchClass(match, 'alpha', 'duelist').accepted, true);
  assert.equal(queueMatchClass(match, 'alpha', 'not-a-class').accepted, false);
  assert.equal(match.seats.get('alpha').pendingClass, 'duelist');
  assert.equal(match.seats.get('beta').pendingClass, 'healer');
  assert.equal(matchView(match, 'alpha').me.pendingClass, 'duelist');
  assert.equal(matchView(match, 'beta').me.pendingClass, 'healer');
  assert.equal(matchView(match, 'alpha').people.some(p => Object.hasOwn(p, 'pendingClass')), false);
  tick(match, COUNTDOWN + 0.1);
  assert.equal(match.seats.get('alpha').classId, 'duelist');
  assert.equal(match.seats.get('beta').classId, 'healer');
  assert.equal(match.world.fighters.get('alpha').weapon, 'dualBlades');
  assert.equal(match.world.fighters.get('beta').weapon, 'sword');
  assert.equal(match.seats.get('alpha').specialMeter, 0);
  assert.equal(match.seats.get('beta').specialMeter, 0);
});

test('warrior seat reconnect preserves pending class and private special meter', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'alpha' }, { id: 'beta' }] });
  assert.equal(queueMatchClass(match, 'alpha', 'warrior').accepted, true);
  const original = match.seats.get('alpha');
  assert.equal(joinMatch(match, { id: 'alpha', name: 'spoof', team: 'blue', classId: 'healer' }).ok, true);
  assert.strictEqual(match.seats.get('alpha'), original);
  assert.equal(original.pendingClass, 'warrior');
  assert.equal(matchView(match, 'beta').me.pendingClass, null);
  assert.equal(matchView(match, 'beta').people.find(p => p.id === 'alpha').classId, null);
  tick(match, COUNTDOWN + 0.1);
  assert.equal(original.classId, 'warrior');
  original.specialMeter = 65; // simulated trusted server-side reward
  assert.equal(joinMatch(match, { id: 'alpha', classId: 'assassin' }).ok, true);
  assert.strictEqual(match.seats.get('alpha'), original);
  assert.equal(original.classId, 'warrior');
  assert.equal(original.specialMeter, 65);
  assert.equal(matchView(match, 'alpha').me.specialMeter, 65);
  assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'specialMeter')), false);
  assert.equal(matchView(match, 'beta').me.specialMeter, null);
});

test('all four canonical classes keep their own weapon and private meter across reconnect', () => {
  const weapons = { warrior: 'sword', duelist: 'dualBlades', assassin: 'staff', healer: 'sword' };
  for (const [classId, weapon] of Object.entries(weapons)) {
    const match = createMatch({ mode: 'duel', players: [{ id: 'alpha' }, { id: 'beta' }] });
    assert.equal(queueMatchClass(match, 'alpha', classId).accepted, true, classId);
    assert.equal(joinMatch(match, { id: 'alpha', classId: 'invalid', specialMeter: 100 }).ok, true);
    assert.equal(match.seats.get('alpha').pendingClass, classId);
    tick(match, COUNTDOWN + 0.1);
    const seat = match.seats.get('alpha');
    assert.equal(seat.classId, classId);
    assert.equal(match.world.fighters.get('alpha').weapon, weapon);
    assert.equal(seat.specialMeter, 0);
    seat.specialMeter = 42; // trusted simulation fixture, not a client packet
    assert.equal(joinMatch(match, { id: 'alpha', classId: 'healer', specialMeter: 100 }).ok, true);
    assert.equal(match.seats.get('alpha'), seat);
    assert.equal(seat.classId, classId);
    assert.equal(seat.specialMeter, 42);
    assert.equal(matchView(match, 'alpha').me.specialMeter, 42);
    assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'specialMeter')), false);
  }
});
