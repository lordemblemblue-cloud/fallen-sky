import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClassAbilityPacket, validateAuthenticatedAbilityRequest } from '../src/components/duelist/sim/classAbilityBoundary.mjs';

const matchFor = classId => ({
  phase: 'live',
  seats: new Map([['owner', { kind: 'player', classId }], ['other', { kind: 'player', classId }], ['bot', { kind: 'bot', classId }]]),
  world: { fighters: new Map([
    ['owner', { vitals: { hp: 100, dead: false } }],
    ['other', { vitals: { hp: 100, dead: false } }],
    ['bot', { vitals: { hp: 100, dead: false } }],
  ]) },
});
const request = (match, packet = { type: 'class.ability', slot: 0 }, verifiedSeatId = 'owner') =>
  validateAuthenticatedAbilityRequest({ match, verifiedSeatId, packet, first: 0, now: 20, cooldowns: {} });

test('only the three visible slot indices are valid', () => {
  for (const slot of [0, 1, 2]) assert.deepEqual(parseClassAbilityPacket({ type: 'class.ability', slot }), { ok: true, slot });
  for (const slot of [-1, 3, 0.5, '0', NaN, Infinity, null]) {
    assert.equal(parseClassAbilityPacket({ type: 'class.ability', slot }).ok, false);
  }
});
test('rejects identity, meter, class, page, damage and animation spoofing', () => {
  for (const extra of ['seatId', 'actorId', 'classId', 'first', 'meter', 'damage', 'animation', 'cooldowns', 'now', 'effect']) {
    assert.equal(parseClassAbilityPacket({ type: 'class.ability', slot: 0, [extra]: 1 }).ok, false, extra);
  }
  assert.equal(parseClassAbilityPacket({ type: 'class.ability', slot: 0, __proto__: null, foo: 1 }).ok, false);
  assert.equal(parseClassAbilityPacket([]).ok, false);
});
test('all four classes deny unimplemented abilities without mutating match', () => {
  for (const id of ['assassin', 'duelist', 'juggernaut', 'healer']) {
    const match = matchFor(id);
    const before = JSON.stringify([...match.seats]);
    for (const slot of [0, 1, 2]) {
      assert.deepEqual(request(match, { type: 'class.ability', slot }), {
        accepted: false, reason: 'not-implemented',
      });
    }
    assert.equal(JSON.stringify([...match.seats]), before);
  }
});
test('server identity, match phase, life and cooldown are enforced', () => {
  const match = matchFor('assassin');
  assert.equal(request(match, undefined, 'unknown').reason, 'unauthenticated-seat');
  assert.equal(request(match, undefined, 'bot').reason, 'unauthenticated-seat');
  match.phase = 'countdown';
  assert.equal(request(match).reason, 'not-active');
  match.phase = 'live';
  match.world.fighters.get('owner').vitals.dead = true;
  assert.equal(request(match).reason, 'actor-defeated');
  match.world.fighters.get('owner').vitals.dead = false;
  assert.equal(validateAuthenticatedAbilityRequest({
    match, verifiedSeatId: 'owner', packet: { type: 'class.ability', slot: 0 },
    first: 0, now: 20, cooldowns: { stealth: 30 },
  }).reason, 'cooldown');
});
test('missing authoritative page, time or cooldown state fails closed', () => {
  const match = matchFor('healer');
  for (const options of [{ first: -1, now: 20, cooldowns: {} },
    { first: 0, now: undefined, cooldowns: {} },
    { first: 0, now: 20, cooldowns: undefined }]) {
    assert.equal(validateAuthenticatedAbilityRequest({
      match, verifiedSeatId: 'owner', packet: { type: 'class.ability', slot: 1 }, ...options,
    }).reason, 'invalid-context');
  }
});
