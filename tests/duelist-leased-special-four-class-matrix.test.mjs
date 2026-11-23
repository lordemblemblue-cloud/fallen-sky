import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { createVerifiedSeatLeaseRegistry } from '../src/components/duelist/sim/verifiedSeatLease.mjs';
import { validateLeasedClassSpecialRequest } from '../src/components/duelist/sim/leasedClassSpecial.mjs';

// Transport-neutral boundary only: these checks must not pretend the special executes.
for (const classId of CLASS_IDS) {
  test(`${classId}: leased special requests use server class, meter and target policy`, () => {
    const leases = createVerifiedSeatLeaseRegistry();
    const socket = {}, otherSocket = {};
    const cost = CLASSES[classId].special.cost;
    const seats = new Map([
      ['actor', { kind: 'player', team: 'red', classId, specialMeter: cost }],
      ['enemy', { kind: 'player', team: 'blue', classId: 'warrior', specialMeter: 47 }],
      ['ally', { kind: 'player', team: 'red', classId: 'healer', specialMeter: 25 }],
    ]);
    const fighters = new Map([...seats.keys()].map(id => [id, { vitals: { dead: false } }]));
    const match = { phase: 'live', seats, world: { fighters } };
    const request = (connection, packet) => validateLeasedClassSpecialRequest({ match, leases, connection, packet });
    const targetRequired = CLASSES[classId].special.target === 'enemy';
    const validPacket = targetRequired ? { type: 'class.special', targetId: 'enemy' } : { type: 'class.special' };
    assert.equal(leases.bindVerifiedConnection(socket, 'actor').accepted, true);
    assert.equal(request(otherSocket, validPacket).reason, 'unauthenticated-seat');
    assert.equal(request(socket, validPacket).reason, 'special-not-implemented');

    // The protocol must never consume meter, apply damage or accept an animation from a packet.
    for (const field of ['seatId', 'classId', 'specialMeter', 'damage', 'animation']) {
      assert.equal(request(socket, { ...validPacket, [field]: field === 'specialMeter' ? 100 : 'forged' }).reason,
        'invalid-special-request');
    }
    assert.equal(request(socket, { type: 'class.special', targetId: 'ally' }).reason,
      targetRequired ? 'invalid-target' : 'unexpected-target');
    assert.equal(request(socket, { type: 'class.special', targetId: 'actor' }).reason,
      targetRequired ? 'target-required' : 'unexpected-target');
    if (targetRequired) assert.equal(request(socket, { type: 'class.special' }).reason, 'target-required');

    seats.get('actor').specialMeter = cost - 0.01;
    assert.equal(request(socket, validPacket).reason, 'not-charged');
    seats.get('actor').specialMeter = 100.01;
    assert.equal(request(socket, validPacket).reason, 'invalid-class-state');
    seats.get('actor').specialMeter = cost;
    fighters.get('actor').vitals.dead = true;
    assert.equal(request(socket, validPacket).reason, 'not-active');
    fighters.get('actor').vitals.dead = false;

    assert.equal(leases.bindVerifiedConnection(otherSocket, 'actor').accepted, true);
    assert.equal(request(socket, validPacket).reason, 'unauthenticated-seat');
    assert.equal(request(otherSocket, validPacket).reason, 'special-not-implemented');
    assert.equal(seats.get('actor').specialMeter, cost);
    assert.equal(seats.get('enemy').specialMeter, 47);
    assert.equal(seats.get('ally').specialMeter, 25);
  });
}
