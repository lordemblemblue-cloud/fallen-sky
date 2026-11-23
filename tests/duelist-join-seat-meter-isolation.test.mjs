import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, joinMatch, leaveMatch, matchView, queueMatchClass, stepMatch, COUNTDOWN,
} from '../src/components/duelist/sim/match.mjs';

function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepMatch(match, 1 / 60);
}

test('replacing a departed player seat cannot inherit their class or special charge', () => {
  const match = createMatch({
    mode: 'practice', seats: 2,
    players: [{ id: 'departing' }, { id: 'remaining' }],
  });
  assert.equal(queueMatchClass(match, 'departing', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'remaining', 'healer').accepted, true);
  advance(match, COUNTDOWN + 0.1);

  match.seats.get('departing').specialMeter = 100;
  match.seats.get('remaining').specialMeter = 55;
  assert.equal(leaveMatch(match, 'departing'), true);
  assert.equal(match.seats.has('departing'), false);
  const replacementBot = [...match.seats.values()].find(seat => seat.kind === 'bot');
  assert.ok(replacementBot);
  assert.equal(replacementBot.specialMeter, 0, 'replacement bot starts with no inherited charge');

  const joined = joinMatch(match, { id: 'newcomer' });
  assert.equal(joined.ok, true);
  assert.equal(joined.replaced, replacementBot.id);
  assert.equal(match.seats.get('newcomer').specialMeter, 0);
  assert.equal(match.seats.get('newcomer').classId, null, 'new human must choose their own class');
  assert.equal(matchView(match, 'newcomer').me.specialMeter, null, 'legacy seat has no fabricated meter');
  assert.equal(match.seats.get('remaining').specialMeter, 55, 'other player retains their own charge');
  assert.equal(matchView(match, 'remaining').me.specialMeter, 55);
  assert.equal(matchView(match, 'newcomer').people.some(person => 'specialMeter' in person), false);
});
