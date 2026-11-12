import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateQuestReadFence343} from '../privateQuestReadFence343.mjs';
import {createPrivateAccountFencedGateway320} from '../privateAccountFencedGateway320.mjs';
import {ACCOUNT_CLAIM_SQL_313, ACCOUNT_VERIFY_SQL_313,
  ACCOUNT_RELEASE_SQL_313, ACCOUNT_RENEW_SQL_323} from '../privateAccountFence313.mjs';
import {fixture} from './helpers/privatePgFixture322.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const frame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});
function account(){
 let row=null,deny=false,checks=0,pending=null,releaseVerify=null,hang=false;
 const pool={async connect(){return {release(){},async query(sql,params=[]){
  if(sql.includes("current_setting('is_superuser')"))return {rowCount:1,rows:[{
   schema_name:'quest_staging',superuser:'off',fence_exists:true,
   can_select:true,can_insert:true,can_update:true,dangerous:false}]};
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))
   return {rows:[],rowCount:0};
  if(sql===ACCOUNT_CLAIM_SQL_313){
   if(row?.active)return {rowCount:0,rows:[]};
   const [owner,character,instance,epoch,nonce]=params;
   row={owner_id:owner,character_id:character,world_instance_id:instance,
    world_epoch:epoch,claim_nonce:nonce,generation:1,active:true,not_expired:true};
   return {rowCount:1,rows:[{...row}]};
  }
  if(sql===ACCOUNT_VERIFY_SQL_313){
   checks++;
   if(hang){await new Promise(resolve=>{releaseVerify=resolve});}
   if(!row||deny||!row.active||params[1]!==row.claim_nonce)return {rowCount:0,rows:[]};
   return {rowCount:1,rows:[{...row}]};
  }
  if(sql===ACCOUNT_RELEASE_SQL_313){
   if(!row||!row.active||params[1]!==row.claim_nonce)return {rowCount:0,rows:[]};
   row.active=false;return {rowCount:1,rows:[{owner_id:row.owner_id}]};
  }
  if(sql===ACCOUNT_RENEW_SQL_323)return {rowCount:0,rows:[]};
  throw Error('unexpected account statement');
 }}}};
 return {pool,deny(){deny=true},stall(){hang=true},release(){hang=false;releaseVerify?.()},
  get checks(){return checks},get active(){return row?.active===true}};
}
const wait=async check=>{for(let i=0;i<120&&!check();i++)await new Promise(r=>setTimeout(r,5));assert.ok(check())};
const create=async(f,a,options={})=>createPrivateAccountFencedGateway320({
 ...f.options(),accountFencePool:a.pool,verifyOriginalAccount313:async()=>true,
 ...options});
async function connected(options={}){
 const f=fixture(),a=account(),g=await create(f,a,options);
 const entry=await g.resolveBackendAdmission(f.request);assert.ok(entry);
 const proof=await entry.authenticateUpgrade(f.request);assert.ok(proof);
 const bind={serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext};
 assert.equal((await entry.ingress211.bind(bind)).ok,true);
 return {f,a,g,entry,proof,bind};
}
const request=(proof,seq)=>({serverTransportContext:proof.serverTransportContext,rawFrame:frame(seq)});

test('34.3 independent gate accepts only original server context and exact ordered read',()=>{
 const context={id:'original-context'},g=createPrivateQuestReadFence343({serverTransportContext:context});
 const first=g.begin({serverTransportContext:context,rawFrame:frame(1)});
 assert.ok(first);assert.equal(g.begin({serverTransportContext:context,rawFrame:frame(1)}),null);
 assert.equal(g.finish(first,true),true);
 assert.equal(g.snapshot().next,2);
 assert.equal(g.begin({serverTransportContext:context,rawFrame:frame(1)}),null);
 assert.equal(g.begin({serverTransportContext:{id:'clone'},rawFrame:frame(2)}),null);
 const second=g.begin({serverTransportContext:context,rawFrame:frame(2)});
 assert.equal(g.finish(second,true),true);
 assert.equal(g.close(),true);
 assert.equal(g.begin({serverTransportContext:context,rawFrame:frame(3)}),null);
});
test('34.4 strict frame parser denies extra fields, combat and oversized payload',()=>{
 const x={token:true},g=createPrivateQuestReadFence343({serverTransportContext:x});
 for(const raw of ['{bad',JSON.stringify({v:1,seq:1,op:'combat.attack'}),
  JSON.stringify({v:1,seq:1,op:'questbook.read',admin:true}),
  JSON.stringify({v:1,seq:1,op:'questbook.read',fill:'z'.repeat(300)}),
  JSON.stringify({v:1,seq:3,op:'questbook.read'})])
  assert.equal(g.begin({serverTransportContext:x,rawFrame:raw}),null);
 assert.ok(g.begin({serverTransportContext:x,rawFrame:frame(1)}));
});
test('34.5 a real private gateway permits two ordered sanitized snapshots',async()=>{
 const {g,entry,proof}=await connected();
 try{
  const first=await entry.ingress211.receive(request(proof,1));
  assert.equal(first.ok,true);assert.equal(JSON.parse(first.payload).seq,1);
  const second=await entry.ingress211.receive(request(proof,2));
  assert.equal(second.ok,true);assert.equal(JSON.parse(second.payload).seq,2);
  assert.equal(second.payload.includes('never leak'),false);
 }finally{await g.shutdown()}
});
test('34.6 duplicate sequence is rejected and closes original private session',async()=>{
 const {g,entry,proof}=await connected();
 assert.equal((await entry.ingress211.receive(request(proof,1))).ok,true);
 const denied=await entry.ingress211.receive(request(proof,1));
 assert.equal(denied.ok,false);assert.equal(Object.hasOwn(denied,'payload'),false);
 assert.equal((await entry.ingress211.receive(request(proof,2))).ok,false);
 await g.shutdown();
});
test('34.7 skipped sequence or cloned original context is permanently denied',async()=>{
 const {g,entry,proof}=await connected();
 const forged=await entry.ingress211.receive({serverTransportContext:{...proof.serverTransportContext},
  rawFrame:frame(1)});
 assert.equal(forged.ok,false);
 assert.equal((await entry.ingress211.receive(request(proof,1))).ok,false);
 await g.shutdown();
 const q=await connected();
 assert.equal((await q.entry.ingress211.receive(request(q.proof,2))).ok,false);
 await q.g.shutdown();
});
test('34.8 original bind rejects a substituted server reconnect context',async()=>{
 const f=fixture(),a=account(),g=await create(f,a);
 try{
  const entry=await g.resolveBackendAdmission(f.request);
  const proof=await entry.authenticateUpgrade(f.request);
  const answer=await entry.ingress211.bind({
   serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:{...proof.serverReconnectContext}});
  assert.equal(answer.ok,false);
  assert.equal((await entry.ingress211.receive(request(proof,1))).ok,false);
 }finally{await g.shutdown()}
});
test('34.9 database claim lost after a successful read denies subsequent progress',async()=>{
 const {a,g,entry,proof}=await connected();
 assert.equal((await entry.ingress211.receive(request(proof,1))).ok,true);
 a.deny();
 const denied=await entry.ingress211.receive(request(proof,2));
 assert.equal(denied.ok,false);assert.equal(Object.hasOwn(denied,'payload'),false);
 await g.shutdown();
});
test('35.0 hung restricted database verification hits deadline and cannot later succeed',async()=>{
 const {a,g,entry,proof}=await connected({operationTimeoutMs:100});
 a.stall();
 const pending=entry.ingress211.receive(request(proof,1));
 await wait(()=>a.checks>0);
 const denied=await pending;
 assert.equal(denied.ok,false);assert.equal(Object.hasOwn(denied,'payload'),false);
 a.release();await new Promise(r=>setImmediate(r));
 assert.equal((await entry.ingress211.receive(request(proof,1))).ok,false);
 await g.shutdown();
});
test('35.1 overlapping reads cannot both emit a duplicate snapshot',async()=>{
 const f=fixture(),a=account();
 const opts=f.options();
 const orig=opts.questTransport199;
 let entered=false,releaseRead;
 const slow={...orig,async attach(ctx){
  const res=await orig.attach(ctx);
  return {...res,privateHandle:{
   get active(){return res.privateHandle.active},
   close:()=>res.privateHandle.close(),
   async read(args){entered=true;await new Promise(r=>releaseRead=r);
    return res.privateHandle.read(args);}
  }};
 }};
 const g=await create(f,a,{questTransport199:slow,operationTimeoutMs:3000});
 try{
  const entry=await g.resolveBackendAdmission(f.request),proof=await entry.authenticateUpgrade(f.request);
  assert.equal((await entry.ingress211.bind({serverTransportContext:proof.serverTransportContext,
   serverReconnectContext:proof.serverReconnectContext})).ok,true);
  const first=entry.ingress211.receive(request(proof,1));
  await wait(()=>entered);
  const duplicate=await entry.ingress211.receive(request(proof,1));
  assert.equal(duplicate.ok,false);
  releaseRead();
  const after=await first;assert.equal(after.ok,false);
  assert.equal(Object.hasOwn(after,'payload'),false);
 }finally{releaseRead?.();await g.shutdown()}
});
test('35.2 rejected read frames never enable combat or rewards',async()=>{
 const {g,entry,proof}=await connected();
 try{
  const denied=await entry.ingress211.receive({serverTransportContext:proof.serverTransportContext,
   rawFrame:JSON.stringify({v:1,seq:1,op:'combat.attack'})});
  assert.equal(denied.ok,false);
  assert.equal(denied.resumeCombatAuthorized,false);
  assert.equal(denied.rewardsIssued,false);
 }finally{await g.shutdown()}
});
