import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AXE_SERVICE_GROUPS } from '../src/components/game3d/axe/services/AXEServiceGroups.js';
import { summonAXEServiceStation } from '../src/components/game3d/axe/services/world/AXEServiceStationStore.js';
import { runBlacksmithAutoBatch } from '../src/components/game3d/axe/services/AXEBlacksmithAutoForge.js';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const services='src/components/game3d/axe/services/';
const world=services+'world/';

test('Blacksmith opens directly as a UI panel, never a physical shared workstation', async () => {
  assert.equal(AXE_SERVICE_GROUPS.find(item => item.id === 'blacksmith')?.presentation, 'panel');
  const result = await summonAXEServiceStation('blacksmith');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BLACKSMITH_STATION_REMOVED');
  const runtime=source(world+'AXEServiceStationRuntime.js');
  const stationStore=source(world+'AXEServiceStationStore.js');
  assert.match(runtime,/s.groupId !== 'blacksmith'/);
  assert.match(stationStore,/s.groupId !== 'blacksmith'/);
  assert.match(stationStore,/if \(!station \|\| station.groupId === 'blacksmith'\) return;/);
  assert.match(stationStore,/station.groupId === 'blacksmith'/);
});

test('forge uses two ingredient squares with one plus sign, not an equals/result slot', () => {
  const ui=source(services+'AXEBlacksmithWorkflowPanel.jsx');
  assert.match(ui,/data-blacksmith-two-slot="true"/);
  assert.match(ui,/className="axe-forge-flow"/);
  assert.match(ui,/data-ingredient="materials"/);
  assert.match(ui,/className="axe-forge-ingredient-plus"/);
  assert.doesNotMatch(ui,/axe-forge-flow-result/);
  assert.match(ui,/axe-forge-mode-boxes/); // screenshot restores the left forge mode buttons
  assert.match(ui,/className="axe-forge-primary-action"/);
  assert.match(ui,/onClick=\{onForge\}/);
});

test('operation buttons form icon-only vertical rail and inventory retains original width', () => {
  const workspace=source(services+'AXEBlacksmithImageWorkspace.jsx');
  const css=source(services+'AXEBlacksmithImageWorkspace.css');
  assert.match(workspace,/aria-label=\{label\} aria-pressed=\{tab === id\}/);
  assert.match(workspace,/<span>\{label\}<\/span>/); // visible labels restored in horizontal tab bar
  assert.match(css,/width:28\.8%/);
  assert.match(css,/flex-direction:column/);
  assert.match(css,/left:34%/);
  assert.match(css,/left:40%/);
  assert.match(css,/display:none!important/);
});

function mockAuto({initial=0,target=20,chance=1,threshold=0.5,resources=100}={}) {
  let progress=initial,charged=0,attempts=0,materials=resources;
  const context={
    mode:'reinforcement',targetId:'owned_sword',
    getTarget:id=>({instanceId:id,locked:false,vanityOnly:false}),
    getDonors:()=>[],
    getPreview:()=>({canAdvance:true,chance,cost:{mat_reinforce:1}}),
    getResourceCount:()=>materials,
    getIdentity:()=> 'character:1',cancelled:()=>false,
    onAttempt:()=>{},
    transact:async()=>{attempts++;progress+=5;materials--;charged++;return {ok:true,outcome:'success'};},
    minSuccess:threshold,
    targetProgress:target,
    getProgress:()=>progress,
    maxAttempts:12,
  };
  return {context,info:()=>({progress,charged,attempts,materials})};
}

test('auto enchanting stops exactly on selected target without overspending', async () => {
  const mock=mockAuto({initial:5,target:20});
  const done=await runBlacksmithAutoBatch(mock.context);
  assert.equal(done.reason,'target_reached');
  assert.equal(done.attempts,3);
  assert.equal(done.successes,3);
  assert.deepEqual(mock.info(),{progress:20,charged:3,attempts:3,materials:97});
});

test('already met target never spends material or calls transaction', async () => {
  const mock=mockAuto({initial:100,target:50});
  const done=await runBlacksmithAutoBatch(mock.context);
  assert.equal(done.reason,'target_reached');
  assert.equal(done.attempts,0);
  assert.equal(mock.info().charged,0);
});

test('auto forging remains explicitly bounded and respects safety threshold', async () => {
  const limited=mockAuto({initial:0,target:200});
  const result=await runBlacksmithAutoBatch(limited.context);
  assert.equal(result.reason,'attempt_limit');
  assert.equal(result.attempts,12);
  assert.equal(limited.info().progress,60);
  const risky=mockAuto({initial:0,target:50,chance:0.4,threshold:0.9});
  const failed=await runBlacksmithAutoBatch(risky.context);
  assert.equal(failed.reason,'risk_threshold');
  assert.equal(failed.attempts,0);
  assert.equal(risky.info().charged,0);
});

test('Blacksmith targets and confirmation stay in UI; authoritative gateway remains transaction writer', () => {
  const workspace=source(services+'AXEBlacksmithImageWorkspace.jsx');
  const helper=source(services+'AXEBlacksmithAutoForge.js');
  const ui=source(services+'AXEBlacksmithWorkflowPanel.jsx');
  assert.match(workspace,/getProgress: \(mode, id\)/);
  assert.match(workspace,/targetProgress: autoTarget/);
  assert.match(workspace,/executeAXEServiceTransaction\(operation, payload\)/);
  assert.match(helper,/reason = 'target_reached'/);
  assert.match(ui,/Automatic forge target/);
  assert.match(ui,/Confirm Auto-Forge/);
  assert.match(ui,/onClick=\{onCancelBatch\}/);
});
