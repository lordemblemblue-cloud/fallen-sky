// Combat/Quest 84.7.1: non-skippable summary of a native Node TAP run.
// Never infer database verification from an exit status alone.
const COUNTERS=Object.freeze(['tests','pass','fail','skipped','cancelled']);
export function evaluateGame3DNodeTap847({
 output='',exitCode=null,signal=null,error=null,
}={}){
 if(typeof output!=='string')return Object.freeze({ok:false,reason:'missing_tap_output'});
 const seen=new Map();
 for(const line of output.split(/\r?\n/)){
  const match=/^# (tests|pass|fail|skipped|cancelled) ([0-9]+)\s*$/.exec(line);
  if(!match)continue;
  // More than one top-level summary is ambiguous (e.g. concatenated runs).
  if(seen.has(match[1]))return Object.freeze({ok:false,reason:'duplicate_tap_summary'});
  seen.set(match[1],Number(match[2]));
 }
 if(COUNTERS.some(k=>!seen.has(k)))
  return Object.freeze({ok:false,reason:'incomplete_tap_summary'});
 const total=seen.get('tests'),passed=seen.get('pass'),
  failed=seen.get('fail'),skipped=seen.get('skipped'),
  cancelled=seen.get('cancelled');
 if(!Number.isSafeInteger(total)||total<=0||
    [passed,failed,skipped,cancelled].some(
     n=>!Number.isSafeInteger(n)||n<0))
  return Object.freeze({ok:false,reason:'invalid_tap_counters'});
 if(total!==passed+failed+skipped+cancelled||
    total!==passed||failed!==0||skipped!==0||cancelled!==0)
  return Object.freeze({ok:false,reason:'failing_or_skipped_tap_tests',
   tests:total,pass:passed,fail:failed,skipped,cancelled});
 if(exitCode!==0||signal!==null||error)
  return Object.freeze({ok:false,reason:'node_test_process_not_successful',
   tests:total,pass:passed,fail:failed,skipped,cancelled});
 return Object.freeze({ok:true,tests:total,pass:passed,fail:0,
  skipped:0,cancelled:0});
}
