import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchView, queueMatchClass, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const STEP = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
}

test('a player can select an Assassin before a match, but class and weapon change only at the first spawn', () => {
  const m = createMatch({ mode: 'practice', players: [{ id: 'me', name: 'Me' }], seats: 2 });
  assert.equal(m.phase, 'countdown');
  assert.equal(m.world.fighters.get('me').weapon, 'sword', 'legacy weapon remains until class choice takes effect');
  const queued = queueMatchClass(m, 'me', 'assassin');
  assert.equal(queued.accepted, true);
  assert.equal(m.seats.get('me').pendingClass, 'assassin');
  assert.equal(m.world.fighters.get('me').weapon, 'sword', 'no mid-frame weapon swapping');
  assert.equal(matchView(m, 'me').me.pendingClass, 'assassin');
  advance(m, COUNTDOWN + 0.1);
  assert.equal(m.phase, 'live');
  assert.equal(m.world.fighters.get('me').weapon, 'staff');
  assert.equal(m.seats.get('me').classId, 'assassin');
  assert.equal(m.seats.get('me').pendingClass, null);
  assert.equal(matchView(m, 'me').me.classId, 'assassin');
});

test('the match rejects alive midfight class changes and never trusts a client-supplied death status', () => {
  const m = createMatch({ mode: 'tdm', players: [{ id: 'me', name: 'Me', team: 'red' }], seats: 2 });
  advance(m, COUNTDOWN + 0.1);
  assert.equal(m.phase, 'live');
  const oldWeapon = m.world.fighters.get('me').weapon;
  const denied = queueMatchClass(m, 'me', 'duelist');
  assert.equal(denied.accepted, false);
  assert.equal(denied.reason, 'alive-in-match');
  assert.equal(m.seats.get('me').pendingClass, null);
  assert.equal(m.world.fighters.get('me').weapon, oldWeapon);
  assert.equal(queueMatchClass(m, 'bot1', 'assassin').reason, 'not-a-player');
  assert.equal(queueMatchClass(m, 'missing', 'assassin').reason, 'not-a-player');
  assert.equal(queueMatchClass(m, 'me', 'madeUpClass').reason, 'unknown-class');
  assert.equal(matchView(m, 'missing').me, null);
});

test('a defeated player may queue Duelist; next respawn applies dual blades with spawn protection', () => {
  const m = createMatch({ mode: 'practice', players: [{ id: 'me' }], seats: 2 });
  advance(m, COUNTDOWN + 0.1);
  const old = m.world.fighters.get('me');
  old.vitals.dead = true;
  m.seats.get('me').respawnAt = m.world.time + 0.05;
  assert.equal(queueMatchClass(m, 'me', 'duelist').accepted, true);
  assert.equal(m.world.fighters.get('me').weapon, 'sword', 'queued choice cannot change fallen fighter immediately');
  advance(m, 0.15);
  const renewed = m.world.fighters.get('me');
  assert.notEqual(renewed, old);
  assert.equal(renewed.weapon, 'dualBlades');
  assert.equal(m.seats.get('me').classId, 'duelist');
  assert.equal(m.seats.get('me').pendingClass, null);
  assert.ok(renewed.protectedUntil > m.world.time, 'normal respawn protection remains in force');
});

test('duel class selection between rounds is applied at the next round spawn', () => {
  const m = createMatch({ mode: 'duel', players: [{ id: 'me' }, { id: 'foe' }] });
  advance(m, COUNTDOWN + 0.1);
  m.phase = 'roundOver';
  m.phaseUntil = m.world.time + 0.05;
  assert.equal(queueMatchClass(m, 'me', 'assassin').accepted, true);
  advance(m, 0.15);
  assert.equal(m.round, 2);
  assert.equal(m.phase, 'countdown');
  assert.equal(m.world.fighters.get('me').weapon, 'staff');
  assert.equal(m.world.fighters.get('foe').weapon, 'sword', 'other fighters stay on their own weapon');
  assert.equal(m.seats.get('me').classId, 'assassin');
});
