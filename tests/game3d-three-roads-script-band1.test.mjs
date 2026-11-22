import test from 'node:test';
import assert from 'node:assert/strict';
import { definePledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import { pledgePlace } from '../src/components/game3d/pledges/pledgePlaces.mjs';
import { wolfveilAreaAtLocal } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {
  THREE_ROADS_CAST, THREE_ROADS_EMPIRES, threeRoadsPerson, threeRoadsCastAtHome, threeRoadsHomeOf,
} from '../src/components/game3d/threeroads/script/cast.mjs';
import {
  BAND1_POINTS, BAND1_LINES, BAND1_PLEDGES, BAND1_STAGING, BAND1_KEEPSAKES,
} from '../src/components/game3d/threeroads/script/band1.mjs';

const pledges = BAND1_PLEDGES.map(raw => definePledge(raw));
const byId = new Map(pledges.map(pledge => [pledge.id, pledge]));

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
function pointNamesIn(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { for (const entry of value) pointNamesIn(entry, found); return found; }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'point' || key === 'at' || key === 'to') && typeof entry === 'string') found.push(entry);
    else if ((key === 'points' || key === 'trail') && Array.isArray(entry)) found.push(...entry);
    else if (key === 'sayAt') found.push(...Object.keys(entry).filter(name => name in BAND1_POINTS));
    else pointNamesIn(entry, found);
  }
  return found;
}

test('every pledge of the opening is a valid pledge and none carries a reward', () => {
  assert.equal(pledges.length, 4);
  assert.deepEqual(pledges.map(pledge => pledge.id), [
    'tr_m01_sworn_at_the_gate', 'tr_m02_three_arrows', 'tr_v01_lantern_count', 'tr_v16_three_fields',
  ]);
  for (const pledge of pledges) {
    assert.deepEqual(pledge.reward, {}, pledge.id + ' grants nothing from the browser');
    assert.equal(pledge.sequential, true);
    assert.ok(pledge.pledge.cause.length > 20 && pledge.pledge.cost.length > 20, pledge.id + ' says why and at what cost');
  }
});

test('the chapters chain: the second needs the first, the valley stories need the second', () => {
  assert.equal(byId.get('tr_m01_sworn_at_the_gate').requires, null);
  assert.equal(byId.get('tr_m02_three_arrows').requires, 'tr_m01_sworn_at_the_gate');
  assert.equal(byId.get('tr_v01_lantern_count').requires, 'tr_m02_three_arrows');
  assert.equal(byId.get('tr_v16_three_fields').requires, 'tr_m02_three_arrows');
  assert.ok(byId.get('tr_m01_sworn_at_the_gate').priority > 112, 'offered before the older quests of the same giver');
});

test('every giver and every person a step names is in the cast', () => {
  for (const pledge of pledges) {
    assert.ok(threeRoadsPerson(pledge.npcId), pledge.id + ' giver ' + pledge.npcId);
    assert.equal(threeRoadsPerson(pledge.npcId).giver, true);
  }
  for (const [pledgeId, staging] of Object.entries(BAND1_STAGING)) {
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

test('staging covers exactly the steps of each pledge, and watches each kind the right way', () => {
  const needs = {
    talk: watch => !!watch.npc || Array.isArray(watch.anyOf),
    go_to: watch => !!watch.point || Array.isArray(watch.trail),
    defeat: watch => typeof watch.groupId === 'string',
    use: watch => !!watch.point || Array.isArray(watch.points),
    escort: watch => Array.isArray(watch.people) && !!watch.to,
    pick_up: watch => !!watch.point || Array.isArray(watch.points),
    deliver: watch => !!watch.npc,
    defend: watch => !!watch.point && Array.isArray(watch.waves),
    choose: () => true,
  };
  assert.deepEqual(Object.keys(BAND1_STAGING).sort(), pledges.map(pledge => pledge.id).sort());
  for (const pledge of pledges) {
    const staging = BAND1_STAGING[pledge.id];
    assert.deepEqual(Object.keys(staging.steps), pledge.pledge.steps.map(step => step.id), pledge.id);
    for (const step of pledge.pledge.steps) {
      const watch = staging.steps[step.id].watch || {};
      assert.ok(needs[step.kind], `${pledge.id}/${step.id}: no watch rule for kind ${step.kind}`);
      assert.ok(needs[step.kind](watch), `${pledge.id}/${step.id}: kind ${step.kind} is not watched properly`);
      if (step.kind === 'defeat') assert.equal(watch.groupId, step.target);
      if (step.kind === 'talk' && watch.npc) assert.equal(watch.npc, step.target);
      if (step.kind === 'deliver') assert.equal(watch.npc, step.target);
      if (watch.distinct && watch.anyOf) assert.equal(watch.anyOf.length, step.count);
      if (watch.distinct && watch.points) assert.equal(watch.points.length, step.count);
      if (watch.trail) assert.equal(watch.trail.length, step.count);
      if (watch.sayEach) assert.equal(watch.sayEach.length, step.count);
    }
    if (staging.completeByChoice) {
      const options = pledge.pledge.choices[staging.completeByChoice.step].options.map(option => option.id);
      assert.deepEqual(Object.keys(staging.completeByChoice.lines).sort(), [...options].sort());
    }
  }
});

test('every group a step waits for is spawned by a cue of an earlier or the same step', () => {
  for (const pledge of pledges) {
    const staging = BAND1_STAGING[pledge.id];
    const spawned = new Set();
    for (const step of pledge.pledge.steps) {
      const block = staging.steps[step.id];
      for (const cue of block.start || []) if (cue.spawnGroup) spawned.add(cue.spawnGroup.groupId);
      for (const wave of block.watch?.waves || []) spawned.add(wave.group.groupId);
      if (step.kind === 'defeat') assert.ok(spawned.has(step.target), `${pledge.id}/${step.id}: ${step.target} is never spawned`);
      for (const cue of block.done || []) if (cue.spawnGroup) spawned.add(cue.spawnGroup.groupId);
    }
  }
});

test('every line that is used exists, every line is used, and every speaker is in the cast', () => {
  const used = new Set();
  for (const staging of Object.values(BAND1_STAGING)) for (const id of lineIdsIn(staging)) used.add(id);
  for (const id of used) assert.ok(BAND1_LINES[id], 'missing line ' + id);
  for (const [id, entry] of Object.entries(BAND1_LINES)) {
    assert.ok(used.has(id), 'line never spoken: ' + id);
    assert.ok(threeRoadsPerson(entry.speaker), id + ' speaker ' + entry.speaker);
    assert.ok(entry.text.length >= 8 && entry.text.length <= 260, id + ' is ' + entry.text.length + ' characters');
    assert.equal(/[—–]/.test(entry.text), false, id + ' uses a dash character a voice cannot read');
    assert.equal(/\s{2,}|^\s|\s$/.test(entry.text), false, id + ' has stray spaces');
  }
});

test('every named point exists and lies in the area its place is in', () => {
  const used = new Set();
  for (const staging of Object.values(BAND1_STAGING)) for (const name of pointNamesIn(staging)) used.add(name);
  for (const name of used) assert.ok(BAND1_POINTS[name], 'missing point ' + name);
  for (const [name, point] of Object.entries(BAND1_POINTS)) {
    const area = wolfveilAreaAtLocal(point.x, point.z);
    const expected = /^(floor_|woodpile|salt_store|graves_)/.test(name) ? 'south' : 'town';
    assert.equal(area, expected, `${name} (${point.x}, ${point.z}) is in ${area}`);
  }
  // The truce stone must not stand in the fountain basin (radius 6.55 at 0, -70).
  assert.ok(Math.hypot(BAND1_POINTS.truce_stone.x, BAND1_POINTS.truce_stone.z + 70) > 7.5);
});

test('every place a step names is in the places table, in the area the step happens in', () => {
  for (const pledge of pledges) {
    for (const step of pledge.pledge.steps) {
      if (!step.placeId) continue;
      const place = pledgePlace(step.placeId);
      assert.ok(place, `${pledge.id}/${step.id}: unknown place ${step.placeId}`);
      assert.ok(['town', 'south'].includes(place.area), `${pledge.id}/${step.id}: ${step.placeId} is outside the opening`);
    }
  }
});

test('the cast: unique ids, known empires, homes in the right area, and the envoys leave when the war opens', () => {
  assert.equal(new Set(THREE_ROADS_CAST.map(entry => entry.id)).size, THREE_ROADS_CAST.length);
  for (const entry of THREE_ROADS_CAST) {
    assert.ok(THREE_ROADS_EMPIRES[entry.empire], entry.id + ' empire');
    for (const home of [entry.home, entry.homeAfter?.home].filter(Boolean))
      assert.equal(wolfveilAreaAtLocal(home.x, home.z), home.area, entry.id + ' home is in ' + home.area);
  }
  const ids = list => list.map(entry => entry.id).sort();
  const before = ids(threeRoadsCastAtHome({ area: 'town' }));
  const after = ids(threeRoadsCastAtHome({ area: 'town', flags: { tr_war_open: true } }));
  for (const id of ['mizuhara_jun', 'paneb_scribe', 'aelia_sabina']) {
    assert.ok(before.includes(id), id + ' is in town before the war');
    assert.equal(after.includes(id), false, id + ' has left town after it');
  }
  const southAfter = threeRoadsCastAtHome({ area: 'south', flags: { tr_war_open: true } });
  assert.ok(southAfter.some(entry => entry.id === 'paneb_scribe' && entry.home.area === 'south'));
  assert.equal(threeRoadsCastAtHome({ area: 'south' }).some(entry => entry.id === 'paneb_scribe'), false);
  assert.equal(threeRoadsHomeOf(threeRoadsPerson('aelia_sabina'), { tr_war_open: true }), null);
  assert.ok(threeRoadsCastAtHome({ area: 'town' }).length <= 8, 'no more than eight people at home in one scene');
  assert.ok(threeRoadsCastAtHome({ area: 'south', flags: { tr_war_open: true } }).length <= 8);
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
