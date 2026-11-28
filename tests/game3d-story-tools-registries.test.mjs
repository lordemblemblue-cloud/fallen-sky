// The story tools with no story registered, which is how the game ships since the War of
// Three Roads was retired (2026-11-27), and the four registries a story fills.
// This file must not import the sample story's install module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setStoryFrame, storyFrame } from '../src/components/game3d/threeroads/storyFrame.mjs';
import { localToWorld, storyZOffset, worldToLocal } from '../src/components/game3d/threeroads/coords.mjs';
import * as bands from '../src/components/game3d/threeroads/script/index.mjs';
import * as cast from '../src/components/game3d/threeroads/script/cast.mjs';
import * as places from '../src/components/game3d/threeroads/places/layouts/index.mjs';
import { threeRoadsPledge, threeRoadsPledges, pledgeLine, pledgeStaging } from '../src/components/game3d/threeroads/pledgeworld/pledgeScript.mjs';
import { QUEST_TEST_DESTINATIONS, questTestDestination } from '../src/components/game3d/threeroads/questTestDestinations.mjs';
import { CAST_MODELS } from '../src/components/game3d/threeroads/cast/castModels.mjs';
import { castAreas } from '../src/components/game3d/threeroads/cast/castSubsystem.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('with no story registered there are no bands, people, places, pledges or admin destinations', () => {
  assert.deepEqual([...bands.THREE_ROADS_BANDS], []);
  assert.deepEqual(bands.threeRoadsBuiltBands({ preview: true }), []);
  assert.equal(bands.threeRoadsLine('lyra_m01_01'), null);
  assert.equal(bands.threeRoadsPoint('oath_tree'), null);
  assert.equal(bands.threeRoadsPointScene('oath_tree'), null);
  assert.deepEqual([...cast.THREE_ROADS_CAST], []);
  assert.deepEqual([...cast.THREE_ROADS_VOICES], []);
  assert.deepEqual([...cast.THREE_ROADS_ROLES], []);
  assert.deepEqual([...cast.THREE_ROADS_BUILT_AREAS], []);
  assert.equal(cast.threeRoadsPerson('sable_vey'), null);
  assert.equal(cast.threeRoadsStandIn('own_commander', 'akitsu'), 'own_commander');
  assert.deepEqual(cast.threeRoadsCastAtHome({ area: 'town', includeUnbuilt: true }), []);
  assert.deepEqual(castAreas(), []);
  assert.deepEqual([...places.THREE_ROADS_PLACES], []);
  assert.equal(places.placeLayout('P01'), null);
  assert.equal(places.placeAnchorWorld('P01', 'tree'), null);
  assert.deepEqual(threeRoadsPledges(true), []);
  assert.deepEqual(threeRoadsPledges(false), []);
  assert.equal(threeRoadsPledge('tr_m01_sworn_at_the_gate'), null);
  assert.equal(pledgeStaging('tr_m01_sworn_at_the_gate'), null);
  assert.equal(pledgeLine('lyra_m01_01').missing, true);
  assert.deepEqual([...QUEST_TEST_DESTINATIONS], []);
  assert.equal(questTestDestination('oath-tree'), null);
});

test('the neutral frame switches the tools on nowhere and leaves coordinates alone', () => {
  const frame = storyFrame();
  assert.deepEqual([...frame.regions], []);
  assert.equal(frame.zOffset, 0);
  assert.equal(frame.areaAtWorld({ x: 0, z: 0 }), null);
  assert.deepEqual([...frame.areaIds], []);
  assert.deepEqual({ ...frame.giverSpots }, {});
  assert.equal(storyZOffset(), 0);
  assert.deepEqual(localToWorld(3, 4), { x: 3, z: 4 });
  assert.deepEqual(worldToLocal(3, 4), { x: 3, z: 4 });
});

test('the sides of the three nations and the eight people with models of their own are kept', () => {
  assert.deepEqual(Object.keys(cast.THREE_ROADS_EMPIRES).sort(), ['akitsu', 'remoria', 'tameri', 'valley']);
  assert.equal(cast.threeRoadsEmpireOfFaction('AXE_Faction_1'), 'akitsu');
  assert.equal(cast.threeRoadsEmpireOfFaction('nobody'), 'none');
  const own = Object.keys(CAST_MODELS).sort();
  assert.equal(own.length, 8);
  for (const id of own) assert.ok(existsSync(join(root, 'public', 'game3d', 'threeroads', 'cast', id + '.glb')), id + '.glb');
  for (const kit of ['valley', 'akitsu', 'tameri', 'remoria'])
    assert.ok(existsSync(join(root, 'public', 'game3d', 'threeroads', 'kits', kit + '.glb')), kit + '.glb');
});

test('the retired story is not in src: its scripts, camps and places table are gone from the game', () => {
  const gone = [
    'src/components/game3d/threeroads/script/band1.mjs',
    'src/components/game3d/threeroads/script/band2.mjs',
    'src/components/game3d/threeroads/script/band3.mjs',
    'src/components/game3d/threeroads/land/campPlans.mjs',
    'src/components/game3d/threeroads/land/threeRoadsLandforms.mjs',
    'src/components/game3d/threeroads/places/layouts/town.mjs',
    'src/components/game3d/threeroads/places/layouts/south.mjs',
    'src/components/game3d/threeroads/places/layouts/camps.mjs',
    'src/components/game3d/pledges/pledgePlaces.mjs',
  ];
  for (const file of gone) assert.equal(existsSync(join(root, file)), false, file);
});

test('a story fills the four registries, and can take itself out again', () => {
  const point = Object.freeze({ x: 5, z: 7 });
  const said = Object.freeze({ speaker: 'guide', text: 'This way.' });
  const band = Object.freeze({
    id: 'sample', built: true, title: 'A sample', areas: Object.freeze(['here']),
    points: Object.freeze({ gate: point }), pointAreas: Object.freeze({ gate: 'here' }), defaultPointArea: null,
    lines: Object.freeze({ guide_01: said }), pledges: Object.freeze([]), staging: Object.freeze({}),
  });
  const held = Object.freeze({ id: 'held', built: false, staged: false, title: 'Held', areas: [], points: {}, lines: {}, pledges: [], staging: {} });
  try {
    bands.setStoryBands([band, held]);
    assert.deepEqual(bands.threeRoadsBuiltBands().map(entry => entry.id), ['sample']);
    assert.deepEqual(bands.threeRoadsBuiltBands({ preview: true }).map(entry => entry.id), ['sample'], 'a held band is offered to nobody');
    assert.equal(bands.threeRoadsPoint('gate'), point);
    assert.deepEqual(bands.threeRoadsPointScene('gate'), { area: 'here', region: null });
    assert.equal(bands.threeRoadsLine('guide_01'), said);
    assert.equal(pledgeLine('guide_01').text, 'This way.');

    cast.setStoryCast({
      cast: [cast.storyPerson({ id: 'guide', name: 'A guide', empire: 'valley', home: { area: 'here', x: 1, z: 2, facing: 0 } })],
      roles: [cast.storyPerson({ id: 'leader', name: 'Your leader', empire: 'valley', standsFor: { akitsu: 'guide', none: 'guide' } })],
      builtAreas: ['here'],
    });
    assert.equal(cast.threeRoadsPerson('guide').name, 'A guide');
    assert.equal(cast.threeRoadsStandIn('leader', 'tameri'), 'guide');
    assert.deepEqual(cast.threeRoadsCastAtHome({ area: 'here' }).map(entry => entry.id), ['guide']);
    assert.deepEqual(castAreas(), ['here']);
    assert.equal(pledgeLine('guide_01').speakerName, 'A guide');

    places.setStoryPlaces([{ id: 'X1', x: 10, z: 20, anchors: { door: { x: 1, z: 2 } } }]);
    setStoryFrame({ regions: ['somewhere'], zOffset: 100, areaAtWorld: () => 'here', areaIds: ['here'] });
    assert.deepEqual(places.placeAnchorLocal('X1', 'door'), { x: 11, z: 22, facing: 0 });
    assert.deepEqual(places.placeAnchorWorld('X1', 'door'), { x: 11, z: 122, facing: 0 });
    assert.deepEqual(localToWorld(1, 2), { x: 1, z: 102 });
    assert.equal(storyFrame().areaAtWorld({ x: 0, z: 0 }), 'here');
    assert.deepEqual({ ...storyFrame().giverSpots }, {}, 'a field the story leaves out keeps its neutral value');
  } finally {
    bands.setStoryBands([]);
    cast.setStoryCast();
    places.setStoryPlaces([]);
    setStoryFrame(null);
  }
  assert.deepEqual([...bands.THREE_ROADS_BANDS], []);
  assert.equal(cast.threeRoadsPerson('guide'), null);
  assert.equal(places.placeLayout('X1'), null);
  assert.equal(storyZOffset(), 0);
  assert.equal(pledgeLine('guide_01').missing, true);
});
