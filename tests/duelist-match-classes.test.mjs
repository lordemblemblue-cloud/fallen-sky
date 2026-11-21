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

test('special meter is server-owned, starts at zero and is visible only to the seat owner', () => {
  const m = createMatch({ mode: 'duel', players: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(matchView(m, 'a').me.specialMeter, null, 'legacy class has no invented charge');
  assert.equal(queueMatchClass(m, 'a', 'assassin').accepted, true);
  assert.equal(queueMatchClass(m, 'b', 'healer').accepted, true);
  advance(m, COUNTDOWN + 0.1);
  assert.equal(matchView(m, 'a').me.specialMeter, 0);
  assert.equal(matchView(m, 'b').me.specialMeter, 0);
  assert.equal(matchView(m, 'a').people.some(p => Object.hasOwn(p, 'specialMeter')), false);
  assert.equal(matchView(m, 'b').people.some(p => Object.hasOwn(p, 'specialMeter')), false);
  const before = m.seats.get('a').specialMeter;
  stepMatch(m, STEP, { a: { specialMeter: 100, presses: ['special'], classId: 'juggernaut' } });
  assert.equal(m.seats.get('a').specialMeter, before, 'untrusted input cannot award charge');
  assert.equal(m.seats.get('a').classId, 'assassin', 'input cannot switch class');
  assert.equal(matchView(m, 'unknown').me, null);
});

test('special meter belongs to a seat and never transfers to a replacement bot', () => {
  const m = createMatch({ mode: 'practice', players: [{ id: 'a' }], seats: 2 });
  queueMatchClass(m, 'a', 'duelist');
  advance(m, COUNTDOWN + 0.1);
  m.seats.get('a').specialMeter = 95;
  assert.equal(matchView(m, 'a').me.specialMeter, 95);
  // Leaving a match destroys the player seat; a replacement is a new bot.
  // Do not leak a departing player's meter into the next occupant.
  assert.equal(m.seats.get('bot1').specialMeter, 0);
});


test('only a server-confirmed CTF capture awards objective charge to a classed human', () => {
  const m = createMatch({ mode: 'ctf', players: [
    { id: 'redPlayer', team: 'red' }, { id: 'bluePlayer', team: 'blue' },
  ], seats: 2 });
  assert.equal(queueMatchClass(m, 'redPlayer', 'healer').accepted, true);
  advance(m, COUNTDOWN + 0.1);
  const red = m.world.fighters.get('redPlayer');
  // Client claims, including fabricated objective/meter fields, are not trusted.
  stepMatch(m, STEP, { redPlayer: { objective: true, specialMeter: 100 } });
  assert.equal(m.seats.get('redPlayer').specialMeter, 0);
  // Arrange an already-authorized server-side flag carrier at their own base.
  const enemyFlag = m.flags.blue;
  enemyFlag.state = 'carried';
  enemyFlag.carrier = 'redPlayer';
  const own = m.flags.red;
  const body = m.world.bodies.get('redPlayer');
  assert.ok(body, 'world owns the fighter body');
  body.x = own.home.x;
  body.z = own.home.z;
  stepMatch(m, STEP);
  assert.equal(m.scores.redPlayer.captures, 1);
  assert.equal(m.seats.get('redPlayer').specialMeter, 10);
  assert.equal(matchView(m, 'redPlayer').me.specialMeter, 10);
  assert.equal(matchView(m, 'bluePlayer').people.some(p => 'specialMeter' in p), false);
  stepMatch(m, STEP);
  assert.equal(m.seats.get('redPlayer').specialMeter, 10, 'a returned flag cannot award twice');
});


test('switching class at a legal respawn resets old special charge, but same-class respawn retains it', () => {
  const m = createMatch({ mode: 'practice', players: [{ id: 'me' }], seats: 2 });
  assert.equal(queueMatchClass(m, 'me', 'assassin').accepted, true);
  advance(m, COUNTDOWN + 0.1);
  const seat = m.seats.get('me');
  seat.specialMeter = 75;
  let fighter = m.world.fighters.get('me');
  fighter.vitals.dead = true;
  seat.respawnAt = m.world.time + 0.05;
  assert.equal(queueMatchClass(m, 'me', 'assassin').accepted, true);
  advance(m, 0.15);
  assert.equal(seat.classId, 'assassin');
  assert.equal(seat.specialMeter, 75, 'same-class respawn must not erase charge');
  fighter = m.world.fighters.get('me');
  fighter.vitals.dead = true;
  seat.respawnAt = m.world.time + 0.05;
  assert.equal(queueMatchClass(m, 'me', 'healer').accepted, true);
  assert.equal(seat.specialMeter, 75, 'queued class cannot alter meter before respawn');
  advance(m, 0.15);
  assert.equal(seat.classId, 'healer');
  assert.equal(seat.specialMeter, 0, 'new class cannot inherit previous special charge');
  assert.equal(matchView(m, 'me').me.specialMeter, 0);
});
