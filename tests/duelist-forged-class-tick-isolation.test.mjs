import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchView, queueMatchClass, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';
import { CLASS_IDS, classById } from '../src/components/duelist/core/classes.mjs';

const DT = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) stepMatch(match, DT);
}

test('untrusted per-tick class and charge fields cannot impersonate any of the four class kits', () => {
  for (const chosen of CLASS_IDS) {
    const match = createMatch({ mode: 'practice', players: [{ id: 'owner' }, { id: 'other' }], seats: 2 });
    assert.equal(queueMatchClass(match, 'owner', chosen).accepted, true);
    assert.equal(queueMatchClass(match, 'other', 'healer').accepted, true);
    advance(match, COUNTDOWN + 0.1);
    const owner = match.seats.get('owner');
    const other = match.seats.get('other');
    assert.equal(owner.classId, chosen);
    owner.specialMeter = 45;
    other.specialMeter = 70;
    const weapon = match.world.fighters.get('owner').weapon;
    const spoof = CLASS_IDS.find(id => id !== chosen);
    stepMatch(match, DT, {
      owner: {
        classId: spoof, pendingClass: spoof, requestedClass: spoof,
        specialMeter: 100, specialCharge: 100, chargeEvent: 'objective',
        presses: ['special'], dead: true,
      },
      other: { classId: spoof, specialMeter: 100, pendingClass: spoof },
    });
    assert.equal(owner.classId, chosen, chosen + ' active class is server-owned');
    assert.equal(owner.pendingClass, null, chosen + ' cannot queue class through a tick');
    assert.equal(owner.specialMeter, 45, chosen + ' meter is server-owned');
    assert.equal(match.world.fighters.get('owner').weapon, weapon);
    assert.equal(weapon, classById(chosen).weapon);
    assert.equal(other.classId, 'healer');
    assert.equal(other.pendingClass, null);
    assert.equal(other.specialMeter, 70);
    assert.equal(matchView(match, 'owner').me.specialMeter, 45);
    assert.equal(matchView(match, 'other').me.specialMeter, 70);
    assert.ok(matchView(match, 'owner').people.every(person => !Object.hasOwn(person, 'specialMeter')));
    assert.ok(matchView(match, 'other').people.every(person => !Object.hasOwn(person, 'specialMeter')));
  }
});
