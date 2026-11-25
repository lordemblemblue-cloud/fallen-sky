// Regression: a trusted CTF objective must clamp the owning class meter to 100,
// without rewarding an opposing seat or replaying a returned flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, stepMatch, matchView, COUNTDOWN, matchCountdownSeconds } from '../src/components/duelist/sim/match.mjs';

const DT = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) stepMatch(match, DT);
}

test('CTF objective caps the credited class at 100 and cannot be replayed', () => {
  const match = createMatch({ mode: 'ctf', players: [
    { id: 'carrier', team: 'red' },
    { id: 'opponent', team: 'blue' },
  ], seats: 2 });
  assert.equal(queueMatchClass(match, 'carrier', 'warrior').accepted, true);
  assert.equal(queueMatchClass(match, 'opponent', 'healer').accepted, true);
  advance(match, matchCountdownSeconds(match.mode) + 0.1);
  assert.equal(match.phase, 'live');

  const carrier = match.seats.get('carrier');
  const opponent = match.seats.get('opponent');
  carrier.specialMeter = 95;
  opponent.specialMeter = 38;

  // Client claims cannot charge either seat; only the match's flag rules can.
  stepMatch(match, DT, { carrier: { specialMeter: 100, objective: 'captured' } });
  assert.equal(carrier.specialMeter, 95);
  assert.equal(opponent.specialMeter, 38);

  const flag = match.flags.blue;
  flag.state = 'carried';
  flag.carrier = 'carrier';
  const body = match.world.bodies.get('carrier');
  assert.ok(body);
  body.x = match.flags.red.home.x;
  body.y = match.flags.red.home.y;
  body.z = match.flags.red.home.z;
  stepMatch(match, DT);

  assert.equal(match.scores.carrier.captures, 1);
  assert.equal(carrier.specialMeter, 100, 'server-owned objective reward must clamp at the meter cap');
  assert.equal(opponent.specialMeter, 38, 'opposing class meter must not be modified');
  assert.equal(matchView(match, 'carrier').me.specialMeter, 100);
  assert.equal(matchView(match, 'opponent').me.specialMeter, 38);
  assert.equal(matchView(match).people.some((person) => 'specialMeter' in person), false);

  stepMatch(match, DT);
  assert.equal(match.scores.carrier.captures, 1, 'returned flag must not be captured twice');
  assert.equal(carrier.specialMeter, 100);
  assert.equal(opponent.specialMeter, 38);
});
