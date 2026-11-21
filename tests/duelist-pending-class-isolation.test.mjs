import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchView, queueMatchClass, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const STEP = 1 / 60;
const advance = (match, seconds) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
};

test('latest valid prematch selection wins; rejected class cannot replace pending selection', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(queueMatchClass(match, 'a', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'a', 'healer').accepted, true);
  assert.equal(queueMatchClass(match, 'a', '__proto__').accepted, false);
  assert.equal(match.seats.get('a').pendingClass, 'healer');
  assert.equal(match.seats.get('a').classId, null);
  assert.equal(matchView(match, 'a').me.pendingClass, 'healer');
  assert.equal(matchView(match, 'b').people.some(p => Object.hasOwn(p, 'pendingClass')), false);
  advance(match, COUNTDOWN + 0.1);
  assert.equal(match.seats.get('a').classId, 'healer');
  assert.equal(match.seats.get('a').pendingClass, null);
  assert.equal(match.world.fighters.get('a').weapon, 'sword');
  assert.equal(match.seats.get('b').classId, null);
});

test('a defeated player can revise queued class without changing the fallen body', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'a' }], seats: 2 });
  advance(match, COUNTDOWN + 0.1);
  const seat = match.seats.get('a');
  const fallen = match.world.fighters.get('a');
  fallen.vitals.dead = true;
  seat.respawnAt = match.world.time + 0.05;
  assert.equal(queueMatchClass(match, 'a', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'a', 'duelist').accepted, true);
  assert.equal(fallen.weapon, 'sword');
  assert.equal(seat.pendingClass, 'duelist');
  advance(match, 0.15);
  assert.equal(seat.classId, 'duelist');
  assert.equal(seat.pendingClass, null);
  assert.equal(match.world.fighters.get('a').weapon, 'dualBlades');
});
