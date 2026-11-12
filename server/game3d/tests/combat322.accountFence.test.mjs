import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateAccountFence313,ACCOUNT_CLAIM_SQL_313,
 ACCOUNT_VERIFY_SQL_313,ACCOUNT_RELEASE_SQL_313,ACCOUNT_RENEW_SQL_323}
 from '../privateAccountFence313.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const NOW=1793720000000;
const scope={ownerId:'originalA',characterId:'heroA',instanceId:'world-instance-A',
 instanceEpoch:'world-epoch-A'};
const wait=async check=>{
 for(let i=0;i<50&&!check();i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(check(),true,'test operation did not start');
};
function fixture(){
 let time=NOW,authenticated=true,superuser=false,exists=true,
  interrupt=false,pauseClaim=false,enteredClaim=0,releaseQuery=null,
  rejectRead=false,connections=0,released=0,rollbacks=0,commits=0,
  forcedWrongRow=false,pauseRenew=false,enteredRenew=0,releaseRenew=null;
 const rows=new Map();const history=[];
 const query=async(sql,params=[])=>{
  history.push({sql,params});
  if(sql.includes('current_setting(\'is_superuser\')')){
   return {rowCount:1,rows:[{schema_name:'quest_staging',superuser:superuser?'on':'off',
    fence_exists:exists,can_select:true,can_insert:true,can_update:true,dangerous:false}]};
  }
  if(sql==='BEGIN'||sql.startsWith('SET LOCAL'))return {rowCount:0,rows:[]};
  if(sql==='COMMIT'){commits++;return {rowCount:0,rows:[]}};
  if(sql==='ROLLBACK'){rollbacks++;return {rowCount:0,rows:[]}};
  if(interrupt)throw Error('simulated postgres transport failure');
  if(sql===ACCOUNT_CLAIM_SQL_313){
   enteredClaim++;
   if(pauseClaim)await new Promise(done=>releaseQuery=done);
   const [ownerId,characterId,instanceId,instanceEpoch,nonce,ttl]=params;
   const current=rows.get(ownerId);
   if(current&&current.active&&current.expire>time)return {rowCount:0,rows:[]};
   const next={owner_id:ownerId,character_id:characterId,
    world_instance_id:instanceId,world_epoch:instanceEpoch,
    claim_nonce:nonce,generation:current?current.generation+1:1,
    active:true,expire:time+ttl};
   rows.set(ownerId,next);
   return {rowCount:1,rows:[{...next,not_expired:true}]};
  }
  if(sql===ACCOUNT_RENEW_SQL_323){
   enteredRenew++;
   if(pauseRenew)await new Promise(done=>releaseRenew=done);
   const [ownerId,nonce,generation,ttl]=params;
   const existing=rows.get(ownerId);
   if(!existing||existing.claim_nonce!==nonce||existing.generation!==generation||
      !existing.active||existing.expire<=time)return {rowCount:0,rows:[]};
   existing.expire=time+ttl;
   return {rowCount:1,rows:[{...existing,not_expired:true}]};
  }
  if(sql===ACCOUNT_VERIFY_SQL_313){
   const [ownerId,nonce,generation]=params;
   const existing=rows.get(ownerId);
   if(!existing||existing.claim_nonce!==nonce||existing.generation!==generation)
    return {rowCount:0,rows:[]};
   return {rowCount:1,rows:[{...existing,
    owner_id:forcedWrongRow?'impostor':existing.owner_id,
    not_expired:existing.expire>time}]};
  }
  if(sql===ACCOUNT_RELEASE_SQL_313){
   const [ownerId,nonce,generation]=params;
   const existing=rows.get(ownerId);
   if(!existing||existing.claim_nonce!==nonce||existing.generation!==generation||
      !existing.active)return {rowCount:0,rows:[]};
   existing.active=false;existing.expire=time;
   return {rowCount:1,rows:[{owner_id:ownerId}]};
  }
  throw Error('Unexpected SQL '+sql.slice(0,30));
 };
 const pool={async connect(){connections++;return {query,
  release(){released++}}}};
 const options=(extra={})=>({enabled:true,pool,schema:'quest_staging',scope,
  verifyOriginal:async()=>authenticated,now:()=>time,...extra});
 return {pool,rows,history,options,clock(value){time=value},
  advance(ms){time+=ms},revoke(){authenticated=false},
  enableSuperuser(){superuser=true},missingTable(){exists=false},
  disconnect(){interrupt=true},wrongRow(){forcedWrongRow=true},
  pause(){pauseClaim=true},resume(){pauseClaim=false;releaseQuery?.()},
  pauseRenewal(){pauseRenew=true},resumeRenewal(){pauseRenew=false;releaseRenew?.()},
  get enteredRenew(){return enteredRenew},
  get enteredClaim(){return enteredClaim},
  get metrics(){return {connections,released,commits,rollbacks}},
 };
}
test('31.3 denied by default, rejects invalid role or table',async()=>{
 await assert.rejects(createPrivateAccountFence313(),/31.3/);
 const f=fixture();
 await assert.rejects(createPrivateAccountFence313({...f.options(),scope:{...scope,ownerId:'owner bad'}}),/31.3/);
 f.enableSuperuser();await assert.rejects(createPrivateAccountFence313(f.options()),/readiness/);
 const g=fixture();g.missingTable();
 await assert.rejects(createPrivateAccountFence313(g.options()),/readiness/);
});
test('31.4 original account may acquire once and database query uses parameters',async()=>{
 const f=fixture(),guard=await createPrivateAccountFence313(f.options());
 assert.equal(await guard.acquire(),true);
 assert.equal(await guard.acquire(),false);
 assert.equal(await guard.verify(),true);
 assert.equal(f.history.filter(x=>x.sql===ACCOUNT_CLAIM_SQL_313).length,1);
 assert.deepEqual(f.history.find(x=>x.sql===ACCOUNT_CLAIM_SQL_313).params.slice(0,4),
  [scope.ownerId,scope.characterId,scope.instanceId,scope.instanceEpoch]);
 assert.equal(guard.publicRouteInstalled,false);
 assert.equal(guard.productionReady,false);
 assert.equal(await guard.shutdown(),true);
 assert.equal(await guard.shutdown(),false);
});
test('31.5 two workers on one PG row cannot both own the same account',async()=>{
 const f=fixture();
 const a=await createPrivateAccountFence313(f.options());
 const b=await createPrivateAccountFence313(f.options());
 const results=await Promise.all([a.acquire(),b.acquire()]);
 assert.deepEqual([...results].sort(),[false,true]);
 assert.equal(await (results[0]?a:b).verify(),true);
 await a.shutdown();await b.shutdown();
});
test('31.6 lease expiry allows replacement with larger generation',async()=>{
 const f=fixture();const a=await createPrivateAccountFence313(f.options());
 assert.equal(await a.acquire(),true);
 const first=f.rows.get(scope.ownerId).generation;
 f.advance(16000);
 const b=await createPrivateAccountFence313(f.options());
 assert.equal(await b.acquire(),true);
 assert.equal(f.rows.get(scope.ownerId).generation,first+1);
 assert.equal(await a.verify(),false);
 assert.equal(await b.verify(),true);
 assert.equal(await a.release(),false,'old generation must not revoke replacement');
 assert.equal(await b.verify(),true);
 await a.shutdown();await b.shutdown();
});
test('31.7 current account release is idempotent, permits a new worker',async()=>{
 const f=fixture();const a=await createPrivateAccountFence313(f.options());
 assert.equal(await a.acquire(),true);
 assert.equal(await a.release(),true);
 assert.equal(await a.release(),false);
 const b=await createPrivateAccountFence313(f.options());
 assert.equal(await b.acquire(),true);
 await a.shutdown();await b.shutdown();
});
test('31.8 original world authentication revocation denies account reads',async()=>{
 const f=fixture(),guard=await createPrivateAccountFence313(f.options());
 assert.equal(await guard.acquire(),true);
 f.revoke();assert.equal(await guard.verify(),false);
 await guard.shutdown();
});
test('31.8 invalid database row and query failures deny account ownership',async()=>{
 const f=fixture(),guard=await createPrivateAccountFence313(f.options());
 assert.equal(await guard.acquire(),true);
 f.wrongRow();assert.equal(await guard.verify(),false);
 f.disconnect();assert.equal(await guard.verify(),false);
 await guard.shutdown();assert.ok(f.metrics.rollbacks>=1);
});
test('31.9 shutdown while PG claim is pending cannot revive stale owner',async()=>{
 const f=fixture(),guard=await createPrivateAccountFence313(f.options());
 f.pause();const pending=guard.acquire();await wait(()=>f.enteredClaim===1);
 const stop=guard.shutdown();f.resume();
 assert.equal(await pending,false);
 assert.equal(await stop,true);
 assert.equal(guard.active,false);
 assert.equal(f.rows.get(scope.ownerId).active,false);
});
test('31.9 loss of staging mode permanently denies verification',async()=>{
 const f=fixture(),guard=await createPrivateAccountFence313(f.options());
 assert.equal(await guard.acquire(),true);
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(await guard.verify(),false)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(await guard.verify(),false);await guard.shutdown();
});
test('32.1 row can never be used after expires-at according to database',async()=>{
 const f=fixture(),guard=await createPrivateAccountFence313(f.options());
 assert.equal(await guard.acquire(),true);
 f.advance(15001);assert.equal(await guard.verify(),false);
 await guard.shutdown();
});
test('32.2 SQL declares unique per owner and compares claim nonce+generation',()=>{
 assert.match(ACCOUNT_CLAIM_SQL_313,/ON CONFLICT \(owner_id\) DO UPDATE/);
 assert.match(ACCOUNT_CLAIM_SQL_313,/generation\+1/);
 assert.match(ACCOUNT_VERIFY_SQL_313,/claim_nonce=\$2::uuid AND generation=\$3/);
 assert.match(ACCOUNT_RELEASE_SQL_313,/claim_nonce=\$2::uuid AND generation=\$3/);
});

test('32.3 renewal CAS extends current lease without generation or nonce change',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 const before={...f.rows.get(scope.ownerId)};
 f.advance(5000);
 assert.equal(await g.renew(),true);
 const after=f.rows.get(scope.ownerId);
 assert.equal(after.generation,before.generation);
 assert.equal(after.claim_nonce,before.claim_nonce);
 assert.equal(after.expire,NOW+20000);
 assert.equal(await g.verify(),true);
 await g.shutdown();
});
test('32.4 renewal is denied after DB expiry without reviving old claim',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 f.advance(15001);
 assert.equal(await g.renew(),false);
 assert.equal(g.active,false);
 assert.equal(await g.verify(),false);
 const claimRows=f.history.filter(x=>x.sql===ACCOUNT_CLAIM_SQL_313);
 assert.equal(claimRows.length,1,'renew must not mint another UUID');
 await g.shutdown();
});
test('32.5 a replaced generation cannot renew or release the new worker',async()=>{
 const f=fixture(),a=await createPrivateAccountFence313(f.options());
 assert.equal(await a.acquire(),true);
 f.advance(16000);
 const b=await createPrivateAccountFence313(f.options());
 assert.equal(await b.acquire(),true);
 assert.equal(await a.renew(),false);
 assert.equal(await a.release(),false);
 assert.equal(await b.verify(),true);
 assert.equal(await b.renew(),true);
 await a.shutdown();await b.shutdown();
});
test('32.6 concurrent renewals are single-flight; SQL only runs once',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 f.pauseRenewal();
 const first=g.renew();await wait(()=>f.enteredRenew===1);
 assert.equal(await g.renew(),false);
 f.resumeRenewal();assert.equal(await first,true);
 assert.equal(f.history.filter(x=>x.sql===ACCOUNT_RENEW_SQL_323).length,1);
 await g.shutdown();
});
test('32.7 revoke original during pending renewal denies and releases claim',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 f.pauseRenewal();const pending=g.renew();await wait(()=>f.enteredRenew===1);
 f.revoke();f.resumeRenewal();assert.equal(await pending,false);
 assert.equal(g.active,false);assert.equal(await g.verify(),false);
 await g.shutdown();
});
test('32.7 explicit release during pending renewal does not resurrect account',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 f.pauseRenewal();const pending=g.renew();await wait(()=>f.enteredRenew===1);
 assert.equal(await g.release(),true);
 f.resumeRenewal();assert.equal(await pending,false);
 assert.equal(f.rows.get(scope.ownerId).active,false);
 await g.shutdown();
});
test('32.7 shutdown during blocked renewal waits for completion then releases',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 f.pauseRenewal();const pending=g.renew();await wait(()=>f.enteredRenew===1);
 const stopping=g.shutdown();f.resumeRenewal();
 assert.equal(await pending,false);assert.equal(await stopping,true);
 assert.equal(g.active,false);assert.equal(f.rows.get(scope.ownerId).active,false);
});
test('32.8 renewal cannot bypass original staging flag or clock rollback',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(await g.renew(),false)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(await g.renew(),false);await g.shutdown();
 const v=fixture(),w=await createPrivateAccountFence313(v.options());
 assert.equal(await w.acquire(),true);
 v.advance(-5);assert.equal(await w.renew(),false);await w.shutdown();
});
test('32.8 PG error during renewal triggers rollback and session denial',async()=>{
 const f=fixture(),g=await createPrivateAccountFence313(f.options());
 assert.equal(await g.acquire(),true);
 f.disconnect();assert.equal(await g.renew(),false);
 assert.equal(g.active,false);assert.ok(f.metrics.rollbacks>=1);
 await g.shutdown();
});
