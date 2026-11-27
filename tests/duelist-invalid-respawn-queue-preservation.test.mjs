import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, matchView, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const STEP = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
}

test('invalid follow-up selections cannot erase a valid queued respawn class or another seat meter', () => {
  const match = createMatch({
    mode: 'practice', seats: 2,
    players: [{ id: 'alice', classId: 'assassin' }, { id: 'bob', classId: 'duelist' }],
  });
  advance(match, COUNTDOWN + 0.1);
  const alice = match.seats.get('alice');
  const bob = match.seats.get('bob');
  alice.specialMeter = 80;
  bob.specialMeter = 45;
  match.world.fighters.get('alice').vitals.dead = true;
  alice.respawnAt = match.world.time + 0.05;
  assert.equal(queueMatchClass(match, 'alice', 'healer').accepted, true);
  for (const invalid of ['invalid', '', null, 'HEALER']) {
    assert.equal(queueMatchClass(match, 'alice', invalid).accepted, false);
    assert.equal(alice.pendingClass, 'healer');
    assert.equal(alice.classId, 'assassin');
    assert.equal(alice.specialMeter, 80);
    assert.equal(bob.specialMeter, 45);
  }
  assert.equal(matchView(match, 'bob').people.some(person => 'pendingClass' in person || 'specialMeter' in person), false);
  advance(match, 0.15);
  assert.equal(alice.classId, 'healer');
  assert.equal(alice.pendingClass, null);
  assert.equal(alice.specialMeter, 0);
  assert.equal(bob.classId, 'duelist');
  assert.equal(bob.specialMeter, 45);
});
