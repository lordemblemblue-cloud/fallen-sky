import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  townObstacles, obstacleHit, makeBlockedTest, standingCandidates, findStandingSpot,
  clearDestination, inRiver, TOWN_FOUNTAIN, CAST_SEARCH_RADIUS,
} from '../src/components/game3d/threeroads/cast/castPlacement.mjs';
import { THREE_ROADS_CAST, threeRoadsCastAtHome } from '../src/components/game3d/threeroads/script/cast.mjs';
import { localToWorld } from '../src/components/game3d/threeroads/coords.mjs';

const flat = () => 22.7;

test('the layout obstacles hold the fountain, the four shops, eight houses and the archers', () => {
  const list = townObstacles();
  const ids = list.map(o => o.id);
  assert.ok(ids.includes('fountain'));
  assert.ok(ids.includes('ancient-tree'));
  for (const id of ['blacksmith', 'tailor', 'potion', 'models']) assert.ok(ids.includes('shop-' + id), id);
  assert.equal(ids.filter(id => /^residence-\d$/.test(id)).length, 8);
  assert.equal(ids.filter(id => id.startsWith('quest-giver-')).length, 5);
  const fountain = list.find(o => o.id === 'fountain');
  assert.ok(obstacleHit(fountain, 6.9, 0, 0.5), 'inside the basin rim');
  assert.ok(!obstacleHit(fountain, 7.2, 0, 0.5), 'just clear of it');
});

test('a turned rectangle is hit inside and missed outside (blacksmith, 45 degrees)', () => {
  const smith = townObstacles().find(o => o.id === 'shop-blacksmith');
  assert.ok(obstacleHit(smith, -15.5, -15.5));
  assert.ok(!obstacleHit(smith, -15.5 + 12, -15.5 - 12), 'well outside on the diagonal');
});

test('candidates start at the home and stay within the search radius, nearest first', () => {
  const list = standingCandidates(10, 20);
  assert.deepEqual([list[0].x, list[0].z], [10, 20]);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i].distance >= list[i - 1].distance);
    assert.ok(Math.hypot(list[i].x - 10, list[i].z - 20) <= CAST_SEARCH_RADIUS + 1e-6);
  }
});

test('a clear home is used as it is', () => {
  const spot = findStandingSpot({ x: 0, z: -30 }, { groundY: flat, isBlocked: makeBlockedTest() });
  assert.equal(spot.status, 'found');
  assert.deepEqual([spot.x, spot.z, spot.distance], [0, -30, 0]);
});

test('a home inside the fountain moves out to clear ground within 6 m', () => {
  const blocked = makeBlockedTest();
  const spot = findStandingSpot({ x: 3, z: 0 }, { groundY: flat, isBlocked: blocked });
  assert.equal(spot.status, 'found');
  assert.ok(!blocked(spot.x, spot.z));
  assert.ok(Math.hypot(spot.x, spot.z) >= TOWN_FOUNTAIN.radius + 0.5);
  assert.ok(spot.distance <= 6);
});

test('no ground anywhere means wait; ground with only steps means blocked', () => {
  assert.equal(findStandingSpot({ x: 0, z: -30 }, { groundY: () => null }).status, 'no-ground');
  const stairs = (x, z) => Math.round(x * 4 + z * 4) * 0.5; // a 0.5 m step every 25 cm
  assert.equal(findStandingSpot({ x: 0, z: -30 }, { groundY: stairs }).status, 'blocked');
});

test('a spot the scene probe refuses is skipped, and the nearest layout-clear one is the fallback', () => {
  const refuseHome = (x, _y, z) => Math.hypot(x, z + 30) > 1;
  const spot = findStandingSpot({ x: 0, z: -30 }, { groundY: flat, probe: refuseHome });
  assert.equal(spot.status, 'found');
  assert.ok(spot.distance > 1);
  const refuseAll = findStandingSpot({ x: 0, z: -30 }, { groundY: flat, probe: () => false });
  assert.equal(refuseAll.status, 'fallback');
  assert.equal(refuseAll.distance, 0);
});

test('every home in the table (before and after the war opens, and every alsoAt) has clear ground within 6 m', () => {
  const blocked = makeBlockedTest();
  const homes = [];
  for (const flags of [{}, { tr_war_open: true }])
    for (const area of ['town', 'south', 'west', 'east', 'north']) homes.push(...threeRoadsCastAtHome({ area, flags }));
  assert.ok(homes.length >= 12);
  assert.ok(threeRoadsCastAtHome({ area: 'south' }).some(p => p.id === 'goro_sergeant'));
  for (const person of homes) {
    const home = localToWorld(person.home.x, person.home.z);
    const spot = findStandingSpot(home, { groundY: flat, isBlocked: blocked });
    assert.equal(spot.status, 'found', person.id);
    assert.ok(spot.distance <= 6, person.id);
    assert.ok(!inRiver(spot.x, spot.z), person.id + ' not in the river');
  }
  assert.ok(THREE_ROADS_CAST.filter(p => p.home && !p.existing).length >= 12);
});

test('a destination at the fountain centre is moved to its rim', () => {
  const rim = clearDestination(0, 0);
  assert.ok(rim.moved);
  const d = Math.hypot(rim.x, rim.z);
  assert.ok(d > TOWN_FOUNTAIN.radius + 0.5 && d < TOWN_FOUNTAIN.radius + 1, String(d));
  assert.deepEqual(clearDestination(0, -30), { x: 0, z: -30, moved: false });
});
