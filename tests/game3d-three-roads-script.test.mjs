import test from 'node:test';
import assert from 'node:assert/strict';
import { definePledge } from '../src/components/game3d/pledges/pledgeModel.mjs';
import { pledgePlace } from '../src/components/game3d/pledges/pledgePlaces.mjs';
import { wolfveilAreaAtLocal } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import { WOLFVEIL_HOSTILE_ZONES } from '../src/components/game3d/wolfveil/WolfveilEnemySpawns.mjs';
import { WOLFVEIL_ZOMBIE_CAMPS } from '../src/components/game3d/wolfveil/WolfveilZombieCamps.mjs';
// The game's ground is wolfveilHeight plus the terraces the cave entrances install into it at
// run time. Without this import a check would pass on ground that is a cliff in the game.
import '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import { wolfveilHeight, wolfveilDistanceToRiver, WOLFVEIL_RIVER } from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import { WOLFVEIL_EXPLORABLE_CAVES, sampleWolfveilCaveSpace } from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {
  THREE_ROADS_CAST, THREE_ROADS_EMPIRES, THREE_ROADS_ROLES, THREE_ROADS_VOICES, threeRoadsPerson, threeRoadsCastAtHome,
  threeRoadsHomeOf, threeRoadsEmpireOfFaction, threeRoadsStandIn, THREE_ROADS_BUILT_AREAS,
} from '../src/components/game3d/threeroads/script/cast.mjs';
import {
  THREE_ROADS_BANDS, threeRoadsBuiltBands, threeRoadsPointArea, threeRoadsPointRegion, threeRoadsPointScene,
  threeRoadsLine, threeRoadsPoint,
} from '../src/components/game3d/threeroads/script/index.mjs';
import { BAND1_KEEPSAKES, BAND1_LINES, BAND1_STAGING } from '../src/components/game3d/threeroads/script/band1.mjs';
import { BAND3_KINDS, BAND3_LINES, BAND3_STAGING, BAND3_TOKENS } from '../src/components/game3d/threeroads/script/band3.mjs';

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
        // A monster the game cannot show yet is asked for by the kind it will become,
        // stands in as one of today's, and is named for what the story means.
        if (group.becomes !== undefined) {
          const meant = BAND3_KINDS[group.becomes];
          assert.ok(meant, `${pledge.id}: ${group.groupId} becomes a kind that is planned (${group.becomes})`);
          assert.equal(group.kind, meant.standIn, `${pledge.id}: ${group.groupId} stands in as ${meant.standIn}`);
          assert.equal(group.name, meant.name, `${pledge.id}: ${group.groupId} is named ${meant.name}`);
          if (meant.boss) assert.deepEqual([group.count, group.tier], [1, 'elite'], `${pledge.id}: ${group.groupId} is one boss`);
        }
      }
    }
  });

  test(`${band.id}: every line used exists, every line is used, every speaker is in the cast`, () => {
    const used = new Set();
    for (const staging of Object.values(band.staging)) for (const id of lineIdsIn(staging)) used.add(id);
    for (const id of used) assert.ok(band.lines[id], 'missing line ' + id);
    // A line a person hails travellers with is used by the cast table, not by a pledge.
    for (const entry of THREE_ROADS_CAST) if (entry.hail && band.lines[entry.hail]) used.add(entry.hail);
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
      assert.equal(threeRoadsPoint(name), point);
      // A point under the valley lies in a region's own scene: inside the caves' walkable
      // space, with room to stand. The surface rules do not apply to it.
      const region = threeRoadsPointRegion(band, name);
      if (region) {
        assert.ok((band.regions || []).includes(region), name + ' is in one of the band\'s regions');
        assert.equal(threeRoadsPointArea(band, name), null, name + ' has a region, not an area');
        assert.deepEqual(threeRoadsPointScene(name), { area: null, region });
        const space = sampleWolfveilCaveSpace(point.x, point.z, 0.8);
        assert.ok(space, `${name} (${point.x}, ${point.z}) is inside the caves, 0.8 m clear of the rock`);
        continue;
      }
      const expected = threeRoadsPointArea(band, name);
      assert.ok(expected, name + ' has an area rule');
      assert.ok(band.areas.includes(expected), name + ' is in one of the band\'s areas');
      assert.equal(wolfveilAreaAtLocal(point.x, point.z), expected, `${name} (${point.x}, ${point.z})`);
      assert.ok(Math.abs(point.x) <= 528 && Math.abs(point.z) <= 528, name + ' is inside the playable square');
      assert.deepEqual(threeRoadsPointScene(name), { area: expected, region: null });
    }
  });

  test(`${band.id}: every place a step names is in the places table, in one of the band's areas`, () => {
    for (const pledge of pledges) {
      for (const step of pledge.pledge.steps) {
        if (!step.placeId) continue;
        const place = pledgePlace(step.placeId);
        assert.ok(place, `${pledge.id}/${step.id}: unknown place ${step.placeId}`);
        if (place.region) {
          // A place under the valley: its scene is one of the band's regions and its mouth is in one of its areas.
          assert.ok((band.regions || []).includes(place.region), `${pledge.id}/${step.id}: ${step.placeId} is in ${place.region}`);
          assert.ok(band.areas.includes(place.mouthArea), `${pledge.id}/${step.id}: the mouth of ${step.placeId} is in ${place.mouthArea}`);
        } else assert.ok(band.areas.includes(place.area), `${pledge.id}/${step.id}: ${step.placeId} is in ${place.area}`);
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

// The story was first written from a map. On the real ground the river runs in
// a gorge and some slopes are cliffs: a point nobody can stand on stops a pledge.
const STEEPEST_WALKABLE_DEGREES = 22;
const GROUND_WAIVERS = Object.freeze({
  way_north: 'a waypoint on the steps of the main road north of the plaza',
});
function groundProblem(x, z) {
  const reach = 2;
  const slope = Math.atan(Math.hypot(
    (wolfveilHeight(x + reach, z) - wolfveilHeight(x - reach, z)) / (2 * reach),
    (wolfveilHeight(x, z + reach) - wolfveilHeight(x, z - reach)) / (2 * reach))) * 180 / Math.PI;
  if (slope > STEEPEST_WALKABLE_DEGREES) return 'a slope of ' + slope.toFixed(0) + ' degrees';
  if (wolfveilDistanceToRiver(x, z) < WOLFVEIL_RIVER.width / 2 + 3) return 'in the river';
  return null;
}

test('every story point and every home stands on ground a player can walk to', () => {
  const problems = [];
  for (const band of THREE_ROADS_BANDS) {
    for (const [name, point] of Object.entries(band.points)) {
      if (GROUND_WAIVERS[name] || threeRoadsPointRegion(band, name)) continue; // a cave point is checked against the caves
      const problem = groundProblem(point.x, point.z);
      if (problem) problems.push(name + ' (' + point.x + ', ' + point.z + '): ' + problem);
    }
  }
  for (const person of THREE_ROADS_CAST) {
    const spots = [person.home, person.homeAfter?.home, ...(person.alsoAt || [])].filter(Boolean);
    for (const spot of spots) {
      const problem = groundProblem(spot.x, spot.z);
      if (problem) problems.push(person.id + ' at (' + spot.x + ', ' + spot.z + '): ' + problem);
    }
  }
  assert.deepEqual(problems, []);
});

test("the builders' preview offers every written band, and each camp has its sentries", () => {
  assert.deepEqual(threeRoadsBuiltBands({ preview: false }).map(band => band.id), ['band1']);
  // A band the engine cannot run yet (`staged: false`) is written and checked, and offered to nobody.
  assert.deepEqual(threeRoadsBuiltBands({ preview: true }).map(band => band.id),
    THREE_ROADS_BANDS.filter(band => band.staged !== false).map(band => band.id));
  assert.deepEqual(threeRoadsBuiltBands({ preview: true }).map(band => band.id), ['band1', 'band2']);
  assert.deepEqual(THREE_ROADS_BANDS.map(band => band.id), ['band1', 'band2', 'band3']);
  for (const [area, sentries] of [['west', 2], ['east', 2], ['north', 3]]) {
    const here = threeRoadsCastAtHome({ area, includeUnbuilt: true });
    assert.equal(here.filter(person => /_picket_|_gate_/.test(person.id)).length, sentries, area);
    assert.deepEqual(threeRoadsCastAtHome({ area }), [], area + ' stays empty without the preview');
  }
});

test('every hail is a line its own speaker says, and every sentry has one', () => {
  for (const entry of THREE_ROADS_CAST) {
    if (entry.hail) {
      const said = threeRoadsLine(entry.hail);
      assert.ok(said, entry.id + ' hails with a line that exists');
      assert.equal(said.speaker, entry.id, entry.hail + ' is spoken by ' + entry.id);
      assert.ok(entry.home, entry.id + ' has a place to stand');
    }
    if (/_picket_|_gate_/.test(entry.id)) assert.ok(entry.hail, entry.id + ' speaks first');
  }
});

// The valley already has monster camps of its own. A scene where someone stands
// and speaks must not be set on top of one; a fight may be.
const QUIET_SPOTS = Object.freeze(['ravine_gate', 'ravine_chant', 'ravine_sixth', 'hall_grave', 'landing_tally', 'fort_overhear', 'fort_tent',
  // band 3: the cairn where the standard-bearer speaks, and the muster where three commanders stand
  'echo_cairn', 'muster_truce', 'muster_akitsu', 'muster_tameri', 'muster_remoria', 'jade_gate']);
test("spoken scenes keep clear of the game's own monster camps", () => {
  const spawns = WOLFVEIL_HOSTILE_ZONES.flatMap(zone => zone.locations.map(([x, z]) => ({ zone: zone.id, x, z })));
  assert.ok(spawns.length >= 10);
  for (const name of QUIET_SPOTS) {
    const point = threeRoadsPoint(name);
    assert.ok(point, name);
    for (const spawn of spawns) {
      const away = Math.hypot(point.x - spawn.x, point.z - spawn.z);
      assert.ok(away >= 18, `${name} is ${away.toFixed(1)} m from a spawn of ${spawn.zone}`);
    }
  }
});

// Ten zombie camps of fifteen stand along the Hunter's Loop, level 3 in the
// south-east rising to level 50 in the south-west. No story spot and nobody's
// home may be inside one, and a spoken scene keeps well away.
test('no story spot or home stands inside one of the zombie camps', () => {
  assert.equal(WOLFVEIL_ZOMBIE_CAMPS.length, 10);
  const spots = [];
  for (const band of THREE_ROADS_BANDS) for (const [name, point] of Object.entries(band.points))
    if (!threeRoadsPointRegion(band, name)) spots.push([name, point]); // a cave point is under the ground, not in a camp
  for (const person of THREE_ROADS_CAST) {
    for (const home of [person.home, person.homeAfter?.home, ...(person.alsoAt || [])].filter(Boolean)) spots.push([person.id, home]);
  }
  for (const [name, spot] of spots) {
    for (const camp of WOLFVEIL_ZOMBIE_CAMPS) {
      const away = Math.hypot(spot.x - camp.x, spot.z - camp.z);
      assert.ok(away >= camp.radius + 8, `${name} is ${away.toFixed(0)} m from the middle of ${camp.label} (level ${camp.level})`);
      if (QUIET_SPOTS.includes(name)) assert.ok(away >= camp.radius + 20, `${name}, a spoken scene, is ${away.toFixed(0)} m from ${camp.label}`);
    }
  }
});

// ── Band 3: the first half of the main story ──────────────────────────────

// Every cue or watch that changes with the player's empire, anywhere in a staging block.
function byEmpireIn(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { for (const entry of value) byEmpireIn(entry, found); return found; }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'sayByEmpire' || key === 'flagByEmpire') found.push([key, entry]);
    else byEmpireIn(entry, found);
  }
  return found;
}

test('whatever changes with the empire has an answer for all three and for a player of none', () => {
  for (const band of THREE_ROADS_BANDS) {
    for (const [pledgeId, staging] of Object.entries(band.staging)) {
      for (const [key, table] of byEmpireIn(staging)) {
        assert.deepEqual(Object.keys(table).sort(), ['akitsu', 'none', 'remoria', 'tameri'], `${pledgeId} ${key}`);
        if (key === 'sayByEmpire') for (const id of Object.values(table)) assert.ok(threeRoadsLine(id), `${pledgeId}: ${id}`);
      }
    }
  }
});

test('roles stand for a real person of the cast for every empire, and voices have no body', () => {
  const empires = ['akitsu', 'tameri', 'remoria', 'none'];
  assert.deepEqual(THREE_ROADS_ROLES.map(role => role.id), ['own_commander', 'rival_champion']);
  for (const role of THREE_ROADS_ROLES) {
    assert.equal(threeRoadsPerson(role.id), role);
    assert.equal(role.home, null);
    for (const empire of empires) {
      const real = THREE_ROADS_CAST.find(person => person.id === threeRoadsStandIn(role.id, empire));
      assert.ok(real, `${role.id} for ${empire}`);
      assert.equal(real.standsFor, undefined, 'a role never stands for another role');
    }
  }
  // A player answers to their own empire's commander; a player of none answers to the Truce.
  for (const empire of ['akitsu', 'tameri', 'remoria'])
    assert.equal(threeRoadsPerson(threeRoadsStandIn('own_commander', empire)).empire, empire);
  assert.equal(threeRoadsStandIn('own_commander', 'none'), 'sable_vey');
  // The rival who helps the player belongs to the empire whose keepsake they were given at the gate.
  for (const empire of ['akitsu', 'tameri', 'remoria'])
    assert.equal(threeRoadsPerson(threeRoadsStandIn('rival_champion', empire)).empire, BAND1_KEEPSAKES[empire].from);
  assert.equal(threeRoadsStandIn('sable_vey', 'akitsu'), 'sable_vey', 'an ordinary person stands for themselves');
  assert.equal(threeRoadsStandIn('nobody_at_all', 'akitsu'), 'nobody_at_all');
  for (const voice of THREE_ROADS_VOICES) {
    assert.equal(threeRoadsPerson(voice.id), voice);
    assert.equal(voice.voiceOnly, true);
    assert.equal(voice.home, null);
    assert.equal(THREE_ROADS_CAST.some(person => person.id === voice.id), false, voice.id + ' is not given a body');
  }
});

test('band 3: a line said for one empire is said by that empire\'s commander or by the right rival', () => {
  const speakerOf = id => BAND3_LINES[id].speaker;
  const check = (table, role) => {
    for (const empire of ['akitsu', 'tameri', 'remoria', 'none'])
      assert.equal(speakerOf(table[empire]), threeRoadsStandIn(role, empire), `${table[empire]} for ${empire}`);
  };
  const m05 = BAND3_STAGING.tr_m05_root_fire.steps;
  check(m05.standard.done.find(cue => cue.sayByEmpire).sayByEmpire, 'own_commander');
  check(m05.commander.done.find(cue => cue.sayByEmpire).sayByEmpire, 'own_commander');
  const m06 = BAND3_STAGING.tr_m06_the_drowned_ledger.steps;
  check(m06.commander.done.find(cue => cue.sayByEmpire).sayByEmpire, 'own_commander');
  for (const step of ['climb', 'drowned', 'tooth', 'loose'])
    check(m06[step].done.find(cue => cue.sayByEmpire).sayByEmpire, 'rival_champion');
  // The steps that are done with a role name the role, never one empire's person.
  assert.equal(m05.standard.watch.npc, 'own_commander');
  assert.equal(m05.commander.watch.npc, 'own_commander');
  assert.equal(m06.commander.watch.npc, 'own_commander');
  assert.equal(m06.hand.watch.npc, 'rival_champion');
});

test('band 3: the thing in the socket accuses a rival, and never the empire that gave the keepsake', () => {
  const empires = ['akitsu', 'tameri', 'remoria'];
  assert.deepEqual(Object.keys(BAND3_TOKENS).sort(), [...empires].sort());
  assert.equal(new Set(empires.map(id => BAND3_TOKENS[id].accuses)).size, 3, 'each empire is accused once');
  const m03 = BAND3_STAGING.tr_m03_the_first_stroke.steps.hesper.done;
  const said = m03.find(cue => cue.sayByEmpire).sayByEmpire;
  const flagged = m03.find(cue => cue.flagByEmpire).flagByEmpire;
  const stones = BAND3_STAGING.tr_m04_what_the_stones_remember.steps.wave_three.done;
  const remembered = stones.filter(cue => cue.sayByEmpire)[1].sayByEmpire;
  for (const empire of empires) {
    const token = BAND3_TOKENS[empire];
    assert.notEqual(token.accuses, empire, empire + ' does not find its own badge');
    assert.notEqual(token.accuses, BAND1_KEEPSAKES[empire].from, empire + ' owes one rival and suspects the other');
    assert.equal(flagged[empire], token.flag);
    assert.equal(token.flag, 'tr_token_' + token.accuses);
    assert.equal(said[empire], 'hesper_m03_token_' + token.accuses);
    assert.equal(remembered[empire], 'bearer_m04_token_' + empire);
  }
  // A player of no empire is told the story as Akitsu's is, as in the opening.
  assert.equal(said.none, said.akitsu);
  assert.equal(flagged.none, flagged.akitsu);
  assert.equal(remembered.none, remembered.akitsu);
});

test('band 3: each wave at the stones is one old army, and the bearer knows his own', () => {
  const steps = BAND3_STAGING.tr_m04_what_the_stones_remember.steps;
  const waves = [['wave_one', 'akitsu'], ['wave_two', 'tameri'], ['wave_three', 'remoria']];
  const armies = [steps.touch.done, steps.wave_one.done, steps.wave_two.done].map(cues => cues.find(cue => cue.spawnGroup).spawnGroup.becomes);
  assert.deepEqual(armies, ['old_soldier_akitsu', 'old_soldier_tameri', 'old_soldier_remoria']);
  for (const [step, army] of waves) {
    const table = steps[step].done.find(cue => cue.sayByEmpire).sayByEmpire;
    assert.equal(table[army], 'bearer_m04_own_' + army, `${step}: a soldier of ${army} sees his own people`);
    for (const other of ['akitsu', 'tameri', 'remoria'].filter(id => id !== army))
      assert.notEqual(table[other], table[army], `${step}: ${other} is told of an enemy`);
  }
});

test('band 3: each cave chapter keeps to its own cave, and the hall is where a player comes in', () => {
  const cave = id => WOLFVEIL_EXPLORABLE_CAVES.find(entry => entry.id === id);
  const band = THREE_ROADS_BANDS.find(entry => entry.id === 'band3');
  for (const [prefix, id] of [['grotto_', 'jade_lantern_grotto'], ['hollow_', 'whispering_root_hollow'], ['cistern_', 'sunken_inkstone_cistern']]) {
    const { chamber, mouth } = cave(id);
    const names = Object.keys(band.points).filter(name => name.startsWith(prefix));
    assert.ok(names.length >= 4, prefix);
    for (const name of names) {
      const spot = band.points[name];
      const fromRoom = Math.hypot(spot.x - chamber.x, spot.z - chamber.z);
      const fromMouth = Math.hypot(spot.x - mouth[0], spot.z - mouth[1]);
      if (name.endsWith('_hall')) assert.ok(fromMouth >= 12 && fromMouth <= 22, `${name} is in the entry hall, ${fromMouth.toFixed(0)} m in`);
      else assert.ok(fromRoom <= chamber.radius - 2.5, `${name} is ${fromRoom.toFixed(1)} m from the middle of a ${chamber.radius} m chamber`);
    }
  }
  // The mural each fight lights is the mural of the cave it is fought in.
  assert.equal(BAND3_STAGING.tr_m03_the_first_stroke.steps.hares.watch.stroke, 'jade_lantern_grotto');
  assert.equal(BAND3_STAGING.tr_m05_root_fire.steps.embers.watch.stroke, 'whispering_root_hollow');
  assert.equal(BAND3_STAGING.tr_m06_the_drowned_ledger.steps.koi.watch.stroke, 'sunken_inkstone_cistern');
});

test('band 3: the main story runs in order, each chapter opened by the one before', () => {
  const band = THREE_ROADS_BANDS.find(entry => entry.id === 'band3');
  const chapters = band.pledges.map(raw => definePledge(raw));
  assert.deepEqual(chapters.map(pledge => pledge.pledge.chapter), [3, 4, 5, 6]);
  let level = 0;
  let last = 'tr_m02_three_arrows';
  let flag = 'tr_war_open';
  for (const pledge of chapters) {
    assert.equal(pledge.pledge.line, 'main');
    assert.equal(pledge.factionId ?? null, null, pledge.id + ' is walked by all three empires');
    assert.equal(threeRoadsPerson(pledge.npcId).empire, 'valley', pledge.id + ' is asked by one of the valley\'s own');
    assert.equal(pledge.requires, last);
    assert.deepEqual(raw(pledge).storyFlagsRequired, [flag]);
    assert.ok(pledge.unlockLevel > level, pledge.id + ' opens later than the chapter before');
    level = pledge.unlockLevel;
    last = pledge.id;
    flag = raw(pledge).storyFlagsOnComplete[0];
  }
  function raw(pledge) { return band.pledges.find(entry => entry.id === pledge.id); }
});
