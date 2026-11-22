import test from 'node:test';
import assert from 'node:assert/strict';
import { definePledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import { pledgePlace } from '../src/components/game3d/pledges/pledgePlaces.mjs';
import { wolfveilAreaAtLocal } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {
  THREE_ROADS_CAST, THREE_ROADS_EMPIRES, threeRoadsPerson, threeRoadsCastAtHome, threeRoadsHomeOf,
  threeRoadsEmpireOfFaction, THREE_ROADS_BUILT_AREAS,
} from '../src/components/game3d/threeroads/script/cast.mjs';
import { THREE_ROADS_BANDS, threeRoadsBuiltBands, threeRoadsPointArea, threeRoadsLine, threeRoadsPoint }
  from '../src/components/game3d/threeroads/script/index.mjs';
import { BAND1_KEEPSAKES, BAND1_LINES, BAND1_STAGING } from '../src/components/game3d/threeroads/script/band1.mjs';

// Every line id a staging block names, wherever it sits.
function lineIdsIn(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { for (const entry of value) lineIdsIn(entry, found); return found; }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'say' && typeof entry === 'string') found.push(entry);
    else if ((key === 'offer' || key === 'complete' || key === 'lines' || key === 'sayEach') && Array.isArray(entry))
      found.push(...entry.filter(item => typeof item === 'string'));
    else if (key === 'sayByEmpire' || key === 'sayAt' || (key === 'lines' && !Array.isArray(entry)))
      for (const item of Object.values(entry)) found.push(...(Array.isArray(item) ? item : [item]));
    else lineIdsIn(entry, found);
  }
  return found;
}

// Every point name a staging block names.
function pointNamesIn(band, value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { for (const entry of value) pointNamesIn(band, entry, found); return found; }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'point' || key === 'at' || key === 'to' || key === 'from') && typeof entry === 'string') found.push(entry);
    else if ((key === 'points' || key === 'trail') && Array.isArray(entry)) found.push(...entry);
    else if (key === 'sayAt') found.push(...Object.keys(entry).filter(name => name in band.points));
    else pointNamesIn(band, entry, found);
  }
  return found;
}

const WATCH_RULES = {
  talk: watch => !!watch.npc || Array.isArray(watch.anyOf),
  go_to: watch => !!watch.point || Array.isArray(watch.trail),
  defeat: watch => typeof watch.groupId === 'string',
  use: watch => !!watch.point || Array.isArray(watch.points),
  escort: watch => Array.isArray(watch.people) && !!watch.to,
  pick_up: watch => !!watch.point || Array.isArray(watch.points),
  carry: watch => !!watch.from && !!watch.to,
  deliver: watch => !!watch.npc,
  defend: watch => !!watch.point && Array.isArray(watch.waves),
  choose: () => true,
};

const allPledgeIds = new Set();
const allLineIds = new Set();
const allPointNames = new Set();

for (const band of THREE_ROADS_BANDS) {
  const pledges = band.pledges.map(raw => definePledge(raw));

  test(`${band.id}: every pledge is valid, grants nothing, and says why and at what cost`, () => {
    assert.ok(pledges.length >= 1);
    for (const pledge of pledges) {
      assert.equal(allPledgeIds.has(pledge.id), false, pledge.id + ' is defined twice');
      allPledgeIds.add(pledge.id);
      assert.deepEqual(pledge.reward, {}, pledge.id + ' grants nothing from the browser');
      assert.equal(pledge.sequential, true);
      assert.ok(pledge.pledge.cause.length > 20 && pledge.pledge.cost.length > 20, pledge.id);
      assert.ok(pledge.priority > 112 || pledge.category === 'side', pledge.id + ' is offered before the older quests');
      if (pledge.requires) assert.ok(allPledgeIds.has(pledge.requires), pledge.id + ' requires a pledge written before it');
    }
  });

  test(`${band.id}: givers and everyone a step names are in the cast`, () => {
    for (const pledge of pledges) {
      assert.ok(threeRoadsPerson(pledge.npcId), pledge.id + ' giver ' + pledge.npcId);
      assert.equal(threeRoadsPerson(pledge.npcId).giver, true, pledge.npcId + ' can be spoken to');
      const empire = threeRoadsEmpireOfFaction(pledge.factionId);
      if (pledge.factionId) {
        assert.notEqual(empire, 'none', pledge.id + ' faction');
        assert.equal(pledge.pledge.line, empire, pledge.id + ' belongs to its empire\'s line');
        assert.equal(threeRoadsPerson(pledge.npcId).empire, empire, pledge.id + ' is asked by one of its own');
      }
    }
    for (const [pledgeId, staging] of Object.entries(band.staging)) {
      for (const [stepId, step] of Object.entries(staging.steps)) {
        const watch = step.watch || {};
        const people = [watch.npc, watch.protect, ...(watch.anyOf || []), ...(watch.people || [])].filter(Boolean);
        for (const id of people) assert.ok(threeRoadsPerson(id), `${pledgeId}/${stepId} names ${id}`);
        for (const cue of [...(step.start || []), ...(step.done || [])]) {
          const id = cue.castSpawn || cue.castDespawn || cue.castMove || cue.castFollow;
          if (id) assert.ok(threeRoadsPerson(id), `${pledgeId}/${stepId} cue names ${id}`);
        }
      }
    }
  });

  test(`${band.id}: staging covers exactly the steps of each pledge and watches each kind the right way`, () => {
    assert.deepEqual(Object.keys(band.staging).sort(), pledges.map(pledge => pledge.id).sort());
    for (const pledge of pledges) {
      const staging = band.staging[pledge.id];
      assert.ok((staging.offer || []).length >= 1, pledge.id + ' is offered with at least one line');
      assert.deepEqual(Object.keys(staging.steps), pledge.pledge.steps.map(step => step.id), pledge.id);
      for (const step of pledge.pledge.steps) {
        const watch = staging.steps[step.id].watch || {};
        assert.ok(WATCH_RULES[step.kind], `${pledge.id}/${step.id}: no watch rule for kind ${step.kind}`);
        assert.ok(WATCH_RULES[step.kind](watch), `${pledge.id}/${step.id}: kind ${step.kind} is not watched properly`);
        if (step.kind === 'defeat') assert.equal(watch.groupId, step.target, `${pledge.id}/${step.id}`);
        if (step.kind === 'talk' && watch.npc) assert.equal(watch.npc, step.target);
        if (step.kind === 'deliver') assert.equal(watch.npc, step.target);
        if (watch.distinct && watch.anyOf) assert.equal(watch.anyOf.length, step.count);
        if (watch.distinct && watch.points) assert.equal(watch.points.length, step.count);
        if (watch.trail) assert.equal(watch.trail.length, step.count);
        if (watch.sayEach) assert.equal(watch.sayEach.length, step.count, `${pledge.id}/${step.id} sayEach`);
      }
      if (staging.completeByChoice) {
        const options = pledge.pledge.choices[staging.completeByChoice.step].options.map(option => option.id);
        assert.deepEqual(Object.keys(staging.completeByChoice.lines).sort(), [...options].sort());
      }
    }
  });

  test(`${band.id}: every group a step waits for is spawned first, with the step's place`, () => {
    for (const pledge of pledges) {
      const staging = band.staging[pledge.id];
      const spawned = new Map();
      for (const step of pledge.pledge.steps) {
        const block = staging.steps[step.id];
        for (const cue of block.start || []) if (cue.spawnGroup) spawned.set(cue.spawnGroup.groupId, cue.spawnGroup);
        for (const wave of block.watch?.waves || []) spawned.set(wave.group.groupId, wave.group);
        if (step.kind === 'defeat') {
          const group = spawned.get(step.target);
          assert.ok(group, `${pledge.id}/${step.id}: ${step.target} is never spawned`);
          assert.equal(group.count, step.count, `${pledge.id}/${step.id}: as many are spawned as must be defeated`);
          // A defeat step that names a place ignores deaths reported without it.
          assert.equal(group.placeId, step.placeId, `${pledge.id}/${step.id}: the group carries the step's place`);
        }
        for (const cue of block.done || []) if (cue.spawnGroup) spawned.set(cue.spawnGroup.groupId, cue.spawnGroup);
      }
      for (const group of spawned.values()) {
        assert.ok(['ink_shade', 'old_dead', 'echo'].includes(group.kind), `${pledge.id}: kind ${group.kind} exists today`);
        assert.ok(group.count >= 1 && group.count <= 6, `${pledge.id}: ${group.groupId} is a small group`);
      }
    }
  });

  test(`${band.id}: every line used exists, every line is used, every speaker is in the cast`, () => {
    const used = new Set();
    for (const staging of Object.values(band.staging)) for (const id of lineIdsIn(staging)) used.add(id);
    for (const id of used) assert.ok(band.lines[id], 'missing line ' + id);
    for (const [id, entry] of Object.entries(band.lines)) {
      assert.equal(allLineIds.has(id), false, 'line id used in two bands: ' + id);
      allLineIds.add(id);
      assert.ok(used.has(id), 'line never spoken: ' + id);
      assert.ok(threeRoadsPerson(entry.speaker), id + ' speaker ' + entry.speaker);
      assert.ok(entry.text.length >= 3 && entry.text.length <= 260, id + ' is ' + entry.text.length + ' characters');
      assert.equal(/[—–]/.test(entry.text), false, id + ' uses a dash character a voice cannot read');
      assert.equal(/\s{2,}|^\s|\s$/.test(entry.text), false, id + ' has stray spaces');
      assert.equal(threeRoadsLine(id), entry);
    }
  });

  test(`${band.id}: every named point exists and lies in the area it should`, () => {
    const used = new Set();
    for (const staging of Object.values(band.staging)) for (const name of pointNamesIn(band, staging)) used.add(name);
    for (const name of used) assert.ok(band.points[name], 'missing point ' + name);
    for (const [name, point] of Object.entries(band.points)) {
      assert.equal(allPointNames.has(name), false, 'point name used in two bands: ' + name);
      allPointNames.add(name);
      const expected = threeRoadsPointArea(band, name);
      assert.ok(expected, name + ' has an area rule');
      assert.ok(band.areas.includes(expected), name + ' is in one of the band\'s areas');
      assert.equal(wolfveilAreaAtLocal(point.x, point.z), expected, `${name} (${point.x}, ${point.z})`);
      assert.ok(Math.abs(point.x) <= 528 && Math.abs(point.z) <= 528, name + ' is inside the playable square');
      assert.equal(threeRoadsPoint(name), point);
    }
  });

  test(`${band.id}: every place a step names is in the places table, in one of the band's areas`, () => {
    for (const pledge of pledges) {
      for (const step of pledge.pledge.steps) {
        if (!step.placeId) continue;
        const place = pledgePlace(step.placeId);
        assert.ok(place, `${pledge.id}/${step.id}: unknown place ${step.placeId}`);
        assert.ok(band.areas.includes(place.area), `${pledge.id}/${step.id}: ${step.placeId} is in ${place.area}`);
      }
    }
  });
}

test('the truce stone does not stand in the fountain basin', () => {
  const stone = threeRoadsPoint('truce_stone');
  assert.ok(Math.hypot(stone.x, stone.z + 70) > 7.5);
});

test('the cast: unique ids, known empires, every home in the area it names, never more than eight in a scene', () => {
  assert.equal(new Set(THREE_ROADS_CAST.map(entry => entry.id)).size, THREE_ROADS_CAST.length);
  for (const entry of THREE_ROADS_CAST) {
    assert.ok(THREE_ROADS_EMPIRES[entry.empire], entry.id + ' empire');
    for (const home of [entry.home, entry.homeAfter?.home, ...(entry.alsoAt || [])].filter(Boolean))
      assert.equal(wolfveilAreaAtLocal(home.x, home.z), home.area, entry.id + ' home is in ' + home.area);
    const areas = [entry.home?.area, ...(entry.alsoAt || []).map(home => home.area)].filter(Boolean);
    assert.equal(new Set(areas).size, areas.length, entry.id + ' is in each area at most once');
  }
  for (const flags of [{}, { tr_war_open: true }])
    for (const area of ['town', 'south', 'west', 'east', 'north']) {
      const here = threeRoadsCastAtHome({ area, flags, includeUnbuilt: true });
      assert.ok(here.length <= 8, `${area}: ${here.length} people at home`);
      assert.equal(new Set(here.map(entry => entry.id)).size, here.length);
      for (const entry of here) assert.equal(entry.home.area, area);
    }
});

test('the envoys leave the town when the war opens, and each goes where the story says', () => {
  const ids = (area, flags) => threeRoadsCastAtHome({ area, flags, includeUnbuilt: true }).map(entry => entry.id);
  const war = { tr_war_open: true };
  for (const id of ['mizuhara_jun', 'paneb_scribe', 'aelia_sabina']) {
    assert.ok(ids('town', {}).includes(id), id + ' is in town before the war');
    assert.equal(ids('town', war).includes(id), false, id + ' has left town after it');
  }
  assert.ok(ids('west', war).includes('mizuhara_jun'));
  assert.ok(ids('south', war).includes('paneb_scribe'));
  assert.ok(ids('north', war).includes('aelia_sabina'));
  assert.equal(ids('south', {}).includes('paneb_scribe'), false);
  // People met in two areas: the wagon masters, and Paneb at the Landing.
  assert.ok(ids('south', {}).includes('goro_sergeant') && ids('west', {}).includes('goro_sergeant'));
  assert.ok(ids('south', {}).includes('titus_oldvine') && ids('north', {}).includes('titus_oldvine'));
  assert.ok(ids('east', {}).includes('paneb_scribe') && ids('east', war).includes('paneb_scribe'));
  assert.equal(threeRoadsHomeOf(threeRoadsPerson('aelia_sabina'), war).area, 'north');
});

test('only built areas and built bands reach the game', () => {
  assert.deepEqual([...THREE_ROADS_BUILT_AREAS], ['town', 'south']);
  assert.deepEqual(threeRoadsBuiltBands().map(band => band.id), ['band1']);
  for (const band of threeRoadsBuiltBands())
    for (const area of band.areas) assert.ok(THREE_ROADS_BUILT_AREAS.includes(area), band.id + ' needs ' + area);
  assert.deepEqual(threeRoadsCastAtHome({ area: 'west' }), []);
  assert.ok(threeRoadsCastAtHome({ area: 'west', includeUnbuilt: true }).length >= 3);
  assert.ok(threeRoadsCastAtHome({ area: 'town' }).length >= 4);
});

test('factions map to empires as the story says', () => {
  assert.equal(threeRoadsEmpireOfFaction('AXE_Faction_1'), 'akitsu');
  assert.equal(threeRoadsEmpireOfFaction('AXE_Faction_2'), 'remoria');
  assert.equal(threeRoadsEmpireOfFaction('AXE_Faction_3'), 'tameri');
  assert.equal(threeRoadsEmpireOfFaction('AXE_Faction_Unassigned'), 'none');
  assert.equal(threeRoadsEmpireOfFaction(undefined), 'none');
});

test('each empire is given a keepsake by one of the other two, and all three differ', () => {
  const empires = ['akitsu', 'tameri', 'remoria'];
  assert.deepEqual(Object.keys(BAND1_KEEPSAKES).sort(), [...empires].sort());
  assert.equal(new Set(empires.map(id => BAND1_KEEPSAKES[id].from)).size, 3);
  const closing = BAND1_STAGING.tr_m01_sworn_at_the_gate.steps.lyra.done;
  const say = closing.find(cue => cue.sayByEmpire).sayByEmpire;
  const flag = closing.find(cue => cue.flagByEmpire).flagByEmpire;
  for (const id of empires) {
    const keepsake = BAND1_KEEPSAKES[id];
    assert.notEqual(keepsake.from, id);
    assert.equal(threeRoadsPerson(keepsake.giver).empire, keepsake.from);
    assert.equal(BAND1_LINES[say[id]].speaker, keepsake.giver);
    assert.equal(flag[id], keepsake.flag);
  }
});
