import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  THREE_ROADS_LANDFORMS, THREE_ROADS_LANDFORM_KINDS, THREE_ROADS_LANDFORM_CLEARANCE,
  threeRoadsLandformProblems, threeRoadsLandformReach, threeRoadsLandformBounds,
  threeRoadsLandformsInArea, threeRoadsLandformEdgePoints, threeRoadsLandformClearanceProblems,
} from '../src/components/game3d/threeroads/land/threeRoadsLandforms.mjs';
import {
  wolfveilDistanceToRiver, wolfveilAnyTrailClearance, WOLFVEIL_RIVER,
} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  wolfveilAreaAtLocal, WOLFVEIL_AREA_BORDERS,
} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';

// The points whose exact height the landscape tests pin
// (tests/game3d-clone-wolfveil-landscape-design.test.mjs, MAIN_ANCHORS).
const PINNED_ANCHORS = [
  ['market', 0, -70], ['southGate', 0, -225], ['sanctuary', 4, 220], ['palace', 0, 115],
  ['training', -165, 88], ['caveJade', -216, 76], ['caveRoot', -312, 148], ['caveCistern', -82, 312],
  ['caveCrystal', 122, 198], ['caveHub', -138, 196], ['hotSpring', -105, 330], ['vortexLake', 205, 320],
  ['waterfall', 142, 179], ['waterfallCave', 163, 155], ['lunarGate', 171, 152], ['astralGate', 197, 154],
  ['bridgeMarketW', 63, -98], ['bridgeMarketE', 134, -98], ['bridgeTimberW', 82, 35],
  ['bridgeTimberE', 146, 35], ['bridgeRopeW', 87, 205], ['bridgeRopeE', 173, 205], ['spawn', -7, -62],
];

const measure = {
  anchors: PINNED_ANCHORS,
  distanceToRiver: wolfveilDistanceToRiver,
  riverHalfWidth: WOLFVEIL_RIVER.width / 2,
  trailClearance: wolfveilAnyTrailClearance,
  areaAt: wolfveilAreaAtLocal,
  borders: WOLFVEIL_AREA_BORDERS,
};

const good = {
  pad: { id: 'fx_pad', area: 'north', kind: 'pad', x: 30, z: 330, radius: 20, falloff: 8, y: 'mean' },
  mound: { id: 'fx_mound', area: 'south', kind: 'mound', x: 20, z: -500, radius: 9, height: 4, falloff: 6 },
  cut: { id: 'fx_cut', area: 'west', kind: 'cut', x: -450, z: -450, radius: 12, depth: 3, falloff: 6 },
  bank: { id: 'fx_bank', area: 'north', kind: 'bank', x: 30, z: 330, radius: 30, width: 4, height: 1.5 },
  ramp: { id: 'fx_ramp', area: 'east', kind: 'ramp', ax: 340, az: -380, bx: 350, bz: -400, width: 5, falloff: 3 },
};

test('the data module imports nothing, so the height chain can read it without a cycle', () => {
  const source = readFileSync(
    new globalThis.URL('../src/components/game3d/threeroads/land/threeRoadsLandforms.mjs', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(source), false);
  assert.equal(/\brequire\(/.test(source), false);
});

test('the shipped list is frozen, every entry in it is valid, and ids are unique', () => {
  assert.ok(Object.isFrozen(THREE_ROADS_LANDFORMS));
  const ids = new Set();
  for (const entry of THREE_ROADS_LANDFORMS) {
    assert.deepEqual(threeRoadsLandformProblems(entry), [], entry.id);
    assert.equal(ids.has(entry.id), false, entry.id + ' twice');
    ids.add(entry.id);
    assert.ok(Object.isFrozen(entry), entry.id + ' is frozen');
  }
});

test('every shipped landform keeps the 40 m rule against the real terrain', () => {
  assert.equal(THREE_ROADS_LANDFORM_CLEARANCE, 40);
  for (const entry of THREE_ROADS_LANDFORMS)
    assert.deepEqual(threeRoadsLandformClearanceProblems(entry, measure), [], entry.id);
});

test('each of the five kinds can be written, and a wrong one says what is wrong', () => {
  assert.deepEqual(Object.keys(good).sort(), [...THREE_ROADS_LANDFORM_KINDS].sort());
  for (const entry of Object.values(good)) assert.deepEqual(threeRoadsLandformProblems(entry), [], entry.id);
  assert.ok(threeRoadsLandformProblems(null).length);
  assert.ok(threeRoadsLandformProblems({ ...good.pad, id: 'Bad Id' }).some(text => /id/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.pad, area: 'moon' }).some(text => /area/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.pad, kind: 'lake' }).some(text => /kind/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.pad, y: 'flat' }).some(text => /pad needs y/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.pad, x: 900 }).some(text => /inside the playable square/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.pad, radius: 0 }).some(text => /radius/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.mound, height: -1 }).some(text => /mound/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.cut, depth: 99 }).some(text => /cut/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.bank, height: 0 }).some(text => /bank/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.ramp, bx: good.ramp.ax, bz: good.ramp.az }).some(text => /two different ends/.test(text)));
  assert.ok(threeRoadsLandformProblems({ ...good.pad, near: 'river' }).some(text => /near/.test(text)));
});

test('reach, bounds and edge points describe where a landform changes the ground', () => {
  assert.equal(threeRoadsLandformReach(good.pad), 28);
  assert.equal(threeRoadsLandformReach(good.bank), 32);
  assert.equal(threeRoadsLandformReach(good.ramp), 5.5);
  assert.deepEqual(threeRoadsLandformBounds(good.pad), { minX: 2, maxX: 58, minZ: 302, maxZ: 358 });
  const ramp = threeRoadsLandformBounds(good.ramp);
  assert.deepEqual(ramp, { minX: 334.5, maxX: 355.5, minZ: -405.5, maxZ: -374.5 });
  for (const entry of Object.values(good)) {
    const bounds = threeRoadsLandformBounds(entry);
    for (const [x, z] of threeRoadsLandformEdgePoints(entry)) {
      assert.ok(x >= bounds.minX - 1e-6 && x <= bounds.maxX + 1e-6, entry.id);
      assert.ok(z >= bounds.minZ - 1e-6 && z <= bounds.maxZ + 1e-6, entry.id);
    }
  }
  assert.deepEqual(threeRoadsLandformsInArea('north', Object.values(good)).map(entry => entry.id), ['fx_pad', 'fx_bank']);
  assert.deepEqual(threeRoadsLandformsInArea('town'), []);
});

test('the 40 m rule catches an anchor, the river, a trail and a border, and `near` waives only what it names', () => {
  const atMarket = { id: 'fx_market', area: 'town', kind: 'pad', x: 10, z: -60, radius: 10, falloff: 4, y: 'mean' };
  assert.ok(threeRoadsLandformClearanceProblems(atMarket, measure).some(text => /pinned anchor "market"/.test(text)));
  assert.ok(threeRoadsLandformClearanceProblems(atMarket, measure).some(text => /pinned anchor "spawn"/.test(text)));
  const waived = threeRoadsLandformClearanceProblems({ ...atMarket, near: ['anchor:market'] }, measure);
  assert.equal(waived.some(text => /"market"/.test(text)), false);
  assert.ok(waived.some(text => /"spawn"/.test(text)));

  const onRiver = { id: 'fx_river', area: 'east', kind: 'cut', x: 200, z: -300, radius: 10, depth: 2, falloff: 4 };
  const riverProblems = threeRoadsLandformClearanceProblems(onRiver, measure);
  assert.ok(riverProblems.some(text => /the river/.test(text)), riverProblems.join('; '));
  assert.equal(threeRoadsLandformClearanceProblems({ ...onRiver, near: ['river'] }, measure).some(text => /the river/.test(text)), false);

  const onRoad = { id: 'fx_road', area: 'town', kind: 'mound', x: 0, z: 20, radius: 8, height: 2, falloff: 4 };
  assert.ok(threeRoadsLandformClearanceProblems(onRoad, measure).some(text => /road or trail/.test(text)));

  const onBorder = { id: 'fx_border', area: 'west', kind: 'pad', x: -205, z: -400, radius: 20, falloff: 4, y: 'mean' };
  const borderProblems = threeRoadsLandformClearanceProblems(onBorder, measure);
  assert.ok(borderProblems.some(text => /crosses out of the west area|area border/.test(text)), borderProblems.join('; '));
});

test('preview: how the camps planned for band 2 stand against the 40 m rule today', t => {
  // Not a pass or fail: a report, so the entries can be written with the right `near` when band 2 starts.
  const planned = [
    { id: 'north_fort_pad', area: 'north', kind: 'pad', x: 30, z: 330, radius: 45, falloff: 10, y: 'mean' },
    { id: 'east_landing_pad', area: 'east', kind: 'pad', x: 350, z: -410, radius: 40, falloff: 10, y: 'mean' },
    { id: 'west_camp_pad', area: 'west', kind: 'pad', x: -297, z: -136, radius: 25, falloff: 8, y: 'mean' },
    { id: 'west_hall_pad', area: 'west', kind: 'pad', x: -235, z: -60, radius: 10, falloff: 5, y: 'mean' },
    { id: 'south_barrow_mound', area: 'south', kind: 'mound', x: 20, z: -500, radius: 9, height: 4, falloff: 6 },
  ];
  for (const entry of planned) {
    assert.deepEqual(threeRoadsLandformProblems(entry), [], entry.id);
    const problems = threeRoadsLandformClearanceProblems(entry, measure);
    t.diagnostic(`${entry.id}: ${problems.length ? problems.join('; ') : 'clear'}`);
  }
});
