import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchView, queueMatchClass, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';
import { CLASS_IDS, SPECIAL_MAX, SPECIAL_CHARGE, awardSpecialCharge } from '../src/components/duelist/core/classes.mjs';

function startClassedMatch(classId) {
  const match = createMatch({ mode: 'practice', players: [{ id: 'owner' }], seats: 2 });
  assert.equal(queueMatchClass(match, 'owner', classId).accepted, true);
  stepMatch(match, COUNTDOWN + 0.01, {});
  assert.equal(match.phase, 'live');
  return match;
}

test('every class begins with a private zero-valued special meter', () => {
  for (const classId of CLASS_IDS) {
    const match = startClassedMatch(classId);
    assert.equal(matchView(match, 'owner').me.specialMeter, 0, classId);
    assert.equal(match.seats.get('owner').specialMeter, 0, classId);
    assert.equal(matchView(match, 'owner').people.some(person => Object.hasOwn(person, 'specialMeter')), false);
    assert.equal(matchView(match, 'unknown').me, null);
  }
});

test('untrusted client input cannot write special meter, change class or queue a selection', () => {
  for (const classId of CLASS_IDS) {
    const match = startClassedMatch(classId);
    const seat = match.seats.get('owner');
    const inputs = { owner: {
      specialMeter: SPECIAL_MAX, meter: SPECIAL_MAX, classId: 'assassin',
      pendingClass: 'healer', event: 'objective', charge: SPECIAL_MAX,
      presses: [], move: { x: 0, z: 0 },
    } };
    stepMatch(match, 1 / 60, inputs);
    assert.equal(seat.specialMeter, 0, classId);
    assert.equal(seat.classId, classId);
    assert.equal(seat.pendingClass, null);
    assert.equal(matchView(match, 'owner').me.specialMeter, 0);
  }
});

test('trusted charge helper rejects malformed values and never exceeds 0–100', () => {
  for (const invalid of [-1, 101, NaN, Infinity, -Infinity, null, '0', {}, undefined]) {
    assert.equal(awardSpecialCharge(invalid, 'elimination'), null);
  }
  for (const event of ['constructor', '__proto__', 'toString', '', null, {}, 'madeUp']) {
    assert.equal(awardSpecialCharge(50, event), null);
  }
  for (const [event, amount] of Object.entries(SPECIAL_CHARGE)) {
    assert.equal(awardSpecialCharge(0, event), amount);
    assert.equal(awardSpecialCharge(99, event), SPECIAL_MAX);
  }
});

test('a charged meter remains private between human seats, including while a class swap is pending', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'red' }, { id: 'blue' }] });
  assert.equal(queueMatchClass(match, 'red', 'warrior').accepted, true);
  assert.equal(queueMatchClass(match, 'blue', 'healer').accepted, true);
  stepMatch(match, COUNTDOWN + 0.01, {});
  assert.equal(match.phase, 'live');
  const red = match.seats.get('red');
  const blue = match.seats.get('blue');
  // Model a server-confirmed award at the trusted seat boundary, not a client packet.
  red.specialMeter = awardSpecialCharge(0, 'elimination');
  blue.specialMeter = awardSpecialCharge(0, 'allyHeal');
  assert.equal(matchView(match, 'red').me.specialMeter, SPECIAL_CHARGE.elimination);
  assert.equal(matchView(match, 'blue').me.specialMeter, SPECIAL_CHARGE.allyHeal);
  for (const viewer of ['red', 'blue', 'unknown']) {
    const view = matchView(match, viewer);
    assert.equal(view.people.some(person => Object.hasOwn(person, 'specialMeter')), false);
  }
  // The pending class is not allowed to reset or transfer charge before respawn.
  match.world.fighters.get('red').vitals.dead = true;
  assert.equal(queueMatchClass(match, 'red', 'assassin').accepted, true);
  assert.equal(red.classId, 'warrior');
  assert.equal(red.specialMeter, SPECIAL_CHARGE.elimination);
  assert.equal(matchView(match, 'red').me.specialMeter, SPECIAL_CHARGE.elimination);
  assert.equal(matchView(match, 'blue').me.specialMeter, SPECIAL_CHARGE.allyHeal);
});

test('forged elimination and charge packets cannot credit either player or overwrite a rival meter', () => {
  for (const classId of CLASS_IDS) {
    const match = createMatch({ mode: 'duel', players: [{ id: 'alpha' }, { id: 'bravo' }] });
    assert.equal(queueMatchClass(match, 'alpha', classId).accepted, true);
    assert.equal(queueMatchClass(match, 'bravo', 'healer').accepted, true);
    stepMatch(match, COUNTDOWN + 0.01, {});
    assert.equal(match.phase, 'live');

    // Only the match simulation's confirmed combat callbacks may award charge.
    // Neither the actor's input nor a forged opponent key is a combat callback.
    const alpha = match.seats.get('alpha');
    const bravo = match.seats.get('bravo');
    alpha.specialMeter = awardSpecialCharge(0, 'landedHit');
    bravo.specialMeter = awardSpecialCharge(0, 'allyHeal');
    const forged = {
      alpha: {
        specialMeter: 100, specialCharge: 100, event: 'elimination',
        defeated: 'bravo', killer: 'alpha', targetId: 'bravo',
        classId: 'warrior', pendingClass: 'assassin', presses: [],
      },
      bravo: {
        specialMeter: 100, specialCharge: 100, event: 'objective',
        defeated: 'alpha', killer: 'bravo', presses: [],
      },
      // An extra unseated identity cannot introduce a new meter or seat.
      outsider: { specialMeter: 100, event: 'elimination', presses: [] },
    };
    stepMatch(match, 1 / 60, forged);
    assert.equal(alpha.specialMeter, SPECIAL_CHARGE.landedHit, classId);
    assert.equal(bravo.specialMeter, SPECIAL_CHARGE.allyHeal, classId);
    assert.equal(alpha.classId, classId);
    assert.equal(alpha.pendingClass, null);
    assert.equal(match.seats.has('outsider'), false);
    assert.equal(matchView(match, 'alpha').me.specialMeter, SPECIAL_CHARGE.landedHit);
    assert.equal(matchView(match, 'bravo').me.specialMeter, SPECIAL_CHARGE.allyHeal);
    assert.equal(matchView(match, 'outsider').me, null);
    for (const viewer of ['alpha', 'bravo', 'outsider']) {
      assert.equal(matchView(match, viewer).people.some(person => Object.hasOwn(person, 'specialMeter')), false);
    }
  }
});
