import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, queueMatchClass, stepMatch, matchView, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

// This is a pure match-simulation regression, not a transport authentication test.
function advance(match, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds / dt); i++) stepMatch(match, dt);
}
function defeatForRespawn(match, id, delay = 0.2) {
  const fighter = match.world.fighters.get(id);
  fighter.vitals.dead = true;
  match.seats.get(id).respawnAt = match.world.time + delay;
}

test('same-class respawn retains earned special charge and never leaks it into opponent view', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'alpha', 'healer').accepted, true);
  assert.equal(queueMatchClass(match, 'beta', 'assassin').accepted, true);
  advance(match, COUNTDOWN + 0.1);
  const a = match.seats.get('alpha');
  const b = match.seats.get('beta');
  a.specialMeter = 70; // trusted-server fixture; not an input packet
  b.specialMeter = 15;
  defeatForRespawn(match, 'alpha');
  assert.equal(queueMatchClass(match, 'alpha', 'healer').accepted, true);
  assert.equal(a.pendingClass, 'healer');
  advance(match, 0.3);
  assert.equal(a.classId, 'healer');
  assert.equal(a.pendingClass, null);
  assert.equal(a.specialMeter, 70);
  assert.equal(b.specialMeter, 15);
  assert.equal(matchView(match, 'alpha').me.specialMeter, 70);
  assert.equal(matchView(match, 'beta').me.specialMeter, 15);
  assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'specialMeter')), false);
});

test('rejected class request during defeated state does not replace a valid queued switch', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
  queueMatchClass(match, 'alpha', 'duelist');
  queueMatchClass(match, 'beta', 'healer');
  advance(match, COUNTDOWN + 0.1);
  const a = match.seats.get('alpha');
  const b = match.seats.get('beta');
  a.specialMeter = 85;
  b.specialMeter = 40;
  defeatForRespawn(match, 'alpha');
  assert.equal(queueMatchClass(match, 'alpha', 'warrior').accepted, true);
  for (const invalid of ['__proto__', 'constructor', { classId: 'assassin' }, null]) {
    assert.equal(queueMatchClass(match, 'alpha', invalid).accepted, false);
    assert.equal(a.pendingClass, 'warrior');
  }
  advance(match, 0.3);
  assert.equal(a.classId, 'warrior');
  assert.equal(a.specialMeter, 0);
  assert.equal(a.pendingClass, null);
  assert.equal(b.classId, 'healer');
  assert.equal(b.specialMeter, 40);
  assert.equal(matchView(match, 'alpha').me.specialMeter, 0);
});
