import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, matchView, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const STEP = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
}

test('invalid class requests cannot erase a queued choice or alter another seat meter', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(queueMatchClass(match, 'a', 'warrior').accepted, true);
  assert.equal(queueMatchClass(match, 'b', 'healer').accepted, true);
  advance(match, COUNTDOWN + 0.1);
  const a = match.seats.get('a');
  const b = match.seats.get('b');
  a.specialMeter = 65;
  b.specialMeter = 40;
  match.world.fighters.get('a').vitals.dead = true;
  a.respawnAt = match.world.time + 0.5;
  assert.equal(queueMatchClass(match, 'a', 'assassin').accepted, true);
  for (const invalid of ['__proto__', 'constructor', 'not-a-class', '', null]) {
    const result = queueMatchClass(match, 'a', invalid);
    assert.equal(result.accepted, false, String(invalid));
    assert.equal(a.pendingClass, 'assassin');
    assert.equal(a.classId, 'warrior');
    assert.equal(a.specialMeter, 65);
    assert.equal(b.classId, 'healer');
    assert.equal(b.specialMeter, 40);
  }
  assert.equal(matchView(match, 'a').me.specialMeter, 65);
  assert.equal(matchView(match, 'b').me.specialMeter, 40);
  assert.equal(matchView(match, 'b').people.some(person => 'specialMeter' in person), false);
  advance(match, 0.6);
  assert.equal(a.classId, 'assassin');
  assert.equal(a.specialMeter, 0);
  assert.equal(b.classId, 'healer');
  assert.equal(b.specialMeter, 40);
});
