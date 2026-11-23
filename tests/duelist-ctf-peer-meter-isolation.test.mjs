import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, queueMatchClass, matchView, stepMatch, COUNTDOWN,
} from '../src/components/duelist/sim/match.mjs';

const STEP = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
}

test('confirmed CTF capture charges only the credited classed seat, not its opponent', () => {
  const match = createMatch({
    mode: 'ctf', seats: 2,
    players: [{ id: 'redPlayer', team: 'red' }, { id: 'bluePlayer', team: 'blue' }],
  });
  assert.equal(queueMatchClass(match, 'redPlayer', 'warrior').accepted, true);
  assert.equal(queueMatchClass(match, 'bluePlayer', 'healer').accepted, true);
  advance(match, COUNTDOWN + 0.1);

  const red = match.seats.get('redPlayer');
  const blue = match.seats.get('bluePlayer');
  red.specialMeter = 35;
  blue.specialMeter = 65;

  // Forged capture and charge claims cannot affect either seat.
  stepMatch(match, STEP, {
    redPlayer: { captures: 99, objective: 'capture', specialMeter: 100 },
    bluePlayer: { captures: 99, specialMeter: 0 },
  });
  assert.equal(red.specialMeter, 35);
  assert.equal(blue.specialMeter, 65);

  // Set up an authoritative carrier at the home flag; only the server's
  // objective-resolution path may award charge to the credited carrier.
  match.flags.blue.state = 'carried';
  match.flags.blue.carrier = 'redPlayer';
  const home = match.flags.red.home;
  const body = match.world.bodies.get('redPlayer');
  assert.ok(body);
  body.x = home.x;
  body.z = home.z;
  stepMatch(match, STEP);

  assert.equal(match.scores.redPlayer.captures, 1);
  assert.equal(red.specialMeter, 45);
  assert.equal(blue.specialMeter, 65);
  assert.equal(matchView(match, 'redPlayer').me.specialMeter, 45);
  assert.equal(matchView(match, 'bluePlayer').me.specialMeter, 65);
  for (const viewer of ['redPlayer', 'bluePlayer']) {
    assert.equal(matchView(match, viewer).people.some(person =>
      'specialMeter' in person || 'pendingClass' in person), false);
  }

  stepMatch(match, STEP);
  assert.equal(red.specialMeter, 45, 'resolved capture cannot pay twice');
  assert.equal(blue.specialMeter, 65, 'opponent charge must remain isolated');
});
