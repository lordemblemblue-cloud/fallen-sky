import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateReconnectTicketLedger188,
 RECONNECT_TICKET_ISSUE_SQL_188,RECONNECT_TICKET_CONSUME_SQL_188}
 from '../privateReconnectTicketLedger188.mjs';
import {QUEST_SESSION_LOCK_SQL_183}
 from '../privateQuestTransactionFence183.mjs';

const now=1793668000000;
const serverWorld=Object.freeze({trustedWorld:'original-188'});
const authContext=Object.freeze({serverBase44Session:'verified-188'});
const reconnectContext=Object.freeze({privateTicketStore:'verified-188'});
const scope=Object.freeze({
 ownerId:'owner188',characterId:'hero188',
 instanceId:'world-instance-188',instanceEpoch:'world-epoch-188',
 mapFingerprint:'a'.repeat(64),
});
const lease=Object.freeze({
 ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-188',
 actionSessionId:'qb174-'+'c'.repeat(64),
 leaseNonce:'18818818-1881-4188-8188-188188188188',
 expiresAtMs:now+120000,
});
const principal=()=>({
 authenticated:true,identitySource:'base44-verified-action-session-179',
 accountId:scope.ownerId,characterId:scope.characterId,
 worldSessionId:lease.serverSessionId,
 actionSessionId:lease.actionSessionId,expiresAtMs:now+60000,
});
const gameplay=[
 'game3d_trusted_character',
 'game3d_private_world_kill_receipt_152',
 'game3d_private_world_kill_lease_binding_185',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_turnin_156',
];
const newId=()=>{
 let index=0;
 return ()=>String(18818818+index++).padStart(8,'0')+
  '-1881-4188-8188-188188188188';
};
function fixture({issuerPrivileged=false,badGrants=false,
 pgRevoked=false,base44Revoked=false,failPg=false}={}){
 const state={active:!pgRevoked,base44Active:!base44Revoked,
  claim:{...lease},tokens:new Map(),ticketId:null,
  inserts:0,consumes:0,rollbacks:0,commits:0,
  calls:[],failPg,
 };
 const domain='reconnect-staging';
 const rowsByRole=role=>({
  ticket_select:true,
  ticket_insert:role==='issuer',
  ticket_full_update:false,ticket_danger:false,
  ticket_consume:role==='consumer',
  ticket_id_update:false,ticket_owner_update:false,
  ticket_nonce_update:false,ticket_expiry_update:false,
  ticket_character_update:false,ticket_instance_update:false,
  ticket_epoch_update:false,ticket_world_session_update:false,
  ticket_action_session_update:false,ticket_source_update:false,
  ticket_issued_update:false,ticket_reward_update:false,
  lease_select:true,lease_row_lock:true,
  lease_mutate:false,lease_active_update:false,
  lease_nonce_update:false,lease_epoch_update:false,
  lease_world_session_update:false,lease_action_session_update:false,
  lease_expiry_update:false,lease_revoked_update:false,
  ...(badGrants&&role==='consumer'?{ticket_nonce_update:true}:{}),
 });
 const makePool=role=>({async connect(){
  let pending=null;
  return {async query(sql,params=[]){
   state.calls.push({role,sql,params});
   if(state.failPg&&(
    sql===QUEST_SESSION_LOCK_SQL_183||
    sql===RECONNECT_TICKET_ISSUE_SQL_188||
    sql===RECONNECT_TICKET_CONSUME_SQL_188))
    throw Error('disposable PG unavailable');
   const q=sql.replace(/\s+/g,' ').trim();
   if(q.includes('current_user AS role_name'))
    return {rowCount:1,rows:[{
     role_name:role,db_name:domain,schema_name:'quest_staging',
     server_addr:'127.0.0.1',server_port:5432,
     pg_version:160000,superuser:issuerPrivileged&&role==='issuer'?
      'on':'off',
     in_recovery:false,bypass_rls:false,
     create_role:false,create_db:false,replication:false,
     schema_create:false,database_create:false,
    }]};
   if(q.includes('ticket_select')&&q.includes('lease_row_lock'))
    return {rowCount:1,rows:[rowsByRole(role)]};
   if(q.includes('AS gameplay_mutate'))
    return {rowCount:gameplay.length,rows:gameplay.map(table_name=>({
     table_name,gameplay_mutate:false,
    }))};
   if(q.includes('FROM pg_trigger'))
    return {rowCount:1,rows:[{enabled:'O'}]};
   if(q.startsWith('BEGIN')){
    pending=new Map([...state.tokens].map(([k,v])=>[k,{...v}]));
    return {rowCount:0,rows:[]};
   }
   if(q==='ROLLBACK'){
    pending=null;state.rollbacks++;
    return {rowCount:0,rows:[]};
   }
   if(q==='COMMIT'){
    if(!pending)throw Error('COMMIT without transaction');
    state.tokens=pending;state.commits++;pending=null;
    return {rowCount:0,rows:[]};
   }
   if(sql===QUEST_SESSION_LOCK_SQL_183){
    const l=state.claim;
    return {rowCount:1,rows:[{
     owner_id:l.ownerId,character_id:l.characterId,
     world_instance_id:l.worldInstanceId,world_epoch:l.worldEpoch,
     world_session_id:l.serverSessionId,
     action_session_id:l.actionSessionId,lease_nonce:l.leaseNonce,
     active:state.active,not_expired:state.active,
    }]};
   }
   if(sql===RECONNECT_TICKET_ISSUE_SQL_188){
    assert.equal(role,'issuer');
    assert.equal(params[1],scope.ownerId);
    assert.equal(params[2],scope.characterId);
    const tickets=pending??state.tokens;
    const id=params[0];if(tickets.has(id))throw Error('duplicate UUID');
    tickets.set(id,{ticketId:id,ownerId:params[1],
     characterId:params[2],worldInstanceId:params[3],
     worldEpoch:params[4],worldSessionId:params[5],
     actionSessionId:params[6],leaseNonce:params[7],
     expiresAtMs:params[8],consumed:false,
    });
    state.inserts++;
    return {rowCount:1,rows:[{ticket_id:id}]};
   }
   if(sql===RECONNECT_TICKET_CONSUME_SQL_188){
    assert.equal(role,'consumer');
    const tickets=pending??state.tokens,record=tickets.get(params[0]);
    if(!record||record.consumed||
       record.expiresAtMs<=now||
       record.ownerId!==params[1]||
       record.characterId!==params[2]||
       record.worldInstanceId!==params[3]||
       record.worldEpoch!==params[4]||
       record.worldSessionId!==params[5]||
       record.actionSessionId!==params[6]||
       record.leaseNonce!==params[7])
     return {rowCount:0,rows:[]};
    record.consumed=true;state.consumes++;
    return {rowCount:1,rows:[{
     ticket_id:record.ticketId,
     expires_at_ms:String(record.expiresAtMs),
    }]};
   }
   throw Error('unexpected PG SQL: '+q.slice(0,130));
  },release(){}};
 }});
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===serverWorld?state.claim:null;
  },
 };
 const resolveTrustedBase44Action188=async(request)=>{
  const source=request.serverAuthContext??
   request.serverReconnectContext;
  return source&&(source===authContext||source===reconnectContext)&&
   state.base44Active?principal():null;
 };
 const resolveTrustedReconnectTicket188=async({
  serverReconnectContext,
 })=>serverReconnectContext===reconnectContext&&state.ticketId?
  {source:'trusted-backend-ticket-188',ticketId:state.ticketId}:null;
 const options={
  enabled:true,worldStage180,serverRequestContext:serverWorld,scope,
  issuerPool:makePool('issuer'),consumerPool:makePool('consumer'),
  schema:'quest_staging',
  resolveTrustedBase44Action188,resolveTrustedReconnectTicket188,
  now:()=>now,
 };
 return {state,options,reconnectContext,authContext};
}
const invokeIssue=service=>service.issue({serverAuthContext:authContext});
const invokeConsume=service=>service.consume({
 serverReconnectContext:reconnectContext,
});
async function staging(fn){
 const old=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn()}
 finally{
  if(old===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=old;
 }
}

test('18.8 refuses disabled, missing independent PG roles and unsafe Base44 sources',async()=>{
 await assert.rejects(createGame3DPrivateReconnectTicketLedger188(),
  /18\.8 requires/);
 await staging(async()=>{
  const h=fixture();
  await assert.rejects(createGame3DPrivateReconnectTicketLedger188({
   ...h.options,consumerPool:h.options.issuerPool,
  }),/18\.8 requires/);
  await assert.rejects(createGame3DPrivateReconnectTicketLedger188({
   ...h.options,resolveTrustedReconnectTicket188:null,
  }),/18\.8 requires/);
 });
});
test('18.8 server-issued ticket consumed once returns exact 18.7 private proof',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateReconnectTicketLedger188(h.options);
  assert.equal(service.privateServerOnly,true);
  assert.equal(service.publicRouteInstalled,false);
  assert.equal(service.credentialsDeliveredToBrowser,false);
  const issued=await invokeIssue(service);
  assert.equal(issued.ok,true);
  assert.equal(issued.credentialsDeliveredToBrowser,false);
  assert.equal(issued.expiresAtMs,now+15000);
  h.state.ticketId=issued.ticketId;
  const proof=await invokeConsume(service);
  assert.equal(proof.authenticated,true);
  assert.equal(proof.consumed,true);
  assert.equal(proof.identitySource,'base44-server-verified-reconnect-187');
  assert.equal(proof.reconnectId,issued.ticketId);
  assert.equal(proof.ownerId,scope.ownerId);
  assert.equal(proof.worldSessionId,lease.serverSessionId);
  assert.equal(proof.leaseNonce,lease.leaseNonce);
  assert.equal(proof.expiresAtMs,issued.expiresAtMs);
  assert.equal(await invokeConsume(service),null);
  assert.equal(h.state.tokens.get(issued.ticketId).consumed,true);
  assert.equal(h.state.tokens.size,1);
  assert.equal(h.state.consumes,1);
  service.shutdown();
 });
});
test('18.8 cross-worker ticket replay is refused from shared PostgreSQL state',async()=>{
 await staging(async()=>{
  const h=fixture();
  const a=await createGame3DPrivateReconnectTicketLedger188(h.options);
  const b=await createGame3DPrivateReconnectTicketLedger188(h.options);
  const issued=await invokeIssue(a);
  assert.equal(issued.ok,true);
  h.state.ticketId=issued.ticketId;
  assert.equal((await invokeConsume(b)).consumed,true);
  assert.equal(await invokeConsume(a),null);
  assert.equal(h.state.consumes,1);
  a.shutdown();b.shutdown();
 });
});
test('18.8 browser-supplied IDs cannot bypass backend-held reconnect context',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateReconnectTicketLedger188(h.options);
  const issued=await invokeIssue(service);
  assert.equal(issued.ok,true);
  h.state.ticketId=issued.ticketId;
  assert.equal(await service.consume({serverReconnectContext:{
   ticketId:issued.ticketId,
  }}),null);
  assert.equal(await service.consume({ticketId:issued.ticketId}),null);
  assert.equal(await service.consume({
   serverReconnectContext:reconnectContext,
   ownerId:scope.ownerId,
  }),null);
  assert.equal(h.state.consumes,0);
  service.shutdown();
 });
});
test('18.8 Base44 logout before issue or consumption refuses tickets',async()=>{
 await staging(async()=>{
  const h=fixture({base44Revoked:true});
  const service=await createGame3DPrivateReconnectTicketLedger188(h.options);
  const refused=await invokeIssue(service);
  assert.equal(refused.ok,false);
  assert.equal(refused.reason,'base44_session_unverified');
  service.shutdown();

  const other=fixture(),b=await createGame3DPrivateReconnectTicketLedger188(other.options);
  const issued=await invokeIssue(b);
  other.state.ticketId=issued.ticketId;
  other.state.base44Active=false;
  assert.equal(await invokeConsume(b),null);
  assert.equal(other.state.tokens.get(issued.ticketId).consumed,false);
  b.shutdown();
 });
});
test('18.8 PG logout/revoke and new world nonce refuse consumption without resetting ticket',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateReconnectTicketLedger188(h.options);
  const issued=await invokeIssue(service);
  h.state.ticketId=issued.ticketId;
  h.state.active=false;
  assert.equal(await invokeConsume(service),null);
  assert.equal(h.state.tokens.get(issued.ticketId).consumed,false);
  h.state.active=true;
  h.state.claim={...lease,
   leaseNonce:'28818818-1881-4188-8188-188188188188'};
  assert.equal(await invokeConsume(service),null);
  assert.equal(h.state.tokens.get(issued.ticketId).consumed,false);
  service.shutdown();
 });
});
test('18.8 PG unavailable and privileged reconnect database roles fail closed',async()=>{
 await staging(async()=>{
  const elevated=fixture({issuerPrivileged:true});
  await assert.rejects(createGame3DPrivateReconnectTicketLedger188(
   elevated.options),/privileged_or_unrelated_pg_roles/);
  const danger=fixture({badGrants:true});
  await assert.rejects(createGame3DPrivateReconnectTicketLedger188(
   danger.options),/unsafe_reconnect_or_world_lease_grants/);
  const h=fixture(),service=await createGame3DPrivateReconnectTicketLedger188(h.options);
  h.state.failPg=true;
  assert.equal((await invokeIssue(service)).ok,false);
  h.state.failPg=false;
  const issued=await invokeIssue(service);
  h.state.ticketId=issued.ticketId;
  h.state.failPg=true;
  assert.equal(await invokeConsume(service),null);
  assert.equal(h.state.tokens.get(issued.ticketId).consumed,false);
  service.shutdown();
 });
});
test('18.8 shutdown cannot issue new tickets or consume existing ones',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateReconnectTicketLedger188(h.options);
  const issued=await invokeIssue(service);
  h.state.ticketId=issued.ticketId;
  service.shutdown();
  assert.equal((await invokeIssue(service)).ok,false);
  assert.equal(await invokeConsume(service),null);
  assert.equal(h.state.tokens.get(issued.ticketId).consumed,false);
 });
});
