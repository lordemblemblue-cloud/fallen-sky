import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { QUEST_TEST_DESTINATIONS, questTestDestination } from '../src/components/game3d/threeroads/questTestDestinations.mjs';
import { placeAnchorWorld } from '../src/components/game3d/threeroads/places/layouts/index.mjs';
import { findQuestTestSafeLanding } from '../src/components/game3d/threeroads/questTestSafeLanding.mjs';
import { campPlan } from '../src/components/game3d/threeroads/land/campPlans.mjs';
import { wolfveilAreaAtWorld } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {
  setQuestTestRuntimePreview, questTestRuntimeActive,
  setQuestTestCheckpointHold, questTestCheckpointSuppressed, endQuestTestRuntime,
} from '../src/components/game3d/threeroads/questTestRuntime.mjs';
import { threeRoadsEnabled, threeRoadsPreviewEnabled } from '../src/components/game3d/threeroads/threeRoadsFlag.mjs';

const source = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
const fakeWindow = () => ({
  location: { search: '' },
  localStorage: { getItem: () => null },
});

test('five admin Quest Test destinations match actual Wolfveil story layouts', () => {
  assert.deepEqual(QUEST_TEST_DESTINATIONS.map(d => [d.id, d.area, d.preview]), [
    ['oath-tree', 'town', false],
    ['gate-fields', 'south', false],
    ['western_road_camp', 'west', true],
    ['the_landing', 'east', true],
    ['castra_lupa', 'north', true],
  ]);
  assert.equal(new Set(QUEST_TEST_DESTINATIONS.map(d => d.id)).size, 5);
  assert.equal(questTestDestination('unknown'), null);
  const tree = placeAnchorWorld('P01', 'tree');
  const field = placeAnchorWorld('P08', 'centre');
  assert.deepEqual(
    [questTestDestination('oath-tree').x, questTestDestination('oath-tree').z],
    [tree.x, tree.z],
  );
  assert.deepEqual(
    [questTestDestination('gate-fields').x, questTestDestination('gate-fields').z],
    [field.x, field.z],
  );
  for (const id of ['western_road_camp', 'the_landing', 'castra_lupa']) {
    const destination = questTestDestination(id);
    const plan = campPlan(id);
    assert.ok(plan, `existing camp plan ${id}`);
    assert.equal(destination.x, plan.centre.x);
    assert.equal(destination.z, plan.centre.z + 70);
  }
  for (const destination of QUEST_TEST_DESTINATIONS) {
    assert.ok(Number.isFinite(destination.x) && Number.isFinite(destination.z));
    assert.equal(wolfveilAreaAtWorld(destination), destination.area);
    assert.ok(Object.isFrozen(destination));
  }
});

test('test warps probe safe ground around unfinished camp footprints', () => {
  const destination = questTestDestination('the_landing');
  const probes = [];
  const safe = findQuestTestSafeLanding({ ...destination, questTest: true }, {
    area: destination.area,
    sampleGroundY: () => 100,
    isBlocked: () => false,
    findSafe: value => {
      probes.push(value);
      if (value.includes(`X ${destination.x + 2.5}, Z ${destination.z}`)) {
        return { id: 'test-safe', x: destination.x + 2.5, y: 100, z: destination.z };
      }
      return null;
    },
  });
  assert.ok(probes.length >= 3, 'centre and nearby candidates are checked');
  assert.equal(safe?.x, destination.x + 2.5);
  const wrongArea = findQuestTestSafeLanding({ ...destination, questTest: true }, {
    area: 'north', sampleGroundY: () => 100, isBlocked: () => false,
    findSafe: () => { throw Error('must not test the wrong streamed area'); },
  });
  assert.equal(wrongArea, null);
  assert.equal(findQuestTestSafeLanding(null, {}), null);
});

test('preview flag is ephemeral and disabled for normal players', () => {
  endQuestTestRuntime();
  const win = fakeWindow();
  assert.equal(threeRoadsEnabled(win), false);
  assert.equal(threeRoadsPreviewEnabled(win), false);
  setQuestTestRuntimePreview(false);
  assert.equal(threeRoadsEnabled(win), true);
  assert.equal(threeRoadsPreviewEnabled(win), false);
  setQuestTestRuntimePreview(true);
  assert.equal(threeRoadsEnabled(win), true);
  assert.equal(threeRoadsPreviewEnabled(win), true);
  endQuestTestRuntime();
  assert.equal(threeRoadsEnabled(win), false);
  assert.equal(questTestRuntimeActive(), false);
});

test('checkpoint suppression lasts through the return scene handoff', () => {
  endQuestTestRuntime();
  setQuestTestCheckpointHold(true);
  setQuestTestRuntimePreview(true);
  assert.equal(questTestCheckpointSuppressed(), true);
  setQuestTestRuntimePreview(null);
  assert.equal(threeRoadsEnabled(fakeWindow()), false, 'normal scene flags restored on return');
  assert.equal(questTestCheckpointSuppressed(), true, 'old scene still cannot save over original');
  assert.equal(questTestRuntimeActive(), true, 'return indicator remains until actor ready');
  endQuestTestRuntime();
  assert.equal(questTestCheckpointSuppressed(), false);
});

test('Quest Test is admin-gated, can remount same area, preserves and restores saved location', () => {
  const hud = source('components/game3d/WorldEnvironmentHUD.jsx');
  const page = source('pages/GameView.jsx');
  const world = source('components/game3d/GameWorld3D.jsx');
  assert.match(hud, /adminTools && questTestOpen/);
  assert.match(hud, /QUEST TEST · TELEPORT/);
  assert.match(hud, /QUEST_TEST_DESTINATIONS\.map/);
  assert.match(hud, /Return to previous position/);
  assert.match(page, /phase !== 'world' \|\| user\?\.role !== 'admin'/);
  assert.match(page, /game3dQuestTestTravel/);
  assert.match(page, /game3dCheckpointFlush/);
  assert.match(page, /worldCheckpointStore\.read\(\)/);
  assert.match(page, /setWorldEntryCycle\(cycle => cycle \+ 1\)/);
  assert.match(page, /game3dWorldAvatarReady/);
  assert.match(page, /setQuestTestCheckpointHold\(true\)/);
  assert.match(page, /endQuestTestRuntime\(\)/);
  assert.match(world, /if \(questTestCheckpointSuppressed\(\)\) return;/);
  assert.match(world, /findWorkflowSpawn\(/);
  assert.match(world, /findQuestTestSafeLanding\(/);
  assert.match(page, /questTest: true/);
  assert.match(world, /adminTools=\{workflowAllowed && !entryMode\}/);
  assert.doesNotMatch(page, /sessionStorage\.setItem\('game3d\.questTest\.active'/);
  assert.doesNotMatch(page, /localStorage\.setItem\('game3d\.threeRoads'/);
});
