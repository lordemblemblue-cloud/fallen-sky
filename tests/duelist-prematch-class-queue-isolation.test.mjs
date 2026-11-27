import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, matchView, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

test('prematch class selection uses the latest valid request without exposing it to opponents', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(queueMatchClass(match, 'a', 'warrior').accepted, true);
  assert.equal(queueMatchClass(match, 'a', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'b', 'healer').accepted, true);
  for (const invalid of ['__proto__', 'constructor', '', null, 'juggernaut']) {
    assert.equal(queueMatchClass(match, 'a', invalid).accepted, false);
    assert.equal(match.seats.get('a').pendingClass, 'assassin');
  }
  assert.equal(match.seats.get('a').classId, null);
  assert.equal(match.world.fighters.get('a').weapon, 'sword');
  assert.equal(matchView(match, 'a').me.pendingClass, 'assassin');
  assert.equal(matchView(match, 'b').people.some(person => 'pendingClass' in person || 'specialMeter' in person), false);
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil((COUNTDOWN + 0.1) / dt); i++) stepMatch(match, dt);
  assert.equal(match.seats.get('a').classId, 'assassin');
  assert.equal(match.seats.get('a').pendingClass, null);
  assert.equal(match.world.fighters.get('a').weapon, 'staff');
  assert.equal(matchView(match, 'a').me.specialMeter, 0);
  assert.equal(match.seats.get('b').classId, 'healer');
  assert.equal(matchView(match, 'b').me.specialMeter, 0);
});
