import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedSeatLeaseRegistry } from '../src/components/duelist/sim/verifiedSeatLease.mjs';
import { validateLeasedClassAbility } from '../src/components/duelist/sim/leasedClassAbility.mjs';

const packet = { type: 'class.ability', slot: 0 };
const match = () => ({
  phase: 'live',
  seats: new Map([['p1', { kind: 'player', classId: 'duelist' }], ['p2', { kind: 'player', classId: 'assassin' }]]),
  world: { fighters: new Map([['p1', { vitals: { hp: 100, dead: false } }], ['p2', { vitals: { hp: 100, dead: false } }]]) },
});
const request = (leases, connection, overrides = {}) =>
  validateLeasedClassAbility({ match: match(), leases, connection, packet, first: 0, now: 100, cooldowns: {}, ...overrides });

test('unbound connections fail closed', () => {
  const leases = createVerifiedSeatLeaseRegistry();
  assert.deepEqual(request(leases, {}), { accepted: false, reason: 'unauthenticated-seat' });
  assert.deepEqual(request(undefined, {}), { accepted: false, reason: 'unauthenticated-seat' });
});

test('verified human seat reaches existing fail-closed ability gate', () => {
  const leases = createVerifiedSeatLeaseRegistry();
  const socket = {};
  assert.equal(leases.bindVerifiedConnection(socket, 'p1').accepted, true);
  assert.deepEqual(request(leases, socket), { accepted: false, reason: 'ability-execution-not-wired' });
});

test('reconnect invalidates old connection immediately and preserves new seat', () => {
  const leases = createVerifiedSeatLeaseRegistry();
  const oldSocket = {}, newSocket = {};
  leases.bindVerifiedConnection(oldSocket, 'p1');
  leases.bindVerifiedConnection(newSocket, 'p1');
  assert.equal(request(leases, oldSocket).reason, 'unauthenticated-seat');
  assert.equal(request(leases, newSocket).reason, 'ability-execution-not-wired');
  assert.equal(leases.releaseConnection(oldSocket), false);
  assert.equal(request(leases, newSocket).reason, 'ability-execution-not-wired');
});

test('packet cannot spoof identity, animation, damage, class or meter', () => {
  const leases = createVerifiedSeatLeaseRegistry();
  const socket = {};
  leases.bindVerifiedConnection(socket, 'p1');
  for (const extra of [{ seatId: 'p2' }, { classId: 'assassin' }, { damage: 999 },
    { animation: 'execute' }, { specialMeter: 100 }, { first: 1 }, { now: 0 }]) {
    assert.equal(request(leases, socket, { packet: { ...packet, ...extra } }).reason, 'invalid-ability-request');
  }
});

test('wrong phase, bot seat and defeated actor cannot activate powers', () => {
  const leases = createVerifiedSeatLeaseRegistry();
  const socket = {};
  leases.bindVerifiedConnection(socket, 'p1');
  const inactive = match(); inactive.phase = 'countdown';
  assert.equal(request(leases, socket, { match: inactive }).reason, 'not-active');
  const bot = match(); bot.seats.get('p1').kind = 'bot';
  assert.equal(request(leases, socket, { match: bot }).reason, 'unauthenticated-seat');
  const defeated = match(); defeated.world.fighters.get('p1').vitals.hp = 0;
  assert.equal(request(leases, socket, { match: defeated }).reason, 'actor-defeated');
});
