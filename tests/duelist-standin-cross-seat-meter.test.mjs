import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, queueMatchClass, matchView, standInInput, stepMatch, COUNTDOWN,
} from '../src/components/duelist/sim/match.mjs';

function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepMatch(match, 1 / 60);
}

test('stand-in class transition does not expose or reset another human seat meter', () => {
  const match = createMatch({
    mode: 'practice', seats: 2, players: [{ id: 'alpha' }, { id: 'beta' }],
  });
  assert.equal(queueMatchClass(match, 'alpha', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'beta', 'duelist').accepted, true);
  advance(match, COUNTDOWN + 0.1);

  const alpha = match.seats.get('alpha');
  const beta = match.seats.get('beta');
  assert.equal(alpha.classId, 'assassin');
  assert.equal(beta.classId, 'duelist');
  alpha.specialMeter = 85;
  beta.specialMeter = 45;

  const fighter = match.world.fighters.get('alpha');
  fighter.vitals.dead = true;
  alpha.respawnAt = match.world.time + 0.05;
  assert.equal(queueMatchClass(match, 'alpha', 'healer').accepted, true);

  assert.deepEqual(standInInput(match, 'alpha'), {});
  assert.equal(beta.classId, 'duelist');
  assert.equal(beta.specialMeter, 45);
  assert.equal(matchView(match, 'beta').me.specialMeter, 45);
  assert.equal(matchView(match, 'beta').people.some(p => 'specialMeter' in p || 'pendingClass' in p), false);

  advance(match, 0.15);
  assert.equal(alpha.classId, 'healer');
  assert.equal(alpha.specialMeter, 0);
  assert.equal(beta.classId, 'duelist');
  assert.equal(beta.specialMeter, 45);
  assert.equal(matchView(match, 'beta').me.specialMeter, 45);
  assert.equal(matchView(match, 'alpha').me.specialMeter, 0);
});
