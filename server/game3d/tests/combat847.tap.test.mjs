import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGame3DNodeTap847}
 from '../privatePgTapSummary847.mjs';

const summary=({tests=3,pass=3,fail=0,skipped=0,cancelled=0}={})=>
 ['TAP version 13','1..'+tests,'# tests '+tests,
  '# pass '+pass,'# fail '+fail,'# cancelled '+cancelled,
  '# skipped '+skipped,'# todo 0','# duration_ms 2.8'].join('\n')+'\n';
const verdict=(output,exitCode=0,signal=null,error=null)=>
 evaluateGame3DNodeTap847({output,exitCode,signal,error});

test('84.7.1 requires full real Node TAP summary with zero skipped',()=>{
 const result=verdict(summary());
 assert.deepEqual(result,{ok:true,tests:3,pass:3,
  fail:0,skipped:0,cancelled:0});
});
test('84.7.1 refuses skipped, failed and cancelled PG suites',()=>{
 for(const counts of [
  {pass:2,skipped:1},
  {pass:2,fail:1},
  {pass:2,cancelled:1},
  {pass:0,skipped:3},
 ])assert.equal(verdict(summary(counts)).ok,false);
});
test('84.7.1 refuses zero test suites and inconsistent totals',()=>{
 assert.equal(verdict(summary({tests:0,pass:0})).ok,false);
 assert.equal(verdict(summary({tests:4,pass:3})).ok,false);
});
test('84.7.1 refuses missing/corrupted/duplicate results',()=>{
 assert.equal(verdict('# tests 1\n# pass 1\n').reason,'incomplete_tap_summary');
 assert.equal(verdict(summary()+'# tests 3\n').reason,'duplicate_tap_summary');
 assert.equal(verdict('unstructured output').ok,false);
});
test('84.7.1 refuses process errors even if TAP claims full success',()=>{
 for(const args of [
  [summary(),1,null,null],
  [summary(),0,'SIGTERM',null],
  [summary(),0,null,new Error('timeout')],
  [summary(),null,null,null],
 ])assert.equal(verdict(...args).reason,'node_test_process_not_successful');
});
test('84.7.1 does not confuse test names with TAP summary lines',()=>{
 const body="  # Subtest: rejects incoming text '# skipped 0'\n"+
  "  ok 1 - inner test\n";
 assert.equal(verdict(body+summary()).ok,true);
});
