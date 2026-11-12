import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateAccountHeartbeat330} from '../privateAccountHeartbeat330.mjs';
import {createPrivateAccountFencedGateway320} from '../privateAccountFencedGateway320.mjs';
import {ACCOUNT_CLAIM_SQL_313,ACCOUNT_VERIFY_SQL_313,ACCOUNT_RELEASE_SQL_313,
 ACCOUNT_RENEW_SQL_323} from '../privateAccountFence313.mjs';
import {fixture} from './helpers/privatePgFixture322.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const wait=async check=>{for(let i=0;i<120&&!check();i++)await new Promise(r=>setTimeout(r,10));assert.ok(check())};
function fakeAccount(){
 let row=null,denied=false,renewCount=0;
 const pool={async connect(){return {release(){},async query(sql,params=[]){
  if(sql.includes("current_setting('is_superuser')"))return {rowCount:1,rows:[{
    schema_name:'quest_staging',superuser:'off',fence_exists:true,
    can_select:true,can_insert:true,can_update:true,dangerous:false}]};
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rows:[],rowCount:0};
  if(sql===ACCOUNT_CLAIM_SQL_313){
   const [owner,character,instance,epoch,nonce]=params;
   if(row?.active)return {rowCount:0,rows:[]};
   row={owner_id:owner,character_id:character,world_instance_id:instance,
    world_epoch:epoch,claim_nonce:nonce,generation:1,active:true,not_expired:true};
   return {rowCount:1,rows:[row]};
  }
  if(sql===ACCOUNT_VERIFY_SQL_313){
   if(denied||!row||!row.active||params[1]!==row.claim_nonce)return {rows:[],rowCount:0};
   return {rows:[row],rowCount:1};
  }
  if(sql===ACCOUNT_RENEW_SQL_323){renewCount++;return denied?{rowCount:0,rows:[]}:{rowCount:1,rows:[row]}}
  if(sql===ACCOUNT_RELEASE_SQL_313){
   if(!row||!row.active||params[1]!==row.claim_nonce)return {rowCount:0,rows:[]};
   row.active=false;return {rowCount:1,rows:[{owner_id:row.owner_id}]};
  }
  throw Error('unexpected SQL');
 }}}};
 return {pool,deny(){denied=true},get renewCount(){return renewCount},get active(){return row?.active===true}};
}
const make=async (f,acct,extra={})=>createPrivateAccountFencedGateway320({
 ...f.options(),accountFencePool:acct.pool,verifyOriginalAccount313:async()=>true,
 ...extra});
const frame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});

test('33.3 rejects heartbeat with renewal deadline that can exceed the account TTL',()=>{
 assert.throws(()=>createPrivateAccountHeartbeat330({enabled:true,
  intervalMs:400,ttlMs:1000,renewTimeoutMs:700,
  renew:async()=>true,onFailure:()=>{}}),/32.9/);
});
test('33.4 heartbeat fails and shuts once after a forever-pending backend renewal',async()=>{
 let calls=0,shutdowns=0;
 const h=createPrivateAccountHeartbeat330({enabled:true,ttlMs:1000,
  intervalMs:100,renewTimeoutMs:100,renew:()=>{calls++;return new Promise(()=>{})},
  onFailure:()=>{shutdowns++}});
 assert.equal(h.start(),true);await wait(()=>shutdowns===1);
 assert.equal(h.snapshot().active,false);assert.equal(h.snapshot().failed,true);
 assert.equal(calls,1);assert.equal(h.snapshot().cycles,0);
});
test('33.5 late successful renewal response cannot reschedule a stopped heartbeat',async()=>{
 let resolveRenew,shutdowns=0,calls=0;
 const h=createPrivateAccountHeartbeat330({enabled:true,ttlMs:1000,
  intervalMs:100,renewTimeoutMs:100,renew:()=>{calls++;return new Promise(r=>{resolveRenew=r})},
  onFailure:()=>{shutdowns++}});
 h.start();await wait(()=>shutdowns===1);
 resolveRenew(true);await new Promise(r=>setTimeout(r,140));
 assert.equal(h.snapshot().cycles,0);assert.equal(calls,1);assert.equal(shutdowns,1);
});
test('33.6 loss of staging flag during a pending renewal prevents a successful cycle',async()=>{
 let resolveRenew,entered=false,shutdowns=0;
 const h=createPrivateAccountHeartbeat330({enabled:true,ttlMs:1500,
  intervalMs:100,renewTimeoutMs:200,renew:()=>{entered=true;return new Promise(r=>resolveRenew=r)},
  onFailure:()=>{shutdowns++}});
 h.start();await wait(()=>entered);
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{resolveRenew(true);await wait(()=>shutdowns===1)}
 finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(h.snapshot().active,false);assert.equal(h.snapshot().cycles,0);
});
test('33.7 gate refuses renewal until a real original upgrade proof exists',async()=>{
 const f=fixture(),a=fakeAccount(),g=await make(f,a);
 const admission=await g.resolveBackendAdmission(f.request);assert.ok(admission);
 assert.equal(await g.renewAccountClaim(),false);
 assert.equal(a.renewCount,0);
 await g.shutdown();
});
test('33.8 first original upgrade proof permits bind/read, but never double bind',async()=>{
 const f=fixture(),a=fakeAccount(),g=await make(f,a);
 try{
  const entry=await g.resolveBackendAdmission(f.request);assert.ok(entry);
  const p=await entry.authenticateUpgrade(f.request);assert.ok(p);
  const bindContext={serverTransportContext:p.serverTransportContext,
   serverReconnectContext:p.serverReconnectContext};
  assert.equal((await entry.ingress211.bind(bindContext)).ok,true);
  assert.equal((await entry.ingress211.bind(bindContext)).ok,false);
  const read=await entry.ingress211.receive({serverTransportContext:p.serverTransportContext,
   rawFrame:frame(1)});
  assert.equal(read.ok,true);
 }finally{await g.shutdown()}
});
test('33.9 no read before successful original 21.1 bind, but valid bind can follow',async()=>{
 const f=fixture(),a=fakeAccount(),g=await make(f,a);
 try{
  const entry=await g.resolveBackendAdmission(f.request);assert.ok(entry);
  const p=await entry.authenticateUpgrade(f.request);assert.ok(p);
  assert.equal((await entry.ingress211.receive({serverTransportContext:p.serverTransportContext,
   rawFrame:frame(1)})).ok,false);
  assert.equal((await entry.ingress211.bind({serverTransportContext:p.serverTransportContext,
   serverReconnectContext:p.serverReconnectContext})).ok,true);
 }finally{await g.shutdown()}
});
test('34.0 private gateway refuses renewed proof after account ownership is revoked',async()=>{
 const f=fixture(),a=fakeAccount(),g=await make(f,a);
 try{
  const entry=await g.resolveBackendAdmission(f.request);assert.ok(entry);
  assert.ok(await entry.authenticateUpgrade(f.request));
  a.deny();assert.equal(await entry.authenticateUpgrade(f.request),null);
  assert.equal(await g.renewAccountClaim(),false);
 }finally{await g.shutdown()}
});
test('34.1 original account fence rejects injected heartbeat timeout larger than TTL',async()=>{
 const f=fixture(),a=fakeAccount();
 await assert.rejects(make(f,a,{enableAutomaticRenewal:true,ttlMs:1000,
  heartbeatIntervalMs:100,heartbeatTimeoutMs:950}),/32.9/);
});
