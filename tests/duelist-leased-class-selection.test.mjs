import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/components/duelist/sim/match.mjs';
import { createVerifiedSeatLeaseRegistry } from '../src/components/duelist/sim/verifiedSeatLease.mjs';
import { dispatchLeasedClassSelection } from '../src/components/duelist/sim/leasedClassSelection.mjs';

const packet = classId => ({ type: 'class.select', classId });
const fixture = () => ({
  match: createMatch({ mode: 'duel', players: [{ id: 'alice' }, { id: 'bob' }] }),
  leases: createVerifiedSeatLeaseRegistry(),
});

test('no lease means no class mutation, even with a valid packet', () => {
  const { match, leases } = fixture();
  const result = dispatchLeasedClassSelection({ match, leases, connection: {}, packet: packet('assassin') });
  assert.equal(result.reason, 'unauthenticated-seat');
  assert.equal(match.seats.get('alice').pendingClass, null);
});

test('active lease dispatches class selection only to its own seat', () => {
  const { match, leases } = fixture();
  const connection = {};
  leases.bindVerifiedConnection(connection, 'alice');
  assert.equal(dispatchLeasedClassSelection({ match, leases, connection, packet: packet('healer') }).accepted, true);
  assert.equal(match.seats.get('alice').pendingClass, 'healer');
  assert.equal(match.seats.get('bob').pendingClass, null);
});

test('replaced socket cannot dispatch or revoke a new lease', () => {
  const { match, leases } = fixture();
  const oldSocket = {}, newSocket = {};
  leases.bindVerifiedConnection(oldSocket, 'alice');
  leases.bindVerifiedConnection(newSocket, 'alice');
  assert.equal(dispatchLeasedClassSelection({ match, leases, connection: oldSocket, packet: packet('assassin') }).accepted, false);
  assert.equal(leases.releaseConnection(oldSocket), false);
  assert.equal(dispatchLeasedClassSelection({ match, leases, connection: newSocket, packet: packet('juggernaut') }).accepted, true);
  assert.equal(match.seats.get('alice').pendingClass, 'juggernaut');
});

test('client seat spoofing and malformed requests fail closed', () => {
  const { match, leases } = fixture();
  const connection = {};
  leases.bindVerifiedConnection(connection, 'alice');
  const forged = { ...packet('duelist'), seatId: 'bob' };
  assert.equal(dispatchLeasedClassSelection({ match, leases, connection, packet: forged }).accepted, false);
  assert.equal(match.seats.get('alice').pendingClass, null);
  assert.equal(match.seats.get('bob').pendingClass, null);
});

test('a valid lease cannot switch class while alive in a live match', () => {
  const { match, leases } = fixture();
  const connection = {};
  leases.bindVerifiedConnection(connection, 'alice');
  match.phase = 'live';
  assert.equal(dispatchLeasedClassSelection({ match, leases, connection, packet: packet('assassin') }).reason, 'alive-in-match');
  assert.equal(match.seats.get('alice').pendingClass, null);
});
