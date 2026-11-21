import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const tick = (match, seconds) => {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds / dt); i++) stepMatch(match, dt);
};

test('switching class at initial authoritative spawn clears previously earned charge', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'player', classId: 'duelist' }], seats: 2 });
  const seat = match.seats.get('player');
  seat.specialMeter = 100;
  assert.equal(queueMatchClass(match, 'player', 'assassin').accepted, true);
  assert.equal(seat.specialMeter, 100, 'request only queues; it does not mutate current life');
  tick(match, COUNTDOWN + 0.1);
  assert.equal(seat.classId, 'assassin');
  assert.equal(seat.specialMeter, 0, 'new class cannot inherit another kit\'s meter');
  assert.equal(match.world.fighters.get('player').weapon, 'staff');
});

test('reselecting same class at respawn retains server-owned charge', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'player', classId: 'duelist' }], seats: 2 });
  tick(match, COUNTDOWN + 0.1);
  const seat = match.seats.get('player');
  seat.specialMeter = 65;
  const fallen = match.world.fighters.get('player');
  fallen.vitals.dead = true;
  seat.respawnAt = match.world.time + 0.05;
  assert.equal(queueMatchClass(match, 'player', 'duelist').accepted, true);
  tick(match, 0.15);
  assert.equal(seat.classId, 'duelist');
  assert.equal(seat.specialMeter, 65);
  assert.equal(seat.pendingClass, null);
});

test('changing class on respawn resets charge only when spawn commits', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'player', classId: 'healer' }], seats: 2 });
  tick(match, COUNTDOWN + 0.1);
  const seat = match.seats.get('player');
  seat.specialMeter = 80;
  const fallen = match.world.fighters.get('player');
  fallen.vitals.dead = true;
  seat.respawnAt = match.world.time + 0.15;
  assert.equal(queueMatchClass(match, 'player', 'warrior').accepted, true);
  assert.equal(seat.specialMeter, 80);
  tick(match, 0.05);
  assert.equal(seat.classId, 'healer');
  assert.equal(seat.specialMeter, 80);
  tick(match, 0.2);
  assert.equal(seat.classId, 'warrior');
  assert.equal(seat.specialMeter, 0);
  assert.equal(match.world.fighters.get('player').weapon, 'sword');
});
