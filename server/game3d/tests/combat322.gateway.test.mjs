import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateAccountFencedGateway320}
 from '../privateAccountFencedGateway320.mjs';
import {ACCOUNT_CLAIM_SQL_313,ACCOUNT_VERIFY_SQL_313,ACCOUNT_RELEASE_SQL_313,ACCOUNT_RENEW_SQL_323}
 from '../privateAccountFence313.mjs';
import {fixture} from './helpers/privatePgFixture322.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
function accountPool(){
 let row=null,closed=0,denied=false,expiresAt=Date.now()+30000,checks=0;
 const pool={async connect(){return {async query(sql,params=[]){
  if(sql.includes("current_setting('is_superuser')"))return {rowCount:1,rows:[{
   schema_name:'quest_staging',superuser:'off',fence_exists:true,
   can_select:true,can_insert:true,can_update:true,dangerous:false}]};
  if(sql==='BEGIN'||sql.startsWith('SET LOCAL')||sql==='COMMIT'||sql==='ROLLBACK')
   return {rowCount:0,rows:[]};
  if(sql===ACCOUNT_CLAIM_SQL_313){
   if(row?.active&&!denied)return {rowCount:0,rows:[]};
   const [owner,character,instance,epoch,nonce]=params;
   row={owner_id:owner,character_id:character,world_instance_id:instance,
    world_epoch:epoch,claim_nonce:nonce,generation:(row?.generation||0)+1,
    active:true,not_expired:true};denied=false;
   return {rowCount:1,rows:[{...row}]};
  }
  if(sql===ACCOUNT_RENEW_SQL_323){
   if(!row||denied||row.claim_nonce!==params[1]||row.generation!==params[2]||!row.active)
    return {rowCount:0,rows:[]};
   return {rowCount:1,rows:[{...row,not_expired:true}]};
  }
  if(sql===ACCOUNT_VERIFY_SQL_313){
   checks++;
   if(!row||denied||row.claim_nonce!==params[1]||row.generation!==params[2])
    return {rowCount:0,rows:[]};
   return {rowCount:1,rows:[{...row,not_expired:true}]};
  }
  if(sql===ACCOUNT_RELEASE_SQL_313){
   if(!row||row.claim_nonce!==params[1]||row.generation!==params[2]||!row.active)
    return {rowCount:0,rows:[]};
   row.active=false;return {rowCount:1,rows:[{owner_id:row.owner_id}]};
  }
  throw Error('unexpected account SQL');
 },release(){closed++}}}};
 return {pool,deny(){denied=true},
  get active(){return row?.active===true},get checks(){return checks}};
}
const frame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});
const make=async(f,account)=>createPrivateAccountFencedGateway320({
 ...f.options(),accountFencePool:account.pool,
 verifyOriginalAccount313:async()=>true,
});
test('32.0 original 31.0 PG Questbook is gated by second cross-worker claim',async()=>{
 const f=fixture(),account=accountPool(),g=await make(f,account);
 const a=await g.resolveBackendAdmission(f.request);
 assert.ok(a);
 assert.equal(g.version,'32.0');assert.equal(g.publicRouteInstalled,false);
 const p=await a.authenticateUpgrade(f.request);assert.ok(p);
 assert.equal((await a.ingress211.bind({serverTransportContext:p.serverTransportContext,
  serverReconnectContext:p.serverReconnectContext})).ok,true);
 const r=await a.ingress211.receive({serverTransportContext:p.serverTransportContext,
  rawFrame:frame(1)});
 assert.equal(r.ok,true);assert.equal(JSON.parse(r.payload).objectives[0].current,1);
 assert.equal(account.active,true);
 assert.equal(await g.shutdown(),true);assert.equal(account.active,false);
});
test('32.0 missing cross-worker claim fails before original reconnect is consumed',async()=>{
 const f=fixture(),account=accountPool();
 const g=await make(f,account);
 // Preexisting competing writer claim: the new worker must fail closed.
 const first=await g.resolveBackendAdmission(f.request);
 assert.ok(first);
 assert.equal(await g.resolveBackendAdmission(f.request),null);
 await g.shutdown();
});
test('32.1 original PG row valid but cross-worker fence revoked refuses read',async()=>{
 const f=fixture(),account=accountPool(),g=await make(f,account);
 const a=await g.resolveBackendAdmission(f.request);assert.ok(a);
 const p=await a.authenticateUpgrade(f.request);
 await a.ingress211.bind({serverTransportContext:p.serverTransportContext,
  serverReconnectContext:p.serverReconnectContext});
 account.deny();
 const r=await a.ingress211.receive({serverTransportContext:p.serverTransportContext,
  rawFrame:frame(1)});
 assert.equal(r.ok,false);assert.equal(Object.hasOwn(r,'payload'),false);
 assert.equal(await a.authenticateUpgrade(f.request),null);
 await g.shutdown();
});
test('32.2 explicit shutdown and revoke are idempotent',async()=>{
 const f=fixture(),account=accountPool(),g=await make(f,account);
 assert.ok(await g.resolveBackendAdmission(f.request));
 assert.equal(await g.shutdown(),true);assert.equal(await g.shutdown(),false);
 assert.equal(account.active,false);
 assert.equal(await g.resolveBackendAdmission(f.request),null);
});

test('32.8 server-only explicit renewal checks original session before and after PG CAS',async()=>{
 const f=fixture(),account=accountPool(),g=await make(f,account);
 assert.equal(await g.renewAccountClaim(),false);
 const a=await g.resolveBackendAdmission(f.request);assert.ok(a);
 const p=await a.authenticateUpgrade(f.request);assert.ok(p);
 assert.equal(await g.renewAccountClaim(),true);
 assert.equal(account.active,true);await g.shutdown();
});
test('32.8 revoked PG account blocks renewal and closes original gateway',async()=>{
 const f=fixture(),account=accountPool(),g=await make(f,account);
 const a=await g.resolveBackendAdmission(f.request);assert.ok(a);
 assert.ok(await a.authenticateUpgrade(f.request));
 account.deny();assert.equal(await g.renewAccountClaim(),false);
 assert.equal(await g.resolveBackendAdmission(f.request),null);
 await g.shutdown();
});
test('32.9 opt-in heartbeat starts after original one-use bind, never before',async()=>{
 const f=fixture(),account=accountPool();
 const g=await createPrivateAccountFencedGateway320({...f.options(),
  accountFencePool:account.pool,verifyOriginalAccount313:async()=>true,
  enableAutomaticRenewal:true,ttlMs:1000,heartbeatIntervalMs:100});
 try{
  const a=await g.resolveBackendAdmission(f.request);assert.ok(a);
  assert.equal(g.heartbeat.active,false);
  const p=await a.authenticateUpgrade(f.request);
  assert.equal((await a.ingress211.bind({serverTransportContext:p.serverTransportContext,
   serverReconnectContext:p.serverReconnectContext})).ok,true);
  assert.equal(g.heartbeat.active,true);
  for(let i=0;i<100&&(g.heartbeat?.cycles??0)<2;i++)
   await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(g.heartbeat?.cycles>=2);
  assert.equal(account.active,true);
 }finally{await g.shutdown()}
 assert.equal(g.heartbeat.active,false);
 assert.equal(account.active,false);
});
test('33.0 heartbeat closes gated Questbook after cross-worker revocation',async()=>{
 const f=fixture(),account=accountPool();
 const g=await createPrivateAccountFencedGateway320({...f.options(),
  accountFencePool:account.pool,verifyOriginalAccount313:async()=>true,
  enableAutomaticRenewal:true,ttlMs:1000,heartbeatIntervalMs:100});
 try{
  const a=await g.resolveBackendAdmission(f.request);assert.ok(a);
  const p=await a.authenticateUpgrade(f.request);
  assert.equal((await a.ingress211.bind({serverTransportContext:p.serverTransportContext,
   serverReconnectContext:p.serverReconnectContext})).ok,true);
  account.deny();
  for(let i=0;i<100&&g.heartbeat.active;i++)
   await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(g.heartbeat.active,false);
  const denied=await a.ingress211.receive({serverTransportContext:p.serverTransportContext,
   rawFrame:frame(1)});
  assert.equal(denied.ok,false);
 }finally{await g.shutdown()}
});
