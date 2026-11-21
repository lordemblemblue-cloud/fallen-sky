import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedSeatLeaseRegistry } from '../src/components/duelist/sim/verifiedSeatLease.mjs';

test('unverified connections have no seat and malformed bindings fail closed', () => {
  const leases = createVerifiedSeatLeaseRegistry();
  const socket = {};
  assert.equal(leases.resolveVerifiedSeat(socket), null);
  assert.equal(leases.bindVerifiedConnection(socket, '' ).accepted, false);
  assert.equal(leases.bindVerifiedConnection('socket', 'player1').accepted, false);
  assert.equal(leases.resolveVerifiedSeat(socket), null);
});
test('a verified connection cannot silently switch seats', () => {
  const leases = createVerifiedSeatLeaseRegistry(), socket = {};
  assert.equal(leases.bindVerifiedConnection(socket, 'player1').accepted, true);
  assert.equal(leases.bindVerifiedConnection(socket, 'player2').reason, 'connection-already-bound');
  assert.equal(leases.resolveVerifiedSeat(socket), 'player1');
});
test('reconnect invalidates old connection and stale disconnect cannot revoke replacement', () => {
  const leases = createVerifiedSeatLeaseRegistry(), oldSocket = {}, newSocket = {};
  const first = leases.bindVerifiedConnection(oldSocket, 'player1');
  const next = leases.bindVerifiedConnection(newSocket, 'player1');
  assert.ok(next.generation > first.generation);
  assert.equal(leases.resolveVerifiedSeat(oldSocket), null);
  assert.equal(leases.releaseConnection(oldSocket), false);
  assert.equal(leases.resolveVerifiedSeat(newSocket), 'player1');
  assert.equal(leases.releaseConnection(newSocket), true);
  assert.equal(leases.resolveVerifiedSeat(newSocket), null);
});
test('idempotent binding preserves generation and distinct seats remain isolated', () => {
  const leases = createVerifiedSeatLeaseRegistry(), a = {}, b = {};
  const first = leases.bindVerifiedConnection(a, 'a');
  assert.equal(leases.bindVerifiedConnection(a, 'a').generation, first.generation);
  leases.bindVerifiedConnection(b, 'b');
  assert.equal(leases.resolveVerifiedSeat(a), 'a');
  assert.equal(leases.resolveVerifiedSeat(b), 'b');
});
