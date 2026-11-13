import test from 'node:test';
import assert from 'node:assert/strict';
import { findSafeNearbyRespawn, NEARBY_RESPAWN_ID } from '../src/components/game3d/death/nearbyRespawnRules.mjs';

test('chooses a few meters from death with terrain height', () => {
  const p = findSafeNearbyRespawn({x:10,z:10}, {sampleGroundY:() => 3});
  assert.equal(p.id, NEARBY_RESPAWN_ID);
  assert.ok(p.distance >= 2 && p.distance <= 12);
  assert.equal(p.y, 3);
  assert.ok(Math.hypot(p.x - 10, p.z - 10) >= 2);
});

test('no valid terrain returns no nearby respawn', () => {
  assert.equal(findSafeNearbyRespawn({x:0,z:0}, {sampleGroundY:()=>null}), null);
});

test('rejects collision, water or hostile candidates with fallback', () => {
  const p = findSafeNearbyRespawn({x:0,z:0}, {
    sampleGroundY:() => 0,
    isBlocked: spot => spot.x > 0,
    isDangerous: spot => spot.z > 0,
  });
  assert.ok(p);
  assert.ok(p.x <= 0 && p.z <= 0);
});

test('rejects dangerous slopes, even when there is a ground mesh', () => {
  assert.equal(findSafeNearbyRespawn({x:0,z:0}, {
    sampleGroundY:(x,z)=> x === 0 && z === 0 ? 0 : Math.sin(x*11) * 10,
    maxGroundDifference:0,
  }), null);
});

test('requires finite coordinates and a sampler', () => {
  assert.equal(findSafeNearbyRespawn({x:Infinity,z:0},{sampleGroundY:()=>0}),null);
  assert.equal(findSafeNearbyRespawn({x:0,z:0}),null);
});
