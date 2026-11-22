import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { createMatch, matchView, queueMatchClass, stepMatch, COUNTDOWN } from '../src/components/duelist/sim/match.mjs';

const DT = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) stepMatch(match, DT);
}

test('all four classes: queued respawn choices cannot spend, steal or expose the old class meter', () => {
  for (const from of CLASS_IDS) {
    for (const to of CLASS_IDS) {
      const match = createMatch({
        mode: 'practice',
        players: [{ id: 'owner', classId: from }, { id: 'other', classId: 'healer' }],
        seats: 2,
        seed: 3,
      });
      advance(match, COUNTDOWN + 0.1);
      const seat = match.seats.get('owner');
      const other = match.seats.get('other');
      seat.specialMeter = 80;
      other.specialMeter = 17;
      const defeated = match.world.fighters.get('owner');
      defeated.vitals.dead = true;
      seat.respawnAt = match.world.time + 0.05;

      assert.equal(queueMatchClass(match, 'owner', to).accepted, true, `${from} -> ${to}`);
      assert.equal(seat.classId, from, 'the active class remains authoritative until spawn');
      assert.equal(seat.pendingClass, to);
      assert.equal(seat.specialMeter, 80, 'queuing must not prematurely reset earned charge');
      assert.equal(matchView(match, 'owner').me.specialMeter, 80);
      assert.equal(matchView(match, 'other').me.specialMeter, 17);
      assert.ok(matchView(match, 'other').people.every(p => !Object.hasOwn(p, 'specialMeter')));
      assert.equal(queueMatchClass(match, 'other', to).accepted, false, 'living opponent cannot swap');

      stepMatch(match, DT, { owner: { classId: to, specialMeter: 100, presses: ['special'] } });
      assert.equal(seat.specialMeter, 80, 'defeated client cannot mutate the meter');
      advance(match, 0.15);
      assert.equal(seat.classId, to);
      assert.equal(seat.pendingClass, null);
      assert.equal(match.world.fighters.get('owner').weapon, CLASSES[to].weapon);
      assert.equal(seat.specialMeter, from === to ? 80 : 0, 'meter stays with the original class');
      assert.equal(other.specialMeter, 17, 'other seat is unchanged');
      assert.ok(matchView(match, 'other').people.every(p => !Object.hasOwn(p, 'specialMeter')));
    }
  }
});
