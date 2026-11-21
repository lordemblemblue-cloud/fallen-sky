import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/components/duelist/sim/match.mjs';
import { parseClassSpecialPacket, validateAuthenticatedSpecialRequest } from '../src/components/duelist/sim/classSpecialBoundary.mjs';

test('strict packet grammar excludes forged actor, class, meter and effects', () => {
  assert.deepEqual(parseClassSpecialPacket({ type: 'class.special' }), { ok: true, targetId: null });
  assert.deepEqual(parseClassSpecialPacket({ type: 'class.special', targetId: 'enemy' }), { ok: true, targetId: 'enemy' });
  for (const packet of [null, [], {}, { type: 'class.special', id: 'victim' },
    { type: 'class.special', meter: 100 }, { type: 'class.special', classId: 'assassin' },
    { type: 'class.special', targetId: 2 }, { type: 'class.special', targetId: '' },
    { type: 'class.special', targetId: 'x', damage: 9999 },
    { type: 'class.special', targetId: 'x'.repeat(129) },
    { type: 'class.special', actor: 'other' }, { type: 'class.special', animation: 'fake' }]) {
    assert.equal(parseClassSpecialPacket(packet).ok, false);
  }
});
test('unverified seats and bots cannot request specials', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'p1' }] });
  assert.equal(validateAuthenticatedSpecialRequest({ match, packet: { type: 'class.special' } }).reason, 'unauthenticated-seat');
  assert.equal(validateAuthenticatedSpecialRequest({ match, verifiedSeatId: 'absent', packet: { type: 'class.special' } }).reason, 'unauthenticated-seat');
  const bot = [...match.seats.values()].find(s => s.kind === 'bot');
  assert.equal(validateAuthenticatedSpecialRequest({ match, verifiedSeatId: bot.id, packet: { type: 'class.special' } }).reason, 'unauthenticated-seat');
});
test('all four classes fail closed even with full meter; never mutate charge', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'p1' }, { id: 'p2' }] });
  match.phase = 'live';
  for (const classId of ['assassin', 'duelist', 'warrior', 'healer']) { // the Juggernaut is the Warrior now
    const seat = match.seats.get('p1');
    seat.classId = classId;
    seat.specialMeter = 100;
    const packet = { type: 'class.special', ...(classId === 'assassin' || classId === 'duelist' ? { targetId: 'p2' } : {}) };
    const result = validateAuthenticatedSpecialRequest({ match, verifiedSeatId: 'p1', packet });
    assert.deepEqual(result, { accepted: false, reason: 'special-not-implemented' });
    assert.equal(seat.specialMeter, 100);
  }
});
test('phase, charge, target and class gates are server-derived', () => {
  const match = createMatch({ mode: 'duel', players: [{ id: 'p1' }, { id: 'p2' }] });
  const seat = match.seats.get('p1');
  seat.classId = 'assassin'; seat.specialMeter = 100;
  const packet = { type: 'class.special', targetId: 'p2' };
  assert.equal(validateAuthenticatedSpecialRequest({ match, verifiedSeatId: 'p1', packet }).reason, 'not-active');
  match.phase = 'live';
  seat.specialMeter = 0;
  assert.equal(validateAuthenticatedSpecialRequest({ match, verifiedSeatId: 'p1', packet }).reason, 'not-charged');
  seat.specialMeter = 100;
  assert.equal(validateAuthenticatedSpecialRequest({ match, verifiedSeatId: 'p1', packet: { type: 'class.special', targetId: 'p1' } }).reason, 'target-required');
  seat.classId = null;
  assert.equal(validateAuthenticatedSpecialRequest({ match, verifiedSeatId: 'p1', packet }).reason, 'invalid-class-state');
});
