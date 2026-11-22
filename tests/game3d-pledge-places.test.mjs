// The 49 places of the quest plan against the real map.
// Run: node --test tests/game3d-pledge-places.test.mjs
/* global console */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLEDGE_PLACES, PLEDGE_PLACE_Z_OFFSET, pledgePlace, pledgePlaceAtLocal, pledgePlaceAtWorld,
  pledgePlacesInArea, pledgePlacesInRegion,
} from '../src/components/game3d/pledges/pledgePlaces.mjs';
import {
  WOLFVEIL_AREA_CORE_HALF_SPAN, WOLFVEIL_AREA_IDS, WOLFVEIL_AREA_Z_OFFSET, wolfveilAreaAtLocal,
  wolfveilAreaRect,
} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

const surface = PLEDGE_PLACES.filter((place) => place.area !== null);
const under = PLEDGE_PLACES.filter((place) => place.region !== null);

// Distance from a point to the nearest border its area shares with another.
function metresToAreaBorder(place) {
  const rect = wolfveilAreaRect(place.area);
  return Math.min(place.x - rect.minX, rect.maxX - place.x, place.z - rect.minZ, rect.maxZ - place.z);
}

test('there are 49 places, numbered P01 to P49, 22 here and 27 new', () => {
  assert.equal(PLEDGE_PLACES.length, 49);
  assert.deepEqual(PLEDGE_PLACES.map((place) => place.id),
    Array.from({ length: 49 }, (_, i) => 'P' + String(i + 1).padStart(2, '0')));
  assert.equal(new Set(PLEDGE_PLACES.map((place) => place.key)).size, 49);
  // The plan's header says 23 and 26; its own tables mark 22 "Here" and 27 "New".
  assert.equal(PLEDGE_PLACES.filter((place) => place.state === 'here').length, 22);
  assert.equal(PLEDGE_PLACES.filter((place) => place.state === 'new').length, 27);
  for (const place of PLEDGE_PLACES) {
    assert.ok(Object.isFrozen(place));
    assert.match(place.key, /^[a-z0-9_]+$/);
    assert.ok(typeof place.name === 'string' && place.name.length > 0);
    assert.ok(Number.isFinite(place.x) && Number.isFinite(place.z), place.id);
    assert.ok(place.radius > 0 && place.radius <= 60, place.id);
    assert.ok((place.area === null) !== (place.region === null), `${place.id} has an area or a region, not both`);
  }
  // The plan's own counts per section.
  const perArea = Object.fromEntries(WOLFVEIL_AREA_IDS.map((area) => [area, pledgePlacesInArea(area).length]));
  assert.deepEqual(perArea, { town: 7, south: 5, west: 11, east: 11, north: 9 });
  assert.equal(pledgePlacesInRegion('wolfveil-caves').length, 5);
  assert.equal(pledgePlacesInRegion('lunar-cave').length, 1);
  assert.equal(surface.length + under.length, 49);
  assert.deepEqual(pledgePlacesInArea(null), []);
  assert.deepEqual(pledgePlacesInRegion(null), []);
});

test('every surface place lies in the area the plan lists it under', () => {
  const wrong = surface.filter((place) => wolfveilAreaAtLocal(place.x, place.z) !== place.area)
    .map((place) => `${place.id} ${place.name}: listed ${place.area}, the map says ${wolfveilAreaAtLocal(place.x, place.z)}`);
  assert.deepEqual(wrong, []);
  // And inside the 1,100 m square the terrain covers.
  for (const place of PLEDGE_PLACES) {
    assert.ok(Math.abs(place.x) <= WOLFVEIL_AREA_CORE_HALF_SPAN && Math.abs(place.z) <= WOLFVEIL_AREA_CORE_HALF_SPAN, place.id);
  }
});

test('the mouth of every place under the valley is in the area recorded for it', () => {
  for (const place of under) {
    if (place.mouthArea === null) continue;
    assert.equal(wolfveilAreaAtLocal(place.x, place.z), place.mouthArea, place.id);
  }
  assert.deepEqual(under.filter((place) => place.mouthArea === null).map((place) => place.id), ['P48']);
});

test('places that have to be built are at least 30 m from an area border', () => {
  const close = surface.filter((place) => place.state === 'new' && metresToAreaBorder(place) < 30)
    .map((place) => `${place.id} ${place.name}: ${metresToAreaBorder(place).toFixed(1)} m`);
  assert.deepEqual(close, []);
  // Reported, not failed: places already in the game that sit near a border.
  const here = surface.filter((place) => place.state === 'here' && metresToAreaBorder(place) < 30)
    .map((place) => `${place.id} ${place.name} (${place.area}): ${metresToAreaBorder(place).toFixed(1)} m from a border`);
  if (here.length) console.log('Existing places within 30 m of an area border:\n  ' + here.join('\n  '));
});

test('report: pairs of places in one area closer than 40 m, and places near the map edge', () => {
  const pairs = [];
  for (let i = 0; i < surface.length; i++) {
    for (let j = i + 1; j < surface.length; j++) {
      const a = surface[i], b = surface[j];
      if (a.area !== b.area) continue;
      const metres = Math.hypot(a.x - b.x, a.z - b.z);
      if (metres < 40) pairs.push(`${a.id} ${a.name} / ${b.id} ${b.name} (${a.area}): ${metres.toFixed(1)} m`);
    }
  }
  console.log(pairs.length
    ? 'Places in one area closer than 40 m:\n  ' + pairs.join('\n  ')
    : 'No two places in one area are closer than 40 m.');
  const edge = PLEDGE_PLACES.filter((place) => Math.max(Math.abs(place.x), Math.abs(place.z)) > 528)
    .map((place) => `${place.id} ${place.name} (${place.x}, ${place.z})`);
  if (edge.length) console.log('Places beyond the 528 m "playable half span" of the landscape design:\n  ' + edge.join('\n  '));
  const approx = PLEDGE_PLACES.filter((place) => place.approx).map((place) => `${place.id} ${place.name}`);
  console.log('Coordinates the plan does not give in numbers:\n  ' + approx.join('\n  '));
  assert.ok(Array.isArray(pairs));
});

test('look-ups: by number, by key, by area and by position', () => {
  assert.equal(pledgePlace('P08').key, 'threshing_floor');
  assert.equal(pledgePlace('threshing_floor').id, 'P08');
  assert.equal(pledgePlace('P99'), null);
  assert.equal(pledgePlace(undefined), null);
  assert.deepEqual(pledgePlacesInArea('south').map((place) => place.id), ['P08', 'P09', 'P10', 'P11', 'P12']);

  // Every surface place is found at its own centre (the smallest circle wins
  // where two share a centre: the tree, not the whole plaza).
  for (const place of surface) {
    const found = pledgePlaceAtLocal(place.x, place.z);
    assert.ok(found, place.id);
    if (place.id !== 'P02') assert.equal(found.id, place.id);
  }
  assert.equal(pledgePlaceAtLocal(0, -70).id, 'P01');
  assert.equal(pledgePlaceAtLocal(30, -90).id, 'P02'); // on the plaza, away from the tree
  assert.equal(pledgePlaceAtLocal(25 + 42, -390).id, 'P08');
  assert.equal(pledgePlaceAtLocal(25 + 43, -390), null);
  assert.equal(pledgePlaceAtLocal(-60, -300), null); // open field
  assert.equal(pledgePlaceAtLocal(NaN, 0), null);

  // Places under the valley are not on the surface unless their mouths are asked for.
  assert.equal(pledgePlaceAtLocal(-360, -400), null);
  assert.equal(pledgePlaceAtLocal(-360, -400, { mouths: true }).id, 'P44');
  assert.equal(pledgePlaceAtLocal(-6, 24, { mouths: true }), null); // the rotunda has no mouth

  // World positions are 70 m further north than local ones.
  assert.equal(PLEDGE_PLACE_Z_OFFSET, WOLFVEIL_AREA_Z_OFFSET);
  assert.equal(pledgePlaceAtWorld({ x: 0, z: 0 }).id, 'P01');
  assert.equal(pledgePlaceAtWorld({ x: -62, y: 100, z: 458 }).id, 'P35');
  assert.equal(pledgePlaceAtWorld(null), null);
});

test('the first of two coordinates is the centre; the other is kept', () => {
  assert.deepEqual([pledgePlace('P04').x, pledgePlace('P04').z, pledgePlace('P04').also], [0, -225, { x: 70, z: -210 }]);
  assert.deepEqual([pledgePlace('P07').x, pledgePlace('P07').z, pledgePlace('P07').also], [4, 220, { x: 70, z: 190 }]);
  assert.deepEqual([pledgePlace('P39').x, pledgePlace('P39').z, pledgePlace('P39').also], [150, 300, { x: 80, z: 320 }]);
  // The second coordinate of each is in the same area as the first.
  for (const id of ['P04', 'P07', 'P39']) {
    const place = pledgePlace(id);
    assert.equal(wolfveilAreaAtLocal(place.also.x, place.also.z), place.area, id);
  }
});
