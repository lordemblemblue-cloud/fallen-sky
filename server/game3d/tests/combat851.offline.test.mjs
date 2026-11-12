import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {OFFLINE_GAME3D_SUITES_851,verifyGame3DEntryPoint851,buildGame3DOfflineChildEnv851} from '../tools/verifyCombatQuest851.mjs';
import {evaluateGame3DNodeTap847} from '../privatePgTapSummary847.mjs';

const runner=fileURLToPath(new URL('../tools/verifyCombatQuest851.mjs',import.meta.url));
const call=args=>spawnSync(process.execPath,[runner,...args],{
 encoding:'utf8',timeout:5000});
test('85.1 lists all thirty-one original source regressions without claiming DB readiness',()=>{
 const response=call(['--list']);assert.equal(response.status,0);
 const info=JSON.parse(response.stdout);
 assert.equal(info.databaseVerified,false);
 assert.equal(info.liveGameVerified,false);
 assert.equal(info.productionReady,false);
 assert.deepEqual(info.requiredSuites,OFFLINE_GAME3D_SUITES_851);
 assert.equal(info.requiredSuites.length,31);
 assert.equal(new Set(info.requiredSuites).size,31,
  'combining pending admission and scheduler suites must never duplicate entries');
 for(const required of [
  'combat868.admission-shutdown.test.mjs',
  'combat869.scheduler-shutdown.test.mjs',
  'combat870.combined-shutdown.test.mjs',
  'combat871.monotonic-clock.test.mjs',
  'combat872.lease-snapshot.test.mjs',
  'combat873.post-input-lease.test.mjs',
 ])assert.ok(info.requiredSuites.includes(required),
  'original merged-source suite was dropped: '+required);
});
test('85.1 documents source-only verification without running tests',()=>{
 const response=call(['--help']);assert.equal(response.status,0);
 assert.match(response.stdout,/Never reports real PG or live readiness/);
});
test('85.1 rejects unknown CLI arguments',()=>{
 const response=call(['--pretend-success']);assert.equal(response.status,1);
 assert.match(response.stderr,/unrecognized argument/);
});
test('85.1 detects accidental private preview mounting in live entrypoint',()=>{
 assert.equal(verifyGame3DEntryPoint851("import './privateCombatQuestStaging850.mjs'").reason,
  'unexpected_live_private_preview_mount');
 assert.equal(verifyGame3DEntryPoint851("import './privateQuestbookPreviewTransport850.mjs'").ok,false);
 assert.equal(verifyGame3DEntryPoint851("import server from './gateway.mjs'").ok,true);
 assert.equal(verifyGame3DEntryPoint851(null).ok,false);
});


test('95.0 prevents accidental live imports of private combat authority',()=>{
 for(const name of [
  'privateCombatQuestScheduler844.mjs',
  'privateCombatQuestAdmission845.mjs',
  'privateCombatQuestStaging846.mjs',
  'privateCombatQuestStaging848.mjs',
  'privateCombatQuestStaging849.mjs',
  'privateCombatQuestStaging850.mjs',
  'privateQuestbookPreviewTransport850.mjs',
 ]){
  for(const liveSource of [
   "import './"+name+"'",
   "import { unsafe } from './"+name+"'",
   "const load = () => import('./"+name+"')",
  ])assert.equal(verifyGame3DEntryPoint851(liveSource).reason,
   'unexpected_live_private_preview_mount',name+' must not mount in live entrypoint');
 }
});
test('95.0 live duel entrypoint remains allowed without private staging mounts',()=>{
 const ordinary="import { createGame3DDuelGateway } from './gateway.mjs'";
 assert.equal(verifyGame3DEntryPoint851(ordinary).ok,true);
 assert.equal(verifyGame3DEntryPoint851(ordinary+"\nimport('./privateCombatQuestScheduler844.mjs')").ok,false);
 assert.equal(verifyGame3DEntryPoint851(ordinary+"\nimport('./privateCombatQuestAdmission845.mjs')").ok,false);
 assert.equal(verifyGame3DEntryPoint851(null).reason,'unreadable_game3d_entrypoint');
});

test('85.1 isolates original source test children from outer native Node test context',()=>{
 const parent={
  NODE_TEST_CONTEXT:'child-v8',
  GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850:'true',
  AXE_OFFLINE_TEST_MARKER:'retained',
 };
 const env=buildGame3DOfflineChildEnv851(parent);
 assert.equal(Object.hasOwn(env,'NODE_TEST_CONTEXT'),false);
 assert.equal(env.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850,'');
 assert.equal(env.AXE_OFFLINE_TEST_MARKER,'retained');
 assert.equal(parent.NODE_TEST_CONTEXT,'child-v8','must not mutate caller env');
 assert.equal(parent.GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850,'true');
});

test('85.1 native child runner executes the original 84.7 TAP suite inside a Node test',()=>{
 const suite=fileURLToPath(new URL('./combat847.tap.test.mjs',import.meta.url));
 // Force the exact leaked value even if a test launcher changes its setup.
 const env=buildGame3DOfflineChildEnv851({...process.env,NODE_TEST_CONTEXT:'child-v8'});
 const child=spawnSync(process.execPath,['--test','--test-reporter=tap',suite],{
  encoding:'utf8',timeout:12000,maxBuffer:1024*1024,env,
 });
 assert.equal(child.status,0,child.stderr||String(child.error||''));
 const verdict=evaluateGame3DNodeTap847({
  output:child.stdout??'',exitCode:child.status,
  signal:child.signal,error:child.error,
 });
 assert.equal(verdict.ok,true,JSON.stringify(verdict));
 assert.ok(verdict.tests>=6,'original 84.7 test suite must actually execute');
});
