import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivatePgLeaseGuard303} from '../privatePgLeaseGuard303.mjs';
import {createPrivatePgVerifiedGateway310} from '../privatePgVerifiedGateway310.mjs';
import {QUEST_SESSION_LOCK_SQL_183} from '../privateQuestTransactionFence183.mjs';

const T=1793720000000;
const nonce='11111111-1111-4111-8111-111111111111';
const actionId='qb174-'+'a'.repeat(64);
const frame=seq=>JSON.stringify({v:1,seq,op:'questbook.read'});
const poll=async fn=>{
 for(let i=0;i<100&&!fn();i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(fn(),'async SQL was not entered');
};
function fixture(){
 let time=T,active=true,pgActive=true,roleRestricted=true,rotation=false,
  throwQuery=false,badRow=false,revokeOnRead=false,revokeOnCommit=false,
  hangConnect=false,releaseConnect=null,pendingConnection=false,
  waitQuery=false,resolveQueries=[],readQueryEntered=0,
  issued=0,closed=0,committed=0,rolledBack=0,locked=0;
 const statements=[];
 const scope={ownerId:'owner312',characterId:'hero312',instanceId:'world-instance-312',
  instanceEpoch:'world-epoch-312',mapFingerprint:'d'.repeat(64)};
 const original={kind:'world-original'},request={kind:'private-upgrade'};
 const backend={transport:{kind:'transport'},reconnect:{kind:'reconnect'},read:{kind:'read'}};
 const lease=()=>({ownerId:scope.ownerId,characterId:scope.characterId,
  worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
  serverSessionId:'server-session-312',actionSessionId:actionId,
  leaseNonce:rotation?'22222222-2222-4222-8222-222222222222':nonce,
  expiresAtMs:T+60000});
 const stage={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return active&&serverRequestContext===original?lease():null}};
 const pairing={version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(ctx){return active&&Object.values(backend).includes(ctx)?{
   authenticated:true,identitySource:'trusted-server-session',
   accountId:scope.ownerId,characterId:scope.characterId,
   serverSessionId:'server-session-312',expiresAtMs:T+50000}:null},
  async resolveVerifiedBase44ActionSession(ctx){return active&&Object.values(backend).includes(ctx)?{
   authenticated:true,identitySource:'base44-verified-action-session-179',
   accountId:scope.ownerId,characterId:scope.characterId,
   worldSessionId:'server-session-312',actionSessionId:actionId,
   expiresAtMs:T+50000}:null},
  async verifySessionActive(){return active}};
 const db=()=>({async query(sql,params){
  statements.push({sql,params});
  if(sql.includes('FROM information_schema.columns')){
   const columns=['owner_id','character_id','world_instance_id','world_epoch',
    'world_session_id','action_session_id','lease_nonce','active',
    'expires_at','revoked_at','action_row_lock_183'];
   return {rowCount:columns.length,rows:columns.map(column_name=>({
    column_name,is_generated:column_name==='action_row_lock_183'?'ALWAYS':'NEVER',
    data_type:column_name==='action_row_lock_183'?'smallint':'text',
    can_update:column_name==='action_row_lock_183',
   }))};
  }
  if(sql.includes("current_setting('is_superuser')"))
   return {rowCount:1,rows:[{schema_name:'quest_staging',
    superuser:roleRestricted?'off':'on',can_select:true,
    dangerous:false,table_update:false}]};
  if(sql.startsWith('BEGIN'))return {rows:[],rowCount:0};
  if(sql.startsWith('SET LOCAL'))return {rows:[],rowCount:0};
  if(sql==='COMMIT'){committed++;if(revokeOnCommit)pgActive=false;return {rows:[],rowCount:0}};
  if(sql==='ROLLBACK'){rolledBack++;return {rows:[],rowCount:0}};
  if(sql===QUEST_SESSION_LOCK_SQL_183){
   readQueryEntered++;locked++;
   assert.deepEqual(params,[scope.ownerId,scope.characterId,
    scope.instanceId,scope.instanceEpoch,'server-session-312',actionId,nonce]);
   if(waitQuery)await new Promise(resolve=>resolveQueries.push(resolve));
   if(throwQuery)throw Error('PG network failure');
   if(revokeOnRead)pgActive=false;
   const l=lease();
   return {rowCount:pgActive?1:0,rows:pgActive?[{
    owner_id:badRow?'different':l.ownerId,character_id:l.characterId,
    world_instance_id:l.worldInstanceId,world_epoch:l.worldEpoch,
    world_session_id:l.serverSessionId,action_session_id:l.actionSessionId,
    lease_nonce:l.leaseNonce,active:pgActive,not_expired:true}]:[]};
  }
  throw Error('unexpected SQL: '+sql);
 },release(){closed++}});
 const pool={async connect(){issued++;
  if(hangConnect&&issued>=2){pendingConnection=true;
   await new Promise(resolve=>releaseConnect=resolve)}
  return db();}};
 const questTransport199={version:'19.9',privateServerOnly:true,
  publicRouteInstalled:false,transportBindingCreated:false,resumeCombatAuthorized:false,
  async attach({serverReconnectContext}){
   if(!active||serverReconnectContext!==backend.reconnect)return {ok:false};
   let stopped=false;
   return {ok:true,version:'19.9',transportBindingCreated:false,
    resumeCombatAuthorized:false,privateHandle:{
     get active(){return active&&!stopped},close(){stopped=true},
     async read({serverReadContext,frame}){
      if(!active||stopped||serverReadContext!==backend.read)return {ok:false};
      return {ok:true,operation:'questbook.snapshot',seq:frame.seq,
       staticReconnectSnapshot:true,transportBindingCreated:false,
       worldLeaseRestored:false,resumeCombatAuthorized:false,rewardsIssued:false,
       objectives:[{questId:'quest_312',objectiveId:'patrol',type:'kill',
        status:'accepted',current:1,required:3,dbSecret:'never leak'}]};
     }}};
  }};
 const verifyServerSession293=async req=>req===request&&active?{
  authenticated:true,identitySource:'original-base44-world-session-293',
  ownerId:scope.ownerId,characterId:scope.characterId,expiresAtMs:T+30000,
  serverTransportContext:backend.transport,
  serverReconnectContext:backend.reconnect,
  serverReadContext:backend.read}:null;
 const options=()=>({enabled:true,scope,serverRequestContext:original,
  pairing180:pairing,worldStage180:stage,questTransport199,
  verifyServerSession293,pool,schema:'quest_staging',now:()=>time,
  connectionTimeoutMs:100,lockTimeoutMs:100,statementTimeoutMs:250,
  timeoutMs:100,attestationTimeoutMs:100});
 return {pool,options,request,original,scope,backend,statements,
  get metrics(){return {issued,closed,committed,rolledBack,locked,readQueryEntered}},
  revokePg(){pgActive=false},revokeWorld(){active=false},rotate(){rotation=true},
  badRow(){badRow=true},badRole(){roleRestricted=false},throwQuery(){throwQuery=true},
  expire(){time=T+60001},rewind(){time=T-1},
  revokeDuringRead(){revokeOnRead=true},revokeDuringCommit(){revokeOnCommit=true},
  blockConnect(){hangConnect=true},releaseConnect(){hangConnect=false;releaseConnect?.()},
  blockQuery(){waitQuery=true},releaseQuery(){waitQuery=false;for(const resolve of resolveQueries.splice(0))resolve()}
 };
}
const originalFlag=process.env.GAME3D_PRIVATE_STAGING_ENV;
process.env.GAME3D_PRIVATE_STAGING_ENV='staging';

test('30.3 fails closed without explicit staging, restricted pool and schema',async()=>{
 await assert.rejects(createPrivatePgLeaseGuard303(),/30.3/);
 const f=fixture();await assert.rejects(createPrivatePgLeaseGuard303({...f.options(),schema:'public;drop'}),/30.3/);
 f.badRole();await assert.rejects(createPrivatePgLeaseGuard303(f.options()),/readiness denied/);
});
test('30.4 original 18.3 lock SELECT is parameterized and read-only in restricted role',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 assert.equal(await g.verify(),true);
 assert.equal(g.roleGranted,false);
 assert.equal(g.leaseIssued,false);
 assert.equal(g.publicRouteInstalled,false);
 assert.equal(f.metrics.committed,1);
 assert.equal(f.metrics.closed,2); // readiness and verifier releases
 assert.equal(f.statements.filter(x=>x.sql===QUEST_SESSION_LOCK_SQL_183).length,1);
 assert.equal(f.statements.some(x=>/^(?:INSERT|DELETE|UPDATE)\b/i.test(x.sql.trim())),false);
 assert.equal(g.shutdown(),true);assert.equal(g.shutdown(),false);
});
test('30.5 revoked or missing PG lease is refused without partial result',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 assert.equal(await g.verify(),true);f.revokePg();
 assert.equal(await g.verify(),false);
 assert.ok(f.metrics.rolledBack>=1);g.shutdown();
});
test('30.6 wrong PG identity and lease rotation are denied',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 f.badRow();assert.equal(await g.verify(),false);g.shutdown();
 const h=fixture(),j=await createPrivatePgLeaseGuard303(h.options());
 h.rotate();assert.equal(await j.verify(),false);j.shutdown();
});
test('30.7 failed PG SELECT triggers rollback, client release and safe retry',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 f.throwQuery();assert.equal(await g.verify(),false);
 assert.equal(f.metrics.rolledBack,1);assert.equal(f.metrics.closed,2);g.shutdown();
});
test('30.8 a pool connection timeout refuses and releases late client',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 f.blockConnect();assert.equal(await g.verify(),false);
 f.releaseConnect();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.metrics.closed,2);g.shutdown();
});
test('30.9 staged-only flag loss is irreversible, even if env restores',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 process.env.GAME3D_PRIVATE_STAGING_ENV='production';
 try{assert.equal(await g.verify(),false)}finally{process.env.GAME3D_PRIVATE_STAGING_ENV='staging'}
 assert.equal(await g.verify(),false);g.shutdown();
});
test('30.9 clock rollback and shutdown reject new read locks',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 assert.equal(await g.verify(),true);f.rewind();assert.equal(await g.verify(),false);g.shutdown();
 assert.equal(await g.verify(),false);
});
test('31.0 original 29.8 admission requires real PG lease before consuming reconnect',async()=>{
 const f=fixture(),g=await createPrivatePgVerifiedGateway310(f.options());
 const entry=await g.resolveBackendAdmission(f.request);
 assert.ok(entry);assert.equal(g.listenerInstalled,false);
 assert.equal(entry.ingress211.version,'21.1');
 const proof=await entry.authenticateUpgrade(f.request);assert.ok(proof);
 const bound=await entry.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext});
 assert.equal(bound.ok,true);
 const read=await entry.ingress211.receive({serverTransportContext:proof.serverTransportContext,
  rawFrame:frame(1)});
 assert.equal(read.ok,true);assert.equal(JSON.parse(read.payload).objectives[0].current,1);
 assert.equal(read.payload.includes('never leak'),false);g.shutdown();
});
test('31.0 PG revocation after admission denies private snapshot',async()=>{
 const f=fixture(),g=await createPrivatePgVerifiedGateway310(f.options());
 const entry=await g.resolveBackendAdmission(f.request);assert.ok(entry);
 const proof=await entry.authenticateUpgrade(f.request);assert.ok(proof);
 assert.equal((await entry.ingress211.bind({serverTransportContext:proof.serverTransportContext,
  serverReconnectContext:proof.serverReconnectContext})).ok,true);
 f.revokePg();
 const read=await entry.ingress211.receive({serverTransportContext:proof.serverTransportContext,
  rawFrame:frame(1)});
 assert.equal(read.ok,false);
 assert.equal(Object.hasOwn(read,'payload'),false);
 assert.equal(await entry.authenticateUpgrade(f.request),null);g.shutdown();
});
test('31.0 revoked PG lease before admission is not transformed into a trusted player',async()=>{
 const f=fixture(),g=await createPrivatePgVerifiedGateway310(f.options());
 f.revokePg();assert.equal(await g.resolveBackendAdmission(f.request),null);
 assert.equal(await g.resolveBackendAdmission(f.request),null);g.shutdown();
});
test('31.1 a world session revoked after PG read but before commit fails closed',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 f.blockQuery();const pending=g.verify();await poll(()=>f.metrics.readQueryEntered>=1);
 f.revokeWorld();f.releaseQuery();assert.equal(await pending,false);g.shutdown();
});
test('31.1 explicit shutdown during in-flight PG transaction cannot revive authority',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 f.blockQuery();const pending=g.verify();await poll(()=>f.metrics.readQueryEntered>=1);
 g.shutdown();f.releaseQuery();assert.equal(await pending,false);
});
test('31.1 two concurrent PG checks cap in-flight and close after verification',async()=>{
 const f=fixture(),g=await createPrivatePgLeaseGuard303(f.options());
 f.blockQuery();const a=g.verify(),b=g.verify();await poll(()=>f.metrics.readQueryEntered>=2);
 assert.equal(await g.verify(),false);
 f.releaseQuery();assert.deepEqual(await Promise.all([a,b]),[true,true]);g.shutdown();
});
test('31.2 always fail closed when no PostgreSQL client or world stage exists',async()=>{
 const f=fixture();await assert.rejects(createPrivatePgLeaseGuard303({...f.options(),pool:null}),/30.3/);
 await assert.rejects(createPrivatePgLeaseGuard303({...f.options(),worldStage180:null}),/19.1/);
});
