import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { createMatch, queueMatchClass, stepMatch, matchView, standInInput, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const STEP = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
}

// This is simulation-only coverage, not WebSocket authentication or visual class assets.
test('all four canonical class selections are queued, private, and applied only at countdown spawn', () => {
  for (const classId of CLASS_IDS) {
    const match = createMatch({ mode: 'practice', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
    const original = match.world.fighters.get('alpha');
    assert.equal(queueMatchClass(match, 'alpha', classId).accepted, true, classId);
    assert.equal(match.seats.get('alpha').classId, null, classId);
    assert.equal(original.weapon, 'sword', classId);
    assert.equal(matchView(match, 'alpha').me.pendingClass, classId);
    assert.equal(matchView(match, 'beta').me.pendingClass, null, 'other seat sees only its own pending choice');
    assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'pendingClass')), false);
    assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'specialMeter')), false);
    advance(match, COUNTDOWN + 0.1);
    assert.equal(match.seats.get('alpha').classId, classId);
    assert.equal(match.seats.get('alpha').pendingClass, null);
    assert.equal(match.world.fighters.get('alpha').weapon, CLASSES[classId].weapon);
    assert.equal(matchView(match, 'alpha').me.specialMeter, 0);
    assert.equal(matchView(match, 'beta').me.specialMeter, null);
  }
});

test('latest legal queued class wins at spawn; a forged input cannot overwrite the selection', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'alpha', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'alpha', 'healer').accepted, true);
  stepMatch(match, STEP, { alpha: { classId: 'warrior', pendingClass: 'warrior', specialMeter: 100 } });
  assert.equal(match.seats.get('alpha').pendingClass, 'healer');
  advance(match, COUNTDOWN + 0.1);
  assert.equal(match.seats.get('alpha').classId, 'healer');
  assert.equal(match.world.fighters.get('alpha').weapon, 'sword');
  assert.equal(match.seats.get('alpha').specialMeter, 0);
  assert.equal(queueMatchClass(match, 'alpha', 'warrior').reason, 'alive-in-match');
  assert.equal(match.seats.get('alpha').pendingClass, null);
});

test('every match mode applies each class at countdown without exposing private resource to opponents', () => {
  for (const mode of ['practice', 'duel', 'ffa', 'tdm', 'ctf', 'football', 'control']) {
    for (const classId of CLASS_IDS) {
      const match = createMatch({ mode, players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
      assert.equal(queueMatchClass(match, 'alpha', classId).accepted, true, mode + '/' + classId);
      advance(match, COUNTDOWN + 0.1);
      const seat = match.seats.get('alpha');
      assert.equal(seat.classId, classId, mode + '/' + classId);
      assert.equal(match.world.fighters.get('alpha').weapon, CLASSES[classId].weapon, mode + '/' + classId);
      assert.equal(matchView(match, 'alpha').me.specialMeter, 0, mode + '/' + classId);
      const opponent = matchView(match, 'beta');
      assert.equal(opponent.people.some(p => Object.hasOwn(p, 'specialMeter') || Object.hasOwn(p, 'pendingClass')), false, mode + '/' + classId);
    }
  }
});

test('untrusted seats and invalid class names cannot mutate queued choices or private meter', () => {
  const match = createMatch({ mode: 'tdm', players: [{ id: 'alpha' }], seats: 2 });
  const botId = [...match.seats.values()].find(seat => seat.kind === 'bot').id;
  assert.equal(queueMatchClass(match, 'alpha', 'assassin').accepted, true);
  const before = match.seats.get('alpha').specialMeter;
  for (const id of ['missing', botId]) {
    const result = queueMatchClass(match, id, 'healer');
    assert.equal(result.accepted, false, id);
    assert.equal(result.reason, 'not-a-player', id);
  }
  for (const invalid of ['juggernaut', 'ASSASSIN', '', null, '__proto__']) {
    assert.equal(queueMatchClass(match, 'alpha', invalid).accepted, false, String(invalid));
    assert.equal(match.seats.get('alpha').pendingClass, 'assassin');
  }
  stepMatch(match, STEP, { alpha: { specialMeter: 100, classId: 'warrior' } });
  assert.equal(match.seats.get('alpha').specialMeter, before);
  assert.equal(matchView(match, 'alpha').me.pendingClass, 'assassin');
  assert.equal(matchView(match, botId).people.some(p => Object.hasOwn(p, 'specialMeter') || Object.hasOwn(p, 'pendingClass')), false);
});

test('temporary stand-in preserves the authenticated seat class and private meter without exposing them to peers', () => {
  const match = createMatch({ mode: 'practice', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'alpha', 'assassin').accepted, true);
  advance(match, COUNTDOWN + 0.1);
  const seat = match.seats.get('alpha');
  seat.specialMeter = 40; // Arrange server-owned state; never a client packet.
  const fighter = match.world.fighters.get('alpha');
  const input = standInInput(match, 'alpha');
  assert.equal(typeof input, 'object');
  assert.equal(match.seats.get('alpha'), seat, 'disconnect stand-in must not replace the player seat');
  assert.equal(match.world.fighters.get('alpha'), fighter);
  assert.equal(seat.kind, 'player');
  assert.equal(seat.classId, 'assassin');
  assert.equal(seat.specialMeter, 40);
  assert.equal(matchView(match, 'alpha').me.specialMeter, 40);
  assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'specialMeter') || Object.hasOwn(p, 'pendingClass')), false);
  assert.equal(matchView(match, 'beta').me.specialMeter, null);
  assert.equal(matchView(match, 'unknown').me, null);
});

test('independent player seats retain their own class and private meter across countdown', () => {
  const match = createMatch({ mode: 'tdm', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'alpha', 'assassin').accepted, true);
  assert.equal(queueMatchClass(match, 'beta', 'duelist').accepted, true);
  assert.equal(matchView(match, 'alpha').me.pendingClass, 'assassin');
  assert.equal(matchView(match, 'beta').me.pendingClass, 'duelist');
  advance(match, COUNTDOWN + 0.1);
  assert.equal(match.seats.get('alpha').classId, 'assassin');
  assert.equal(match.seats.get('beta').classId, 'duelist');
  assert.equal(match.world.fighters.get('alpha').weapon, CLASSES.assassin.weapon);
  assert.equal(match.world.fighters.get('beta').weapon, CLASSES.duelist.weapon);
  match.seats.get('alpha').specialMeter = 65; // Simulate server-owned charge.
  match.seats.get('beta').specialMeter = 20;
  assert.equal(matchView(match, 'alpha').me.specialMeter, 65);
  assert.equal(matchView(match, 'beta').me.specialMeter, 20);
  for (const viewer of ['alpha', 'beta']) {
    const view = matchView(match, viewer);
    assert.equal(view.people.some(p => Object.hasOwn(p, 'specialMeter') || Object.hasOwn(p, 'pendingClass')), false);
  }
});


test('all four classes apply only at a defeated player next respawn without leaking queued choice', () => {
  for (const initialClass of CLASS_IDS) {
    for (const nextClass of CLASS_IDS) {
      const match = createMatch({ mode: 'practice', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
      assert.equal(queueMatchClass(match, 'alpha', initialClass).accepted, true);
      advance(match, COUNTDOWN + 0.1);
      const seat = match.seats.get('alpha');
      const oldFighter = match.world.fighters.get('alpha');
      seat.specialMeter = 55; // Arrange trusted match state, not a client award.
      oldFighter.vitals.dead = true;
      seat.respawnAt = match.world.time + 0.05;
      assert.equal(queueMatchClass(match, 'alpha', nextClass).accepted, true);
      assert.equal(seat.classId, initialClass, 'selection must remain queued until respawn');
      assert.equal(oldFighter.weapon, CLASSES[initialClass].weapon);
      assert.equal(seat.specialMeter, 55, 'queueing cannot spend or reset meter');
      assert.equal(matchView(match, 'alpha').me.pendingClass, nextClass);
      assert.equal(matchView(match, 'beta').people.some(p => Object.hasOwn(p, 'pendingClass') || Object.hasOwn(p, 'specialMeter')), false);
      advance(match, 0.15);
      const fighter = match.world.fighters.get('alpha');
      assert.notEqual(fighter, oldFighter);
      assert.equal(seat.classId, nextClass);
      assert.equal(seat.pendingClass, null);
      assert.equal(fighter.weapon, CLASSES[nextClass].weapon);
      assert.ok(fighter.protectedUntil > match.world.time);
      assert.equal(seat.specialMeter, initialClass === nextClass ? 55 : 0,
        'same class retains earned meter; switching class starts fresh');
      assert.equal(matchView(match, 'alpha').me.specialMeter, seat.specialMeter);
    }
  }
});
