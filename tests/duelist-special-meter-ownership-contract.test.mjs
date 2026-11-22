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
