// 85.1: offline-only original Game 3D regression verifier.
// Fail closed if a checkout is incomplete; never report PG or live readiness.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {evaluateGame3DNodeTap847} from '../privatePgTapSummary847.mjs';

export const OFFLINE_GAME3D_SUITES_851=Object.freeze([
 'combat843.reconcile.test.mjs',
 'combat844.scheduler.test.mjs',
 'combat845.admission.test.mjs',
 'combat846.host.test.mjs',
 'combat847.runner.test.mjs',
 'combat847.tap.test.mjs',
 'combat848.presentation.test.mjs',
 'combat849.delivery.test.mjs',
 'combat850.preview.test.mjs',
 'combat852.isolation.test.mjs',
 'combat853.lifecycle.test.mjs',
 'combat854.chain.test.mjs',
 'combat855.cleanup.test.mjs',
 'combat856.endtoend.test.mjs',
 'combat857.original-chain.test.mjs',
 'combat858.host-cleanup.test.mjs',
 'combat859.reward-proof.test.mjs',
 'combat860.terminal-propagation.test.mjs',
 'combat861.payload.test.mjs',
 'combat862.immutable.test.mjs',
 'combat863.auth-budget.test.mjs',
 'combat864.shutdown-fence.test.mjs',
 'combat865.original-view-shutdown.test.mjs',
 'combat866.disconnect-cleanup.test.mjs',
 'combat867.host-shutdown.test.mjs',
 'combat868.admission-shutdown.test.mjs',
 'combat869.scheduler-shutdown.test.mjs',
 'combat870.combined-shutdown.test.mjs',
 'combat871.monotonic-clock.test.mjs',
 'combat872.lease-snapshot.test.mjs',
 'combat873.post-input-lease.test.mjs',
]);
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tests=resolve(base,'tests');
export function verifyGame3DEntryPoint851(source){
 if(typeof source!=='string')return Object.freeze({ok:false,reason:'unreadable_game3d_entrypoint'});
 if(/privateCombatQuest(?:Scheduler844|Admission845|Staging(?:846|848|849|850))|privateQuestbookPreviewTransport850/.test(source))
  return Object.freeze({ok:false,reason:'unexpected_live_private_preview_mount'});
 return Object.freeze({ok:true});
}
// Native Node's parent test runner exports NODE_TEST_CONTEXT. Forwarding it to
// a child 'node --test' can silently suppress all child TAP output while the
// subprocess still exits 0. Remove that private runner marker before starting
// each original source suite; keep private Questbook preview disabled as before.
export function buildGame3DOfflineChildEnv851(parentEnv = process.env) {
 const childEnv={...parentEnv,GAME3D_PRIVATE_QUESTBOOK_PREVIEW_850:''};
 delete childEnv.NODE_TEST_CONTEXT;
 return childEnv;
}
const manifest=Object.freeze({
 version:'85.1',verification:'offline-source-only',
 databaseVerified:false,liveGameVerified:false,productionReady:false,
});
const run=()=>{
 const index=resolve(base,'index.mjs');
 if(!existsSync(index))return {ok:false,reason:'missing_game3d_server_entrypoint'};
 let entry;
 try{entry=readFileSync(index,'utf8')}catch{return {ok:false,reason:'unreadable_game3d_entrypoint'}}
 const gate=verifyGame3DEntryPoint851(entry);if(!gate.ok)return gate;
 const results=[];
 for(const name of OFFLINE_GAME3D_SUITES_851){
  const path=resolve(tests,name);
  if(!existsSync(path))return {ok:false,reason:'missing_required_suite',suite:name,results};
  const child=spawnSync(process.execPath,['--test','--test-reporter=tap',path],{
   cwd:base,encoding:'utf8',timeout:40000,maxBuffer:4*1024*1024,
   env:buildGame3DOfflineChildEnv851(),
  });
  const verified=evaluateGame3DNodeTap847({output:child.stdout??'',
   exitCode:child.status,signal:child.signal,error:child.error});
  if(!verified.ok)return {ok:false,reason:'original_suite_failed',suite:name,
   detail:verified.reason,results};
  results.push({suite:name,tests:verified.tests,passed:verified.pass});
 }
 return {ok:true,results,totalTests:results.reduce((n,x)=>n+x.tests,0),
  ...manifest};
};
const main=()=>{
 if(process.argv.includes('--help')){
  console.log('85.1 offline original 84.3–85.0 private Game 3D source regression gate. Never reports real PG or live readiness.');
  return;
 }
 if(process.argv.includes('--list')){
  console.log(JSON.stringify({...manifest,requiredSuites:OFFLINE_GAME3D_SUITES_851}));
  return;
 }
 if(process.argv.length>2){
  console.error('85.1 denied: unrecognized argument');process.exitCode=1;return;
 }
 const r=run();
 // Structured output is deliberately one machine-readable record.
 console.log(JSON.stringify(r));
 if(!r.ok)process.exitCode=1;
};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
