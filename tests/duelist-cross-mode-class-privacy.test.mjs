import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchView, queueMatchClass, stepMatch, matchCountdownSeconds } from '../src/components/duelist/sim/match.mjs';

// Cross-mode regression: the selected class is public combat identity, but the
// next-spawn choice and charge are private to the server-authenticated seat.
for (const mode of ['practice', 'duel', 'ffa', 'tdm', 'ctf', 'escort', 'football', 'control']) {
  test(`${mode}: class queue and meter stay isolated between player seats`, () => {
    const match = createMatch({
      mode, seed: 9, seats: 2,
      players: [{ id: 'alice', team: 'red' }, { id: 'bob', team: 'blue' }],
    });
    assert.equal(queueMatchClass(match, 'alice', 'assassin').accepted, true);
    assert.equal(queueMatchClass(match, 'bob', 'healer').accepted, true);
    const waiting = matchView(match, 'bob');
    assert.equal(waiting.me.pendingClass, 'healer');
    assert.equal(waiting.people.some(person => 'pendingClass' in person || 'specialMeter' in person), false);
    for (let i = 0; i < Math.ceil((matchCountdownSeconds(mode) + 0.1) * 60); i++) stepMatch(match, 1 / 60);
    assert.equal(match.seats.get('alice').classId, 'assassin');
    assert.equal(match.seats.get('bob').classId, 'healer');
    match.seats.get('alice').specialMeter = 83;
    match.seats.get('bob').specialMeter = 21;
    const alice = matchView(match, 'alice');
    const bob = matchView(match, 'bob');
    assert.equal(alice.me.specialMeter, 83);
    assert.equal(bob.me.specialMeter, 21);
    for (const view of [alice, bob, matchView(match, 'unseated')]) {
      assert.equal(view.people.some(person => 'pendingClass' in person || 'specialMeter' in person), false);
    }
    assert.equal(matchView(match, 'unseated').me, null);
  });
}
