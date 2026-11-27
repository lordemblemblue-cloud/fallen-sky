import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, queueMatchClass, matchView, standInInput, stepMatch, COUNTDOWN,
} from '../src/components/duelist/sim/match.mjs';

function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepMatch(match, 1 / 60);
}

test('disconnected stand-in cannot consume a queued respawn class or inherited charge', () => {
  const match = createMatch({ mode: 'practice', seats: 2, players: [{ id: 'owner' }] });
  assert.equal(queueMatchClass(match, 'owner', 'assassin').accepted, true);
  advance(match, COUNTDOWN + 0.1);
  const seat = match.seats.get('owner');
  assert.equal(seat.classId, 'assassin');
  seat.specialMeter = 80;

  const fallen = match.world.fighters.get('owner');
  fallen.vitals.dead = true;
  seat.respawnAt = match.world.time + 0.05;
  assert.equal(queueMatchClass(match, 'owner', 'healer').accepted, true);

  // A dropped connection may cause the server to ask for bot stand-in input,
  // but it must not impersonate a class-selection request or spend charge.
  assert.deepEqual(standInInput(match, 'owner'), {});
  assert.equal(seat.classId, 'assassin');
  assert.equal(seat.pendingClass, 'healer');
  assert.equal(seat.specialMeter, 80);
  assert.equal(matchView(match, 'owner').me.pendingClass, 'healer');
  assert.equal(matchView(match, 'owner').people.some(p => 'specialMeter' in p), false);

  advance(match, 0.15);
  assert.equal(seat.classId, 'healer');
  assert.equal(seat.pendingClass, null);
  assert.equal(seat.specialMeter, 0);
  assert.equal(match.world.fighters.get('owner').weapon, 'sword');
  assert.equal(matchView(match, 'owner').me.specialMeter, 0);
});
