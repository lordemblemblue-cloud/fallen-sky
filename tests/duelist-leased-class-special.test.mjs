import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedSeatLeaseRegistry } from '../src/components/duelist/sim/verifiedSeatLease.mjs';
import { validateLeasedClassSpecialRequest } from '../src/components/duelist/sim/leasedClassSpecial.mjs';

function fixture() {
  const leases = createVerifiedSeatLeaseRegistry();
  const seats = new Map([
    ['alice', { kind: 'player', team: 'blue', classId: 'assassin', specialMeter: 100 }],
    ['bob', { kind: 'player', team: 'red', classId: 'duelist', specialMeter: 100 }],
    ['bot', { kind: 'bot', team: 'red', classId: 'assassin', specialMeter: 100 }],
  ]);
  const fighters = new Map([...seats.keys()].map(id => [id, { vitals: { dead: false } }]));
  return { leases, match: { phase: 'live', seats, world: { fighters } } };
}
const request = (f, connection, packet = { type: 'class.special', targetId: 'bob' }) =>
  validateLeasedClassSpecialRequest({ ...f, connection, packet });

test('unleased and malformed connections fail closed', () => {
  const f = fixture();
  assert.equal(request(f, {}).reason, 'unauthenticated-seat');
  assert.equal(request(f, null).reason, 'unauthenticated-seat');
  assert.equal(request({ ...f, leases: null }, {}).reason, 'unauthenticated-seat');
});
test('leased seat reaches server-owned special gate, but never executes unfinished effect', () => {
  const f = fixture(), socket = {};
  f.leases.bindVerifiedConnection(socket, 'alice');
  assert.equal(request(f, socket).reason, 'special-not-implemented');
  assert.equal(f.match.seats.get('alice').specialMeter, 100);
});
test('replaced socket loses access and stale disconnect cannot revoke new socket', () => {
  const f = fixture(), oldSocket = {}, newSocket = {};
  f.leases.bindVerifiedConnection(oldSocket, 'alice');
  f.leases.bindVerifiedConnection(newSocket, 'alice');
  assert.equal(request(f, oldSocket).reason, 'unauthenticated-seat');
  assert.equal(f.leases.releaseConnection(oldSocket), false);
  assert.equal(request(f, newSocket).reason, 'special-not-implemented');
});
test('packet cannot spoof seat, class, meter, damage or animation', () => {
  const f = fixture(), socket = {};
  f.leases.bindVerifiedConnection(socket, 'alice');
  for (const field of ['seatId', 'classId', 'specialMeter', 'damage', 'animation']) {
    assert.equal(request(f, socket, { type: 'class.special', targetId: 'bob', [field]: 'forged' }).reason,
      'invalid-special-request');
  }
});
test('server checks phase, life, target team and bot seat', () => {
  const f = fixture(), socket = {};
  f.leases.bindVerifiedConnection(socket, 'alice');
  f.match.phase = 'countdown';
  assert.equal(request(f, socket).reason, 'not-active');
  f.match.phase = 'live';
  f.match.world.fighters.get('alice').vitals.dead = true;
  assert.equal(request(f, socket).reason, 'not-active');
  f.match.world.fighters.get('alice').vitals.dead = false;
  f.match.seats.get('bob').team = 'blue';
  assert.equal(request(f, socket).reason, 'invalid-target');
  f.leases.bindVerifiedConnection({}, 'bot');
  const botSocket = {};
  f.leases.bindVerifiedConnection(botSocket, 'bot');
  assert.equal(request(f, botSocket).reason, 'unauthenticated-seat');
});
