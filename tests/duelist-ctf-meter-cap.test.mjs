import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, stepMatch, matchView, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const TICK = 1 / 60;
function start(match) {
  for (let i = 0; i < Math.ceil((COUNTDOWN + 0.1) / TICK); i++) stepMatch(match, TICK);
  assert.equal(match.phase, 'live');
}

test('CTF objective charge caps at 100, remains private and cannot be replayed by input', () => {
  const match = createMatch({ mode: 'ctf', players: [
    { id: 'red', team: 'red' }, { id: 'blue', team: 'blue' },
  ], seats: 2 });
  assert.equal(queueMatchClass(match, 'red', 'healer').accepted, true);
  start(match);
  const seat = match.seats.get('red');
  seat.specialMeter = 97; // authoritative setup: near-full meter
  const flag = match.flags.blue;
  flag.state = 'carried';
  flag.carrier = 'red';
  const home = match.flags.red.home;
  const body = match.world.bodies.get('red');
  body.x = home.x;
  body.z = home.z;

  stepMatch(match, TICK, { red: { objective: true, specialMeter: 999, classId: 'assassin' } });
  assert.equal(match.scores.red.captures, 1);
  assert.equal(seat.specialMeter, 100, 'confirmed capture is capped at 100');
  assert.equal(seat.classId, 'healer', 'client class injection is ignored');
  assert.equal(matchView(match, 'red').me.specialMeter, 100);
  assert.equal(matchView(match, 'blue').me.specialMeter, null, 'other seat cannot read red charge');
  assert.ok(matchView(match, 'blue').people.every(person => !Object.hasOwn(person, 'specialMeter')));

  stepMatch(match, TICK, { red: { objective: true, specialMeter: 999 } });
  assert.equal(match.scores.red.captures, 1, 'the same capture cannot be replayed');
  assert.equal(seat.specialMeter, 100);
  assert.equal(flag.state, 'home');
});
