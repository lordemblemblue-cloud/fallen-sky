import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { COUNTDOWN, createMatch, matchView, queueMatchClass, stepMatch } from '../src/components/duelist/sim/match.mjs';

// Escort was introduced after the original class-by-mode countdown matrix.
// This checks the same authoritative spawn/privacy contract without touching its renderer.
const STEP = 1 / 60;
function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, STEP);
}

test('escort countdown activates all four queued classes with private zeroed special meters', () => {
  for (const classId of CLASS_IDS) {
    const match = createMatch({ mode: 'escort', players: [{ id: 'alpha' }, { id: 'beta' }], seats: 2 });
    const seat = match.seats.get('alpha');
    assert.equal(queueMatchClass(match, 'alpha', classId).accepted, true, classId);
    assert.equal(seat.classId, null, classId);
    assert.equal(matchView(match, 'alpha').me.pendingClass, classId);
    assert.equal(matchView(match, 'alpha').me.specialMeter, null);
    stepMatch(match, STEP, { alpha: { classId: 'healer', specialMeter: 100 } });
    assert.equal(seat.classId, null, 'untrusted movement input cannot apply class');
    assert.equal(seat.pendingClass, classId, 'untrusted movement input cannot replace queue');
    advance(match, COUNTDOWN + 0.1);
    assert.equal(seat.classId, classId);
    assert.equal(seat.pendingClass, null);
    assert.equal(match.world.fighters.get('alpha').weapon, CLASSES[classId].weapon);
    assert.equal(matchView(match, 'alpha').me.specialMeter, 0);
    const peer = matchView(match, 'beta');
    assert.equal(peer.me.specialMeter, null);
    assert.equal(peer.people.some(p => Object.hasOwn(p, 'specialMeter') || Object.hasOwn(p, 'pendingClass')), false);
  }
});
