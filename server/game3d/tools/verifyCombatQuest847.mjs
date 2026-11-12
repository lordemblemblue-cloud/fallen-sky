// Game 3D 84.7: explicitly opt-in sequential PostgreSQL 16 rehearsal.
// The ONLY permissible URL targets the dedicated localhost disposable DB.
// Every child PG test must actually run: a skip is a failed verification.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {evaluateGame3DNodeTap847}
 from '../privatePgTapSummary847.mjs';
import {safeDisposablePgUrl847} from '../privateDisposablePgGuard847.mjs';

const suites=Object.freeze([
 ['184','combat184.progression.pg.test.mjs'],
 ['185','combat185.pg.test.mjs'],
 ['186','combat186.pg.test.mjs'],
 ['187','combat187.pg.test.mjs'],
 ['188','combat188.pg.test.mjs'],
 ['189','combat189.pg.test.mjs'],
 ['847','combat847.pg.test.mjs'],
]);
const fail=message=>{console.error('84.7 private PG verification denied: '+message);
 process.exitCode=1;};
if(process.argv.includes('--help')){
 console.log('84.7 disposable PostgreSQL 16 gate. Requires GAME3D_847_DISPOSABLE_PG_ADMIN_URL pointing to localhost/game3d_847_disposable and GAME3D_847_DISPOSABLE_ACK=I_HAVE_A_DISPOSABLE_PG_INSTANCE. Runs existing private 18.4–18.9 PG regressions plus 84.3 receipt SQL integration. No production DB accepted.');
}else if(process.argv.includes('--self-test')){
 const safe='postgresql://postgres:placeholder@127.0.0.1:5432/game3d_847_disposable';
 if(!safeDisposablePgUrl847(safe)||
    safeDisposablePgUrl847(safe.replace('127.0.0.1','production.example'))||
    safeDisposablePgUrl847(safe.replace('game3d_847_disposable','production')))
  fail('disposable URL guard self-test failed');
 else console.log('84.7 local URL guard self-test passed; no database opened');
}else{
 const url=process.env.GAME3D_847_DISPOSABLE_PG_ADMIN_URL;
 if(process.env.GAME3D_847_DISPOSABLE_ACK!==
    'I_HAVE_A_DISPOSABLE_PG_INSTANCE'||!safeDisposablePgUrl847(url)){
  fail('missing explicit acknowledgement or unsafe database URL');
 }else{
  const env={...process.env,GAME3D_PRIVATE_STAGING_ENV:'staging'};
  let success=0;
  for(const [version,name] of suites){
   const file=fileURLToPath(new URL('../tests/'+name,import.meta.url));
   if(!existsSync(file)){fail('required PG test missing: '+name);break;}
   env['GAME3D_'+version+'_DISPOSABLE_PG_ADMIN_URL']=url;
   env['GAME3D_'+version+'_DISPOSABLE_ACK']='I_HAVE_A_DISPOSABLE_PG_INSTANCE';
   const result=spawnSync(process.execPath,
    ['--test','--test-reporter=tap',file],
    {env,encoding:'utf8',timeout:125000,maxBuffer:8*1024*1024});
   const output=result.stdout||'';
   const verdict=evaluateGame3DNodeTap847({output,
    exitCode:result.status,signal:result.signal,error:result.error});
   if(!verdict.ok){
    fail(version+' PG suite denied: '+verdict.reason);
    // Show limited diagnostic output but never print the configured URL.
    const safeOutput=(output+'\n'+(result.stderr||''))
      .replaceAll(url,'[REDACTED_LOCAL_DATABASE_URL]');
    console.error(safeOutput.slice(-5000));
    break;
   }
   success++;
   console.log('PG16 '+version+' suite verified: '+verdict.pass+'/'+verdict.tests+
    ' passed, zero skipped, zero failed');
  }
  if(success===suites.length)
   console.log('84.7 verified all '+success+
    ' real disposable PostgreSQL 16 suites; no production readiness implied');
 }
}
