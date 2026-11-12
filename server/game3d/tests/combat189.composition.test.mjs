import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestReconnectStaging189}
 from '../privateQuestReconnectStaging189.mjs';
import {RECONNECT_TICKET_READ_189}
 from '../privateReconnectBackend189.mjs';
import {RECONNECT_TICKET_ISSUE_SQL_188,RECONNECT_TICKET_CONSUME_SQL_188}
 from '../privateReconnectTicketLedger188.mjs';
import {GAME3D_RECOVERY_READ_SQL_186}
 from '../privateQuestRecovery186.mjs';
import {QUEST_SESSION_LOCK_SQL_183}
 from '../privateQuestTransactionFence183.mjs';

const at=1793668000000;
const authContext=Object.freeze({base44PrivateSession:'188-verified'});
const reconnectContext=Object.freeze({privateTransportSession:'188-verified'});
const worldContext=Object.freeze({originalWorld:'188-active'});
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
 expiresAtMs:at+90000,
});
const GAMEPLAY=[
 'game3d_trusted_character',
 'game3d_private_world_kill_receipt_152',
 'game3d_private_world_kill_lease_binding_185',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154',
 'game3d_private_quest_turnin_156',
];
const WRITABLE={
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id',
  'objective_id','reward_authorized',
 ],
 game3d_private_quest_turnin_156:[
  'owner_id','character_id','quest_id','catalog_revision',
  'source_kind','rewards_issued',
 ],
};
const UPDATABLE={
 game3d_trusted_character:['action_row_lock_176'],
 game3d_private_quest_objective_binding_152:['status','updated_at'],
 game3d_private_quest_acceptance_154:[
  'status','updated_at','action_row_lock_176',
 ],
 game3d_private_quest_session_fence_183:['action_row_lock_183'],
};
const PROJECTION_TABLES=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154','game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
];
function fixture({failStore=false,pgRevoked=false}={}){
 const state={tickets:new Map(),active:!pgRevoked,
  base44Active:true,worldLease:{...lease},
  storedTicket:null,issues:0,consumes:0,credits:0,progressReads:0,
  failStore,dbUnavailable:false,commands:[],stops:0,
 };
 const worldStage180={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===worldContext?state.worldLease:null;
  },
  async resolveQuestTransactionClaim183({ownerId,characterId,questId,sessionId}){
   return ownerId===scope.ownerId&&characterId===scope.characterId&&
    questId==='axe_q_first_patrol'&&
    sessionId===lease.actionSessionId?state.worldLease:null;
  },
 };
 function pool(role){
  return {async connect(){
   let ticketsTx=null;
   return {async query(sql,params=[]){
    state.commands.push({role,sql,params});
    if(state.dbUnavailable&&(
     sql===QUEST_SESSION_LOCK_SQL_183||
     sql===RECONNECT_TICKET_ISSUE_SQL_188||
     sql===RECONNECT_TICKET_CONSUME_SQL_188||
     sql===RECONNECT_TICKET_READ_189))
     throw Error('PG unavailable');
    const q=sql.replace(/\s+/g,' ').trim();
    if(q.includes('current_user AS role_name')){
     if(q.includes('AS db_name'))return {rowCount:1,rows:[{
      role_name:role,db_name:'g3d_188_disposable',
      schema_name:'quest_staging',
      server_addr:'127.0.0.1',server_port:5432,
      superuser:'off',pg_version:160000,in_recovery:false,
      bypass_rls:false,create_role:false,create_db:false,
      replication:false,schema_create:false,database_create:false,
     }]};
     return {rowCount:1,rows:[{
      schema_name:'quest_staging',superuser:'off',
      bypass_rls:false,can_create_role:false,can_create_db:false,
      replication_role:false,schema_create:false,
      database_create:false,
     }]};
    }
    if(q.includes('AS ticket_select')&&q.includes('AS lease_row_lock'))
     return {rowCount:1,rows:[{
      ticket_select:true,ticket_insert:role==='issuer',
      ticket_full_update:false,ticket_danger:false,
      ticket_consume:role==='consumer',
      ticket_id_update:false,ticket_owner_update:false,
      ticket_nonce_update:false,ticket_expiry_update:false,
      ticket_character_update:false,ticket_instance_update:false,
      ticket_epoch_update:false,ticket_world_session_update:false,
      ticket_action_session_update:false,ticket_source_update:false,
      ticket_issued_update:false,ticket_reward_update:false,
      lease_select:true,lease_row_lock:true,lease_mutate:false,
      lease_active_update:false,lease_nonce_update:false,
      lease_epoch_update:false,lease_world_session_update:false,
      lease_action_session_update:false,lease_expiry_update:false,
      lease_revoked_update:false,
     }]};
    if(q.includes('AS gameplay_mutate'))
     return {rowCount:GAMEPLAY.length,
      rows:GAMEPLAY.map(table_name=>({
       table_name,gameplay_mutate:false,
      }))};
    if(q.includes('information_schema.tables')){
     const names=[...PROJECTION_TABLES,
      'game3d_private_world_kill_lease_binding_185'];
     return {rowCount:names.length,
      rows:names.map(table_name=>({
       table_name,can_select:true,dangerous:false,
      }))};
    }
    if(q.includes('information_schema.columns')){
     const rows=PROJECTION_TABLES.flatMap(table_name=>[
      ...new Set(['owner_id','character_id',
       ...(WRITABLE[table_name]||[]),
       ...(UPDATABLE[table_name]||[])])
     ].map(column_name=>({
      table_name,column_name,
      can_update:(UPDATABLE[table_name]||[]).includes(column_name),
      can_insert:(WRITABLE[table_name]||[]).includes(column_name),
     })));
     return {rowCount:rows.length,rows};
    }
    if(q.includes("current_setting('server_version_num')"))
     return {rowCount:1,rows:[{
      schema_name:'quest_staging',pg_version:160000,
      can_select:true,can_mutate:false,
     }]};
    if(q.includes('FROM pg_constraint'))
     return {rowCount:2,rows:[
      {conname:'game3d_private_kill_receipt_binding_key_185',
       contype:'u',convalidated:true},
      {conname:'game3d_quest_kill_credit_bound_receipt_185',
       contype:'f',convalidated:true},
     ]};
    if(q.includes('FROM pg_trigger'))
     return {rowCount:1,rows:[{enabled:'O'}]};
    if(q.startsWith('BEGIN')){
     ticketsTx=new Map([...state.tickets].map(([k,v])=>[k,{...v}]));
     return {rowCount:0,rows:[]};
    }
    if(q==='ROLLBACK'){ticketsTx=null;return{rowCount:0,rows:[]}};
    if(q==='COMMIT'){
     if(!ticketsTx)throw Error('COMMIT without BEGIN');
     state.tickets=ticketsTx;ticketsTx=null;
     return {rowCount:0,rows:[]};
    }
    if(sql===QUEST_SESSION_LOCK_SQL_183)
     return {rowCount:1,rows:[{
      owner_id:lease.ownerId,character_id:lease.characterId,
      world_instance_id:lease.worldInstanceId,
      world_epoch:lease.worldEpoch,
      world_session_id:lease.serverSessionId,
      action_session_id:lease.actionSessionId,
      lease_nonce:state.worldLease.leaseNonce,
      active:state.active,not_expired:state.active,
     }]};
    if(sql===RECONNECT_TICKET_ISSUE_SQL_188){
     const id=params[0];
     (ticketsTx??state.tickets).set(id,{
      ticketId:id,ownerId:params[1],
      characterId:params[2],worldInstanceId:params[3],
      worldEpoch:params[4],worldSessionId:params[5],
      actionSessionId:params[6],leaseNonce:params[7],
      expiresAtMs:params[8],consumed:false,
     });
     state.issues++;
     return {rowCount:1,rows:[{ticket_id:id}]};
    }
    if(sql===RECONNECT_TICKET_READ_189){
     const rows=[...state.tickets.values()].filter(t=>
      !t.consumed&&t.expiresAtMs>at&&
      t.ownerId===params[0]&&t.characterId===params[1]&&
      t.worldInstanceId===params[2]&&t.worldEpoch===params[3]&&
      t.worldSessionId===params[4]&&t.actionSessionId===params[5]&&
      t.leaseNonce===params[6]).slice(0,2).map(t=>({
       ticket_id:t.ticketId,
       expires_at_ms:String(t.expiresAtMs),
      }));
     return {rowCount:rows.length,rows};
    }
    if(sql===RECONNECT_TICKET_CONSUME_SQL_188){
     const ticket=(ticketsTx??state.tickets).get(params[0]);
     if(!ticket||ticket.consumed||
        ticket.ownerId!==params[1]||
        ticket.characterId!==params[2]||
        ticket.worldInstanceId!==params[3]||
        ticket.worldEpoch!==params[4]||
        ticket.worldSessionId!==params[5]||
        ticket.actionSessionId!==params[6]||
        ticket.leaseNonce!==params[7])
      return {rowCount:0,rows:[]};
     ticket.consumed=true;state.consumes++;
     return {rowCount:1,rows:[{
      ticket_id:params[0],
      expires_at_ms:String(ticket.expiresAtMs),
     }]};
    }
    if(sql===GAME3D_RECOVERY_READ_SQL_186)
     return {rowCount:0,rows:[]};
    if(q.startsWith('SELECT o.quest_id,o.objective_id')){
     state.progressReads++;
     return {rowCount:1,rows:[{
      quest_id:'axe_q_first_patrol',objective_id:'patrol_kills',
      objective_type:'kill',enemy_tier:null,enemy_id:null,
      required_count:3,status:'accepted',credited:0,
     }]};
    }
    throw Error('unexpected SQL in 18.9 composition: '+q.slice(0,160));
   },release(){}};
  }};
 }
 const base44=()=>state.base44Active?{
  authenticated:true,
  identitySource:'base44-verified-action-session-179',
  accountId:scope.ownerId,characterId:scope.characterId,
  worldSessionId:lease.serverSessionId,
  actionSessionId:lease.actionSessionId,
  expiresAtMs:at+60000,
 }:null;
 const pairing180={
  version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  async resolveTrustedWorldPrincipal(ctx){
   if(!state.base44Active||!state.active||
      ![authContext,reconnectContext].includes(ctx))return null;
   return {authenticated:true,identitySource:'trusted-server-session',
    accountId:scope.ownerId,characterId:scope.characterId,
    serverSessionId:lease.serverSessionId,expiresAtMs:at+60000};
  },
  async resolveVerifiedBase44ActionSession(ctx){
   return state.base44Active&&state.active&&
    [authContext,reconnectContext].includes(ctx)?base44():null;
  },
  async verifySessionActive(claim){
   return state.base44Active&&state.active&&
    claim.ownerId===scope.ownerId&&
    claim.characterId===scope.characterId&&
    claim.instanceId===scope.instanceId&&
    claim.serverSessionId===lease.serverSessionId&&
    claim.actionSessionId===lease.actionSessionId;
  },
 };
 const config={
  enabled:true,pairing180,worldStage180,
  serverRequestContext:worldContext,scope,
  issuerPool:pool('issuer'),consumerPool:pool('consumer'),
  reconnectSchema:'quest_staging',
  progressionPool:pool('progression'),
  progressionSchema:'quest_staging',
  now:()=>at,
 };
 return {state,config};
}
async function staging(fn){
 const prior=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{process.env.GAME3D_PRIVATE_STAGING_ENV='staging';await fn()}
 finally{
  if(prior===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=prior;
 }
}
const auth=()=>({serverAuthContext:authContext});
const reconnect=()=>({serverReconnectContext:reconnectContext});

test('18.9 requires private staging and independently stored Base44 tickets',async()=>{
 await assert.rejects(createGame3DPrivateQuestReconnectStaging189(),
  /18\.9 requires/);
});
test('18.9 real composition issues a backend-only ticket and verifies read-only 18.7 reconnect',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateQuestReconnectStaging189(h.config);
  assert.equal(service.publicRouteInstalled,false);
  assert.equal(service.transportBindingCreated,false);
  const issued=await service.issue(auth());
  assert.equal(issued.ok,true);
  assert.equal(issued.credentialsDeliveredToBrowser,false);
  assert.equal('ticketId' in issued,false);
  assert.equal(h.state.issues,1);
  const result=await service.verifyReconnect(reconnect());
  assert.equal(result.ok,true);
  assert.equal(result.authenticatedReconnect,true);
  assert.equal(result.questProgressSynchronized,true);
  assert.equal(result.receiptsScanned,0);
  assert.equal(result.worldLeaseRestored,false);
  assert.equal(result.resumeCombatAuthorized,false);
  assert.equal(result.transportBindingCreated,false);
  assert.equal(result.rewardsIssued,false);
  assert.equal(h.state.consumes,1);
  assert.equal((await service.verifyReconnect(reconnect())).ok,false);
  assert.equal(h.state.consumes,1);
  service.shutdown();
 });
});
test('18.9 two independent private workers cannot consume one database ticket twice',async()=>{
 await staging(async()=>{
  const h=fixture();
  const a=await createGame3DPrivateQuestReconnectStaging189(h.config);
  const b=await createGame3DPrivateQuestReconnectStaging189(h.config);
  assert.equal((await a.issue(auth())).ok,true);
  assert.equal((await b.verifyReconnect(reconnect())).ok,true);
  assert.equal((await a.verifyReconnect(reconnect())).ok,false);
  assert.equal(h.state.tickets.size,1);
  assert.equal(h.state.consumes,1);
  a.shutdown();b.shutdown();
 });
});
test('18.9 wrong browser request fields and failed private ticket persistence are denied',async()=>{
 await staging(async()=>{
  const h=fixture();
  const service=await createGame3DPrivateQuestReconnectStaging189(h.config);
  h.state.dbUnavailable=true;
  const denied=await service.issue(auth());
  h.state.dbUnavailable=false;
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'trusted_ticket_not_stored');
  assert.equal('ticketId' in denied,false);
  assert.equal((await service.verifyReconnect({
   serverReconnectContext:reconnectContext,
   ownerId:'attacker188',
  })).ok,false);
  assert.equal(h.state.consumes,0);
  service.shutdown();
 });
});
test('18.9 logout and a replaced world nonce cannot reactivate the original transport',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateQuestReconnectStaging189(h.config);
  assert.equal((await service.issue(auth())).ok,true);
  h.state.active=false;
  assert.equal((await service.verifyReconnect(reconnect())).ok,false);
  h.state.active=true;
  h.state.worldLease={...lease,
   leaseNonce:'28818818-1881-4188-8188-188188188188'};
  assert.equal((await service.verifyReconnect(reconnect())).ok,false);
  assert.equal(h.state.consumes,0);
  service.shutdown();
 });
});
test('18.9 shutdown prevents new issuance and recovery without browser credentials',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await createGame3DPrivateQuestReconnectStaging189(h.config);
  assert.equal((await service.issue(auth())).ok,true);
  service.shutdown();
  assert.equal((await service.issue(auth())).ok,false);
  assert.equal((await service.verifyReconnect(reconnect())).ok,false);
  assert.equal(h.state.consumes,0);
 });
});
