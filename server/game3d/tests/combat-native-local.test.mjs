// Native Node 22 smoke tests for the non-production PR verification helper.
// A private GitHub-shaped origin is URL-rewritten to a disposable LOCAL bare
// repository: these tests never call real GitHub or touch the player's checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {evaluateGame3DNodeTap847} from '../privatePgTapSummary847.mjs';

const verifier=fileURLToPath(new URL('../tools/verifyCombatQuestNativeLocal.mjs',import.meta.url));
const command=(exe,args,cwd)=>{
 const r=spawnSync(exe,args,{cwd,encoding:'utf8',timeout:60000,
  windowsHide:true});
 if(r.error)throw r.error;
 return r;
};
const ok=(exe,args,cwd)=>{
 const r=command(exe,args,cwd);
 assert.equal(r.status,0,exe+' '+args.join(' ')+' failed: '+r.stderr);
 return r.stdout.trim();
};
const cases=[
 'combat868.admission-shutdown.test.mjs',
 'combat845.admission.test.mjs',
 'combat857.original-chain.test.mjs',
 'combat846.host.test.mjs',
 'combat869.scheduler-shutdown.test.mjs',
 'combat844.scheduler.test.mjs',
 'combat870.combined-shutdown.test.mjs',
 'combat871.monotonic-clock.test.mjs',
 'combat872.lease-snapshot.test.mjs',
 'combat873.post-input-lease.test.mjs',
];
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'axe-native-ci-unit-'));
 const origin=join(dir,'origin.git'),repo=join(dir,'repo');
 mkdirSync(origin);mkdirSync(repo);
 ok('git',['init','--bare','-q',origin],dir);
 ok('git',['init','-q',repo],dir);
 ok('git',['config','user.email','fixture@example.test'],repo);
 ok('git',['config','user.name','CI fixture'],repo);
 ok('git',['remote','add','origin',
  'https://github.com/marcusflow1-arch/atom-x-eve-os.git'],repo);
 ok('git',['config','--local','url.'+pathToFileURL(origin).href+'.insteadOf',
  'https://github.com/marcusflow1-arch/atom-x-eve-os.git'],repo);
 const dirTests=join(repo,'server','game3d','tests');
 mkdirSync(dirTests,{recursive:true});
 for(const name of cases){
  writeFileSync(join(dirTests,name),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('fixture',()=>assert.equal(1,1));\n");
 }
 const toolsDir=join(repo,'server','game3d','tools');
 mkdirSync(toolsDir,{recursive:true});
 writeFileSync(join(toolsDir,'verifyCombatQuest851.mjs'),
  "const requiredSuites = [\n 'combat869.scheduler-shutdown.test.mjs',\n];\n");
 writeFileSync(join(dirTests,'combat851.offline.test.mjs'),
  "import test from 'node:test';\n"+
  "import assert from 'node:assert/strict';\n"+
  "import {readFileSync} from 'node:fs';\n"+
  "test('test-only combined manifest',()=>{\n"+
  " const index=readFileSync(new URL('../tools/verifyCombatQuest851.mjs',import.meta.url),'utf8');\n"+
  " assert.match(index,/combat868.admission-shutdown.test.mjs/);\n"+
  " assert.match(index,/combat869.scheduler-shutdown.test.mjs/);\n"+
  " const self=readFileSync(new URL(import.meta.url),'utf8');\n"+
  " assert.match(self,/requiredSuites.length,27/);\n"+
  "});\n// all twenty-six original source regressions\n"+
  "// requiredSuites.length,26\n");
 writeFileSync(join(repo,'server','game3d','privateCombatQuestAdmission845.mjs'),
  "export const ADMISSION_BUILD = 'BASE';\n");
 ok('git',['add','.'],repo);
 ok('git',['commit','-qm','baseline synthetic PR'],repo);
 ok('git',['push','-q','origin','HEAD:refs/pull/798/head'],repo);
 // Distinct admission source and tests only on the 794 side.
 writeFileSync(join(repo,'server','game3d','privateCombatQuestAdmission845.mjs'),
  "export const ADMISSION_BUILD = 'PR794';\n");
 writeFileSync(join(dirTests,'combat868.admission-shutdown.test.mjs'),
  "import test from 'node:test';\n"+
  "import assert from 'node:assert/strict';\n"+
  "import {ADMISSION_BUILD} from '../privateCombatQuestAdmission845.mjs';\n"+
  "test('PR794 build',()=>assert.equal(ADMISSION_BUILD,'PR794'));\n");
 ok('git',['add','.'],repo);
 ok('git',['commit','-qm','synthetic admission PR'],repo);
 ok('git',['push','-q','origin','HEAD:refs/pull/794/head'],repo);
 // PR 804 resolves the original 86.8/86.9 overlap in both manifest files.
 writeFileSync(join(toolsDir,'verifyCombatQuest851.mjs'),
  "const requiredSuites=[\n"+
  " 'combat868.admission-shutdown.test.mjs',\n"+
  " 'combat869.scheduler-shutdown.test.mjs',\n"+
  " 'combat870.combined-shutdown.test.mjs',\n];\n");
 writeFileSync(join(dirTests,'combat851.offline.test.mjs'),
  "import test from 'node:test';\n"+
  "import assert from 'node:assert/strict';\n"+
  "import {readFileSync} from 'node:fs';\n"+
  "test('87.0 fully reconciled manifest',()=>{\n"+
  " const index=readFileSync(new URL('../tools/verifyCombatQuest851.mjs',import.meta.url),'utf8');\n"+
  " assert.match(index,/combat868.admission-shutdown.test.mjs/);\n"+
  " assert.match(index,/combat869.scheduler-shutdown.test.mjs/);\n"+
  " assert.match(index,/combat870.combined-shutdown.test.mjs/);\n"+
  " const self=readFileSync(new URL(import.meta.url),'utf8');\n"+
  " assert.match(self,/requiredSuites.length,28/);\n"+
  "});\n// all twenty-eight original source regressions\n"+
  "// requiredSuites.length,28\n");
 ok('git',['add','.'],repo);
 ok('git',['commit','-qm','reconciled synthetic PR804'],repo);
 ok('git',['push','-q','origin','HEAD:refs/pull/804/head'],repo);
 // 87.1 has a separate original scheduler source and standalone clock test.
 writeFileSync(join(repo,'server','game3d','privateCombatQuestScheduler844.mjs'),
  "export const CLOCK_871 = 'PR807';\n");
 writeFileSync(join(dirTests,'combat871.monotonic-clock.test.mjs'),
  "import test from 'node:test';\n"+
  "import assert from 'node:assert/strict';\n"+
  "import {CLOCK_871} from '../privateCombatQuestScheduler844.mjs';\n"+
  "test('PR807 original clock',()=>assert.equal(CLOCK_871,'PR807'));\n");
 ok('git',['add','.'],repo);
 ok('git',['commit','-qm','synthetic scheduler clock PR807'],repo);
 ok('git',['push','-q','origin','HEAD:refs/pull/807/head'],repo);
 ok('git',['push','-q','origin','HEAD:refs/pull/934/head'],repo);
 ok('git',['push','-q','origin','HEAD:refs/pull/938/head'],repo);
 return {dir,repo,dirTests,toolsDir};
};
test('local native verifier checks both real-shaped PR refs and leaves checkout intact',()=>{
 const f=fixture();
 try{
  const before=ok('git',['status','--porcelain'],f.repo);
  const evidence=join(f.dir,'evidence');
  const run=command(process.execPath,[verifier,'--pr','both','--repo',f.repo,
   '--output',evidence],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const s=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(s.status,'native_source_tests_passed');
  assert.equal(s.databaseVerified,false);
  assert.equal(s.liveGameVerified,false);
  assert.deepEqual(s.results.map(x=>x.pr),[794,798]);
  assert.deepEqual(s.results.map(x=>x.cases.length),[4,3]);
  for(const pr of s.results)for(const c of pr.cases){
   assert.equal(c.status,'passed');
   assert.equal(c.tests,1);
   assert.equal(c.failed,0);
   assert.match(readFileSync(c.evidence.file,'utf8'),/# pass 1/);
  }
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('local native verifier refuses unrelated GitHub origin',()=>{
 const f=fixture();
 try{
  ok('git',['remote','set-url','origin',
   'https://github.com/other/untrusted.git'],f.repo);
  const run=command(process.execPath,[verifier,'--repo',f.repo],f.repo);
  assert.equal(run.status,2);
  assert.match(run.stderr,/Refusing to fetch/);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('local native verifier fails closed and records a native test regression',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.dirTests,'combat869.scheduler-shutdown.test.mjs'),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('should fail',()=>assert.equal(1,2));\n");
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','introduce test failure'],f.repo);
  ok('git',['push','-q','--force','origin',
   'HEAD:refs/pull/798/head'],f.repo);
  const evidence=join(f.dir,'evidence');
  const run=command(process.execPath,[verifier,'--pr','798',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const s=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(s.status,'failed');
  assert.equal(s.results[0].cases[0].status,'failed');
  assert.equal(s.results[0].cases[0].failed,1);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('combined verifier validates exact admission+scheduler source overlay',()=>{
 const f=fixture();
 try{
  const before=ok('git',['status','--porcelain'],f.repo);
  const evidence=join(f.dir,'combined-evidence');
  const run=command(process.execPath,[verifier,'--pr','combined',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const summary=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(summary.status,'native_source_overlay_verified');
  assert.equal(summary.databaseVerified,false);
  assert.equal(summary.base44Verified,false);
  assert.equal(summary.liveGameVerified,false);
  assert.deepEqual(summary.results.map(x=>x.pr),[794,798,'combined']);
  const combined=summary.results[2];
  assert.equal(combined.composition,'uncommitted_source_overlay_not_a_merge');
  assert.notEqual(combined.heads.admissionPr794,combined.heads.schedulerPr798);
  assert.equal(combined.cases.length,7);
  assert.equal(combined.cases.every(x=>x.status==='passed'),true);
  assert.equal(combined.cases.some(x=>x.suite==='combat851.offline.test.mjs'),true);
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('combined verifier fails closed on unknown manifest and removes worktree',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.toolsDir,'verifyCombatQuest851.mjs'),
   "const requiredSuites=['unknown'];\n");
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','unknown manifest'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/798/head'],f.repo);
  const evidence=join(f.dir,'unknown-manifest');
  const run=command(process.execPath,[verifier,'--pr','combined',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[2].pr,'combined');
  assert.equal(report.results[2].status,'error');
  assert.match(report.results[2].message,/Unknown offline source manifest/);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('PR804 native verifier tests all eight suites at the exact PR head',()=>{
 const f=fixture();
 try{
  const before=ok('git',['status','--porcelain'],f.repo);
  const evidence=join(f.dir,'pr804');
  const run=command(process.execPath,[verifier,'--pr','804',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'native_source_tests_passed');
  assert.equal(report.databaseVerified,false);
  assert.equal(report.base44Verified,false);
  assert.deepEqual(report.results.map(x=>x.pr),[804]);
  assert.equal(report.results[0].cases.length,8);
  assert.equal(report.results[0].cases.every(x=>x.status==='passed'),true);
  assert.ok(report.results[0].cases.some(x=>x.suite==='combat870.combined-shutdown.test.mjs'));
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('PR804 native verifier fails closed on a native source test regression',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.dirTests,'combat870.combined-shutdown.test.mjs'),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('intentional failure',()=>assert.equal(1,2));\n");
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','synthetic PR804 failure'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/804/head'],f.repo);
  const evidence=join(f.dir,'pr804-failure');
  const run=command(process.execPath,[verifier,'--pr','804',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[0].cases[0].suite,'combat870.combined-shutdown.test.mjs');
  assert.equal(report.results[0].cases[0].status,'failed');
  assert.equal(report.results[0].cases[0].failed,1);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});


test('PR807 native verifier checks four source cases at the exact original clock PR head',()=>{
 const f=fixture();
 try{
  const before=ok('git',['status','--porcelain'],f.repo);
  const evidence=join(f.dir,'pr807');
  const run=command(process.execPath,[verifier,'--pr','807',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const summary=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(summary.status,'native_source_tests_passed');
  assert.equal(summary.databaseVerified,false);
  assert.equal(summary.base44Verified,false);
  assert.deepEqual(summary.results.map(x=>x.pr),[807]);
  assert.equal(summary.results[0].cases.length,4);
  assert.equal(summary.results[0].cases.every(c=>c.status==='passed'),true);
  assert.equal(summary.results[0].cases[0].suite,
   'combat871.monotonic-clock.test.mjs');
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('PR807 native verifier fails closed on a genuine failing clock regression',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.dirTests,'combat871.monotonic-clock.test.mjs'),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('intentional clock failure',()=>assert.equal(1,2));\n");
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','clock source fails'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/807/head'],f.repo);
  const evidence=join(f.dir,'pr807-failure');
  const run=command(process.execPath,[verifier,'--pr','807',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[0].cases[0].suite,
   'combat871.monotonic-clock.test.mjs');
  assert.equal(report.results[0].cases[0].status,'failed');
  assert.equal(report.results[0].cases[0].failed,1);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('PR938 native verifier checks all eleven original source suites on exact draft head',()=>{
 const f=fixture();
 try{
  const before=ok('git',['status','--porcelain'],f.repo);
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  const folder=join(f.dir,'pr938-native');
  const run=command(process.execPath,[verifier,'--pr','938',
   '--repo',f.repo,'--output',folder],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const summary=JSON.parse(readFileSync(join(folder,'summary.json'),'utf8'));
  assert.equal(summary.status,'native_source_tests_passed');
  assert.deepEqual(summary.requestedPrs,[938]);
  assert.equal(summary.results[0].pr,938);
  assert.equal(summary.results[0].head,expected);
  assert.equal(summary.results[0].provenance,'github_pr_head');
  assert.equal(summary.results[0].cases.length,11);
  assert.equal(summary.results[0].cases.every(c=>c.status==='passed'),true);
  assert.equal(summary.results[0].cases.some(c=>
   c.suite==='combat873.post-input-lease.test.mjs'),true);
  assert.equal(summary.results[0].cases.some(c=>
   c.suite==='combat851.offline.test.mjs'),true);
  assert.equal(summary.databaseVerified,false);
  assert.equal(summary.base44Verified,false);
  assert.equal(summary.liveGameVerified,false);
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('PR938 native verification fails closed on missing staged lease regression',()=>{
 const f=fixture();
 try{
  rmSync(join(f.dirTests,'combat873.post-input-lease.test.mjs'));
  ok('git',['add','-A'],f.repo);
  ok('git',['commit','-qm','synthetic missing PR938 dependency'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/938/head'],f.repo);
  const folder=join(f.dir,'pr938-missing');
  const run=command(process.execPath,[verifier,'--pr','938',
   '--repo',f.repo,'--output',folder],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const summary=JSON.parse(readFileSync(join(folder,'summary.json'),'utf8'));
  assert.equal(summary.status,'failed');
  const missing=summary.results[0].cases.find(c=>
   c.suite==='combat873.post-input-lease.test.mjs');
  assert.equal(missing?.status,'missing_suite');
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('PR938 native verification refuses real failing original scheduler assertion',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.dirTests,'combat844.scheduler.test.mjs'),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('regression',()=>assert.equal(1,2));\n");
  ok('git',['add','-A'],f.repo);
  ok('git',['commit','-qm','synthetic failed PR938 scheduler'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/938/head'],f.repo);
  const folder=join(f.dir,'pr938-regression');
  const run=command(process.execPath,[verifier,'--pr','938',
   '--repo',f.repo,'--output',folder],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const summary=JSON.parse(readFileSync(join(folder,'summary.json'),'utf8'));
  assert.equal(summary.status,'failed');
  const failed=summary.results[0].cases.find(c=>
   c.suite==='combat844.scheduler.test.mjs');
  assert.equal(failed?.status,'failed');
  assert.equal(failed?.failed,1);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('PR934 native verifier pins the exact proposed 95.0 head and executes 11 suites',()=>{
 const f=fixture();
 try{
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  const before=ok('git',['status','--porcelain'],f.repo);
  const evidence=join(f.dir,'pr934');
  const run=command(process.execPath,[verifier,'--pr','934',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'native_source_tests_passed');
  assert.equal(report.results[0].pr,934);
  assert.equal(report.results[0].head,expected);
  assert.equal(report.results[0].provenance,'github_pr_head');
  assert.equal(report.results[0].cases.length,11);
  assert.equal(report.results[0].cases.every(c=>c.status==='passed'),true);
  assert.equal(report.results[0].cases.some(c=>
   c.suite==='combat873.post-input-lease.test.mjs'),true);
  assert.equal(report.results[0].cases.some(c=>
   c.suite==='combat851.offline.test.mjs'),true);
  assert.equal(report.databaseVerified,false);
  assert.equal(report.base44Verified,false);
  assert.equal(report.liveGameVerified,false);
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('local main pins current merged originals without fetching remote or mutating checkout',()=>{
 const f=fixture();
 try{
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  ok('git',['branch','main',expected],f.repo);
  const before=ok('git',['status','--porcelain'],f.repo);
  // The remote is deliberately unavailable: local-main mode must stay offline.
  rmSync(join(f.dir,'origin.git'),{recursive:true,force:true});
  const evidence=join(f.dir,'main-evidence');
  const run=command(process.execPath,[verifier,'--pr','main',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,0,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'native_source_tests_passed');
  assert.deepEqual(report.requestedPrs,['main']);
  assert.equal(report.results[0].pr,'main');
  assert.equal(report.results[0].head,expected);
  assert.equal(report.results[0].provenance,'local_refs_heads_main');
  assert.equal(report.results[0].remoteFreshnessVerified,false);
  assert.equal(report.results[0].cases.length,11);
  assert.equal(report.results[0].cases.every(c=>c.status==='passed'),true);
  assert.equal(report.results[0].cases.some(c=>c.suite==='combat871.monotonic-clock.test.mjs'),true);
  assert.equal(report.results[0].cases.some(c=>c.suite==='combat872.lease-snapshot.test.mjs'),true);
  assert.equal(report.results[0].cases.some(c=>c.suite==='combat873.post-input-lease.test.mjs'),true);
  assert.equal(report.databaseVerified,false);
  assert.equal(report.base44Verified,false);
  assert.equal(report.liveGameVerified,false);
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('local main refuses absent main ref rather than silently testing unrelated HEAD',()=>{
 const f=fixture();
 try{
  // Guarantee there is no main branch even if local Git defaults change.
  ok('git',['branch','-M','native-verifier-fixture'],f.repo);
  const evidence=join(f.dir,'missing-main');
  const run=command(process.execPath,[verifier,'--pr','main',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[0].status,'main_ref_unavailable');
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('local main reports a real failed original combat suite and cleans up',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.dirTests,'combat871.monotonic-clock.test.mjs'),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('fail closed',()=>assert.equal(1,2));\n");
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','intentional local main fixture failure'],f.repo);
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  ok('git',['branch','main',expected],f.repo);
  const evidence=join(f.dir,'main-failure');
  const run=command(process.execPath,[verifier,'--pr','main',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[0].head,expected);
  const clock=report.results[0].cases.find(x=>
   x.suite==='combat871.monotonic-clock.test.mjs');
  assert.equal(clock.status,'failed');
  assert.equal(clock.failed,1);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('canonical TAP gate rejects corrupted or contradictory native summary evidence',()=>{
 const good=[
  'TAP version 13','1..2','# tests 2','# pass 2','# fail 0',
  '# cancelled 0','# skipped 0',
 ].join('\n')+'\n';
 const result=output=>evaluateGame3DNodeTap847({
  output,exitCode:0,signal:null,error:null,
 });
 assert.equal(result(good).ok,true);
 assert.equal(result(good+'# tests 2\n').ok,false,
  'duplicated top-level tests summary must not certify');
 assert.equal(result(good.replace('# cancelled 0\n','')).ok,false,
  'truncated TAP summary must not certify');
 assert.equal(result(good.replace('# pass 2','# pass 3')).ok,false,
  'contradictory pass count must not certify');
 assert.equal(result(good.replace('# skipped 0','# skipped 1')).ok,false,
  'skipped native assertions must not certify');
 assert.equal(result(good.replace('# fail 0','# fail 1')).ok,false,
  'failed native assertions must not certify');
 assert.equal(result(good.replace('# cancelled 0','# cancelled 1')).ok,false,
  'cancelled native assertions must not certify');
 assert.equal(evaluateGame3DNodeTap847({output:good,exitCode:1}).ok,false,
  'a failed native process never certifies a green TAP summary');
});

test('native main and historical PR paths both use the existing canonical TAP gate',()=>{
 const source=readFileSync(verifier,'utf8');
 assert.match(source,/evaluateGame3DNodeTap847/);
 assert.match(source,/\.\.\/privatePgTapSummary847\.mjs/);
 assert.equal((source.match(/const pass = run\.ok && taps\.tapVerified;/g)||[]).length,2);
 assert.doesNotMatch(source,/const match = result\.stdout\.match/);
});


function disposableCleanupRefusal(f){
 const shim=join(f.dir,'intercept-worktree-cleanup.cjs');
 writeFileSync(shim,[
  "const cp=require('node:child_process');",
  "const original=cp.spawnSync;",
  "cp.spawnSync=(file,args,options)=>{",
  " const removal=file==='git' && Array.isArray(args) &&",
  "  args[0]==='worktree' && args[1]==='remove';",
  " const target=String(args?.[args.length-1]||'');",
  " const scope=process.env.AXE_FIXTURE_CLEANUP_REFUSAL;",
  " if(removal && (scope==='main' ||",
  "   (scope==='combined' && target.includes('axe-pr-combined-'))))",
  "   return {status:19,signal:null,stdout:'',",
  "    stderr:'synthetic worktree cleanup refusal'};",
  " return original(file,args,options);",
  "};",
  "require('node:module').syncBuiltinESMExports();",
 ].join('\n')+'\n');
 return shim;
}
function runCleanupRefusal(f,pr,scope,evidence){
 const shim=disposableCleanupRefusal(f);
 return spawnSync(process.execPath,['--require',shim,verifier,
  '--pr',pr,'--repo',f.repo,'--output',evidence],{
  cwd:f.repo,encoding:'utf8',timeout:120000,windowsHide:true,
  env:{...process.env,AXE_FIXTURE_CLEANUP_REFUSAL:scope},
 });
}
function cleanupSyntheticGitWorktrees(f){
 // Only delete temporary synthetic fixture worktrees, never a user checkout.
 const listing=ok('git',['worktree','list','--porcelain'],f.repo);
 for(const line of listing.split(/\r?\n/)){
  if(!line.startsWith('worktree '))continue;
  const path=line.slice('worktree '.length);
  if(path!==f.repo && /[/\\]axe-(?:main|pr-combined)-/.test(path))
   rmSync(path,{recursive:true,force:true});
 }
 ok('git',['worktree','prune','--expire','now'],f.repo);
}
test('simulated cleanup refusal cannot certify otherwise passing main suites',()=>{
 const f=fixture();
 try{
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  ok('git',['branch','main',expected],f.repo);
  const evidence=join(f.dir,'cleanup-refused-main');
  const run=runCleanupRefusal(f,'main','main',evidence);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[0].head,expected);
  assert.equal(report.results[0].status,'failed');
  const cases=report.results[0].cases;
  assert.equal(cases.filter(c=>c.suite!=='git_worktree_cleanup')
   .every(c=>c.status==='passed'),true,
   'all synthetic native assertions pass but worktree removal must still fail');
  assert.equal(cases.some(c=>c.suite==='git_worktree_cleanup' &&
   c.status==='failed' && c.reason==='worktree_remove_failed'),true);
  assert.match(readFileSync(join(evidence,'pr-main-cleanup-error.txt'),'utf8'),
   /synthetic worktree cleanup refusal/);
  assert.equal(ok('git',['rev-parse','HEAD'],f.repo),expected);
 }finally{
  try{cleanupSyntheticGitWorktrees(f);}
  finally{rmSync(f.dir,{recursive:true,force:true});}
 }
});
test('simulated historical combined overlay cleanup refusal blocks certification',()=>{
 const f=fixture();
 try{
  const evidence=join(f.dir,'cleanup-refused-combined');
  const run=runCleanupRefusal(f,'combined','combined',evidence);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.deepEqual(report.results.slice(0,2).map(x=>x.status),
   ['passed','passed']);
  const combined=report.results[2];
  assert.equal(combined.status,'failed');
  assert.equal(combined.cases.filter(c=>c.suite!=='git_worktree_cleanup')
   .every(c=>c.status==='passed'),true);
  assert.equal(combined.cases.some(c=>c.suite==='git_worktree_cleanup' &&
   c.status==='failed' && c.reason==='worktree_remove_failed'),true);
  assert.match(readFileSync(join(evidence,'combined-cleanup-error.txt'),'utf8'),
   /synthetic worktree cleanup refusal/);
 }finally{
  try{cleanupSyntheticGitWorktrees(f);}
  finally{rmSync(f.dir,{recursive:true,force:true});}
 }
});
test('both native verification modes explicitly gate success on worktree cleanup',()=>{
 const source=readFileSync(verifier,'utf8');
 assert.equal((source.match(/reason:'worktree_remove_failed'/g)||[]).length,2);
 assert.equal((source.match(/cases\.push\(\{suite:'git_worktree_cleanup'/g)||[]).length,2);
 assert.equal((source.match(/status: cases\.every\(c => c\.status === 'passed'\)/g)||[]).length,2);
});

test('PR934 refuses missing original 87.3 lease regression',()=>{
 const f=fixture();
 try{
  rmSync(join(f.dirTests,'combat873.post-input-lease.test.mjs'));
  ok('git',['add','-A'],f.repo);
  ok('git',['commit','-qm','simulate missing PR934 dependency'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/934/head'],f.repo);
  const evidence=join(f.dir,'missing-873');
  const run=command(process.execPath,[verifier,'--pr','934',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  const missing=report.results[0].cases.find(x=>
   x.suite==='combat873.post-input-lease.test.mjs');
  assert.equal(missing?.status,'missing_suite');
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('PR934 refuses failing native original 87.3 lease regression',()=>{
 const f=fixture();
 try{
  writeFileSync(join(f.dirTests,'combat873.post-input-lease.test.mjs'),
   "import test from 'node:test';\n"+
   "import assert from 'node:assert/strict';\n"+
   "test('lease regression fails',()=>assert.equal(1,2));\n");
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','simulate failing PR934 lease test'],f.repo);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/934/head'],f.repo);
  const evidence=join(f.dir,'failed-873');
  const run=command(process.execPath,[verifier,'--pr','934',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(run.status,1,run.stdout+run.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  const failed=report.results[0].cases.find(x=>
   x.suite==='combat873.post-input-lease.test.mjs');
  assert.equal(failed?.status,'failed');
  assert.equal(failed?.failed,1);
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('PR938 native verifier refuses a changed pull-request head before running suites',()=>{
 const f=fixture();
 try{
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  const before=ok('git',['status','--porcelain'],f.repo);
  const goodFolder=join(f.dir,'pr938-pinned-good');
  const good=command(process.execPath,[verifier,'--pr','938','--repo',f.repo,
   '--expect-head',expected,'--output',goodFolder],f.repo);
  assert.equal(good.status,0,good.stdout+good.stderr);
  const passed=JSON.parse(readFileSync(join(goodFolder,'summary.json'),'utf8'));
  assert.equal(passed.status,'native_source_tests_passed');
  assert.equal(passed.expectedHead,expected);
  assert.equal(passed.results[0].head,expected);
  assert.equal(passed.results[0].cases.length,11);
  assert.equal(ok('git',['status','--porcelain'],f.repo),before);

  writeFileSync(join(f.repo,'fixture-pr938-head-change.txt'),'new fixture revision\n');
  ok('git',['add','.'],f.repo);
  ok('git',['commit','-qm','simulate concurrent PR head update'],f.repo);
  const newer=ok('git',['rev-parse','HEAD'],f.repo);
  assert.notEqual(newer,expected);
  ok('git',['push','-q','--force','origin','HEAD:refs/pull/938/head'],f.repo);
  const changedFolder=join(f.dir,'pr938-pinned-stale');
  const stale=command(process.execPath,[verifier,'--pr','938','--repo',f.repo,
   '--expect-head',expected,'--output',changedFolder],f.repo);
  assert.equal(stale.status,1,stale.stdout+stale.stderr);
  const failed=JSON.parse(readFileSync(join(changedFolder,'summary.json'),'utf8'));
  assert.equal(failed.status,'failed');
  assert.equal(failed.expectedHead,expected);
  assert.equal(failed.results[0].status,'head_mismatch');
  assert.equal(failed.results[0].head,newer);
  assert.deepEqual(failed.results[0].cases,[],
   'a stale reviewed PR SHA must never run tests against an unreviewed revision');
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('head pin rejects invalid SHA and ambiguous multi-PR selection',()=>{
 const f=fixture();
 try{
  const commands=[
   ['--pr','938','--expect-head','not-a-git-sha'],
   ['--pr','938','--expect-head',''],
   ['--pr','938','--expect-head'],
   ['--pr','both','--expect-head','a'.repeat(40)],
   ['--pr','combined','--expect-head','a'.repeat(40)],
  ];
  for(const args of commands){
   const result=command(process.execPath,[verifier,...args,'--repo',f.repo],f.repo);
   assert.equal(result.status,2,result.stdout+result.stderr);
  }
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});


test('local main refuses a missing merged 87.3 post-input lease suite',()=>{
 const f=fixture();
 try{
  rmSync(join(f.dirTests,'combat873.post-input-lease.test.mjs'));
  ok('git',['add','-A'],f.repo);
  ok('git',['commit','-qm','synthetic main missing 87.3 test'],f.repo);
  const expected=ok('git',['rev-parse','HEAD'],f.repo);
  ok('git',['branch','main',expected],f.repo);
  const evidence=join(f.dir,'main-missing-873');
  const result=command(process.execPath,[verifier,'--pr','main',
   '--repo',f.repo,'--output',evidence],f.repo);
  assert.equal(result.status,1,result.stdout+result.stderr);
  const report=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));
  assert.equal(report.status,'failed');
  assert.equal(report.results[0].head,expected);
  const missing=report.results[0].cases.find(c=>
   c.suite==='combat873.post-input-lease.test.mjs');
  assert.equal(missing?.status,'missing_suite');
  assert.equal(ok('git',['worktree','list','--porcelain'],f.repo)
   .split('worktree ').length-1,1);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
