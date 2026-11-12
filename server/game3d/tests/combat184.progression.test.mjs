import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestProgression184}
 from '../privateQuestProgression184.mjs';

const now=1793668000000,questId='axe_q_first_patrol';
const context=Object.freeze({privateWorld:'trusted-backend-context-184'});
const killContext=Object.freeze({committedKill:'private-world-event-184'});
const killContextB=Object.freeze({committedKill:'private-world-event-184-b'});
const killContextC=Object.freeze({committedKill:'private-world-event-184-c'});
const lease=Object.freeze({
 ownerId:'owner184',characterId:'hero184',
 actionSessionId:'qb174-'+'a'.repeat(64),
 serverSessionId:'world-session-184',
 worldInstanceId:'world-instance-184',worldEpoch:'world-epoch-184',
 leaseNonce:'18418418-1841-4184-8184-184184184184',
 expiresAtMs:now+45000,
});
const receipt=Object.freeze({
 receiptId:'kill-receipt-184-01',ownerId:lease.ownerId,
 characterId:lease.characterId,worldInstanceId:lease.worldInstanceId,
 worldEpoch:lease.worldEpoch,leaseNonce:lease.leaseNonce,
 serverKillCommitted:true,sourceKind:'server-committed-private-pve-kill',
});
const receiptIds=[
 receipt.receiptId,'kill-receipt-184-02','kill-receipt-184-03',
];
const baseTables=[
 'game3d_trusted_character','game3d_private_world_kill_receipt_152',
 'game3d_private_quest_objective_binding_152',
 'game3d_private_quest_kill_credit_152',
 'game3d_private_quest_acceptance_154','game3d_private_quest_turnin_156',
 'game3d_private_quest_session_fence_183',
];
const allowedInserts={
 game3d_private_quest_kill_credit_152:[
  'receipt_id','owner_id','character_id','quest_id','objective_id',
  'reward_authorized',
 ],
 game3d_private_quest_turnin_156:[
  'owner_id','character_id','quest_id','catalog_revision','source_kind',
  'rewards_issued',
 ],
};
const allowedUpdates={
 game3d_trusted_character:['action_row_lock_176'],
 game3d_private_quest_objective_binding_152:['status','updated_at'],
 game3d_private_quest_acceptance_154:[
  'status','updated_at','action_row_lock_176',
 ],
 game3d_private_quest_session_fence_183:['action_row_lock_183'],
};
const allowedColumnRows=()=>baseTables.flatMap(table=>[
 ...new Set(['owner_id','character_id',
   ...(allowedInserts[table]||[]),...(allowedUpdates[table]||[])])
].map(column_name=>({
 table_name:table,column_name,
 can_update:(allowedUpdates[table]||[]).includes(column_name),
 can_insert:(allowedInserts[table]||[]).includes(column_name),
})));
const copy=x=>({
 credits:new Set(x.credits),headStatus:x.headStatus,
 objectiveStatus:x.objectiveStatus,journal:x.journal,
});
function fixture({onCredit=null,onJournal=null,forgedReceipt=null,
 ready=true}={}) {
 const state={active:true,credits:new Set(),headStatus:'accepted',
  objectiveStatus:'accepted',journal:0,commands:[],released:0,
  freshNpcTurnin:false,npcEventsConsumed:0};
 const pool={async connect(){
  let tx=null;
  return {
   async query(sql,params=[]){
    const query=sql.replace(/\s+/g,' ').trim();
    state.commands.push(query);
    if(query.includes('current_user AS role_name')){
     return {rowCount:1,rows:[{role_name:'quest_progression_184',
      schema_name:'quest_staging',superuser:'off',bypass_rls:false,
      can_create_role:false,can_create_db:false,replication_role:false,
      schema_create:false,database_create:false}]};
    }
    if(query.includes('information_schema.tables'))
     return {rowCount:baseTables.length,
      rows:baseTables.map(table_name=>({table_name,
       can_select:true,dangerous:false}))};
    if(query.includes('information_schema.columns'))
     return {rowCount:allowedColumnRows().length,
      rows:allowedColumnRows()};
    if(query.startsWith('BEGIN')){tx=copy(state);return {rowCount:0,rows:[]};}
    if(query==='ROLLBACK'){tx=null;return {rowCount:0,rows:[]};}
    if(query==='COMMIT'){
     if(!tx)throw Error('COMMIT without transaction');
     state.credits=tx.credits;state.headStatus=tx.headStatus;
     state.objectiveStatus=tx.objectiveStatus;state.journal=tx.journal;
     tx=null;return {rowCount:0,rows:[]};
    }
    const data=tx||state;
    if(query.includes('FROM game3d_private_quest_session_fence_183'))
     return {rowCount:1,rows:[{
      owner_id:lease.ownerId,character_id:lease.characterId,
      world_instance_id:lease.worldInstanceId,world_epoch:lease.worldEpoch,
      world_session_id:lease.serverSessionId,
      action_session_id:lease.actionSessionId,lease_nonce:lease.leaseNonce,
      active:state.active,not_expired:true,
     }]};
    if(query.includes('FROM game3d_private_world_kill_receipt_152'))
     return {rowCount:receiptIds.includes(params[0])?1:0,
      rows:receiptIds.includes(params[0])?[{
       receipt_id:params[0],owner_id:lease.ownerId,
       character_id:lease.characterId,enemy_tier:'normal',enemy_id:'wolf_1',
       committed_at:'2026-11-03T00:00:00Z',
      }]:[]};
    if(query.includes('FROM game3d_private_quest_objective_binding_152')&&
       query.includes("status='accepted'"))
     return {rowCount:data.objectiveStatus==='accepted'?1:0,
      rows:data.objectiveStatus==='accepted'?[{
       quest_id:questId,objective_id:'patrol_kills',required_count:3,
      }]:[]};
    if(query.startsWith('SELECT o.quest_id,o.objective_id,o.objective_type'))
     return {rowCount:1,rows:[{
      quest_id:questId,objective_id:'patrol_kills',
      objective_type:'kill',enemy_tier:null,enemy_id:null,
      required_count:3,status:data.objectiveStatus,
      credited:Math.min(3,data.credits.size),
     }]};
    if(query.includes('FROM game3d_private_quest_kill_credit_152'))
     return {rowCount:1,rows:[{n:data.credits.size}]};
    if(query.startsWith('INSERT INTO game3d_private_quest_kill_credit_152')){
     if(onCredit)onCredit(state);
     const had=data.credits.has(params[0]);
     if(!had)data.credits.add(params[0]);
     return {rowCount:had?0:1,rows:had?[]:[{receipt_id:params[0]}]};
    }
    if(query.includes('FROM game3d_trusted_character'))
     return {rowCount:1,rows:[{
      owner_id:lease.ownerId,character_id:lease.characterId,
     }]};
    if(query.includes('FROM game3d_private_quest_acceptance_154')&&
       query.includes('reward_authorized'))
     return {rowCount:1,rows:[{
      quest_id:questId,status:data.headStatus,
      catalog_revision:'axe-private-pve-154-v1',
      accepted_at:'2026-11-02T00:00:00Z',
      reward_authorized:false,
     }]};
    if(query.includes('FROM game3d_private_quest_objective_binding_152'))
     return {rowCount:1,rows:[{
      objective_id:'patrol_kills',objective_type:'kill',
      required_count:3,enemy_tier:null,enemy_id:null,
      status:data.objectiveStatus,
     }]};
    if(query.startsWith('UPDATE game3d_private_quest_objective_binding_152')){
     data.objectiveStatus='completed';
     return {rowCount:1,rows:[{objective_id:'patrol_kills'}]};
    }
    if(query.startsWith('UPDATE game3d_private_quest_acceptance_154')){
     data.headStatus='completed';
     return {rowCount:1,rows:[{
      quest_id:questId,catalog_revision:'axe-private-pve-154-v1',
     }]};
    }
    if(query.startsWith('INSERT INTO game3d_private_quest_turnin_156')){
     if(onJournal)onJournal(state);
     data.journal++;
     return {rowCount:1,rows:[{
      quest_id:questId,completed_at:'2026-11-03T12:00:00Z',
     }]};
    }
    throw Error('unexpected test SQL: '+query.slice(0,130));
   },
   release(){state.released++},
  };
 }};
 const worldStage180={
  version:'18.0',privateServerOnly:true,publicPlayerRouteInstalled:false,
  questActionWorldHost177:{
   async consumeServerNpcInteraction(request){
    if(!state.freshNpcTurnin||!state.active||
       request.ownerId!==lease.ownerId||
       request.characterId!==lease.characterId||
       request.sessionId!==lease.actionSessionId||
       request.questId!==questId||request.npcId!=='archer_lyra')
     return null;
    state.freshNpcTurnin=false;state.npcEventsConsumed++;
    return Object.freeze({
     source:'server-world-npc-event-177',consumed:true,
     actorAuthenticated:true,intent:'npc_interact',
     ownerId:lease.ownerId,characterId:lease.characterId,
     questId,npcId:'archer_lyra',actionSessionId:lease.actionSessionId,
     receiptId:'npc-turnin-184-'+state.npcEventsConsumed,
     worldInstanceId:lease.worldInstanceId,worldEpoch:lease.worldEpoch,
     worldTick:state.npcEventsConsumed,occurredAtMs:now,
    });
   },
   async readServerWorldSnapshot(request){
    return Object.freeze({
     source:'server-world-snapshot-177',serverAuthenticated:true,
     ownerId:lease.ownerId,characterId:lease.characterId,
     actionSessionId:lease.actionSessionId,npcId:'archer_lyra',
     npcSpawnVerified:true,worldInstanceId:lease.worldInstanceId,
     worldEpoch:lease.worldEpoch,worldTick:request.worldTick,
     player:Object.freeze({x:0,y:0,z:0}),
     npc:Object.freeze({x:2,y:0,z:0}),
    });
   },
   async verifyServerLineOfSight(request){
    return Object.freeze({
     source:'server-world-collision-177',visible:true,
     worldInstanceId:lease.worldInstanceId,
     worldEpoch:lease.worldEpoch,worldTick:request.worldTick,
    });
   },
  },
  async resolveCurrentWorldLease183({serverRequestContext}){
   return serverRequestContext===context&&state.active?lease:null;
  },
  async resolveQuestTransactionClaim183({ownerId,characterId,questId:q,sessionId}){
   return state.active&&ownerId===lease.ownerId&&
    characterId===lease.characterId&&q===questId&&
    sessionId===lease.actionSessionId?lease:null;
  },
  async verifyWorldActionSession(){return state.active},
 };
 const resolver=async({serverRequestContext,serverKillContext})=>{
  if(serverRequestContext!==context)return null;
  const index=[killContext,killContextB,killContextC]
   .indexOf(serverKillContext);
  if(index<0)return null;
  return forgedReceipt??Object.freeze({
   ...receipt,receiptId:receiptIds[index],
  });
 };
 return {state,pool,worldStage180,resolver};
}
async function start(h){
 return createGame3DPrivateQuestProgression184({
  enabled:true,progressionPool:h.pool,progressionSchema:'quest_staging',
  worldStage180:h.worldStage180,
  resolveTrustedCommittedKill:h.resolver,now:()=>now,
 });
}
const project={serverRequestContext:context,serverKillContext:killContext};
const turnin={serverRequestContext:context,questId};
async function staging(fn){
 const previous=process.env.GAME3D_PRIVATE_STAGING_ENV;
 try{
  process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
  await fn();
 }finally{
  if(previous===undefined)delete process.env.GAME3D_PRIVATE_STAGING_ENV;
  else process.env.GAME3D_PRIVATE_STAGING_ENV=previous;
 }
}
test('18.4 never instantiates an unauthenticated or unchecked private progress writer',async()=>{
 await assert.rejects(createGame3DPrivateQuestProgression184(),/18\.4 requires/);
});
test('18.4 projects one already committed server kill once, never duplicates XP or rewards',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await start(h);
  assert.equal(service.publicPlayerRouteInstalled,false);
  assert.equal(service.committedKillWriterInstalled,false);
  assert.equal(service.rewardWriterInstalled,false);
  const first=await service.projectCommittedKill(project);
  assert.equal(first.ok,true);
  assert.equal(first.killCreditCommitted,true);
  assert.equal(first.credited[0].count,1);
  assert.equal(first.rewardsIssued,false);
  const snapshot=await service.readProgress({serverRequestContext:context});
  assert.equal(snapshot.ok,true);
  assert.deepEqual(snapshot.objectives.map(x=>[
   x.questId,x.objectiveId,x.current,x.required,x.status,
  ]),[[questId,'patrol_kills',1,3,'accepted']]);
  assert.equal(snapshot.rewardsIssued,false);
  assert.equal(h.state.credits.size,1);
  const replay=await service.projectCommittedKill(project);
  assert.equal(replay.ok,true);
  assert.equal(replay.killCreditCommitted,false);
  assert.equal(replay.credited.length,0);
  assert.equal(h.state.credits.size,1);
  assert.equal(h.state.journal,0);
  service.shutdown();
 });
});
test('18.4 reward-free quest turn-in requires completed committed objective credits',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await start(h);
  assert.equal((await service.turnInQuest(turnin)).ok,false);
  assert.equal(h.state.journal,0);
  assert.equal((await service.projectCommittedKill(project)).ok,true);
  assert.equal((await service.turnInQuest(turnin)).ok,false);
  assert.equal((await service.projectCommittedKill({
   serverRequestContext:context,serverKillContext:killContextB,
  })).ok,true);
  assert.equal((await service.projectCommittedKill({
   serverRequestContext:context,serverKillContext:killContextC,
  })).ok,true);
  // A completed objective alone never allows turn-in from anywhere on
  // the map. The player must interact with the real server-held quest NPC.
  assert.equal((await service.turnInQuest(turnin)).ok,false);
  h.state.freshNpcTurnin=true;
  const completed=await service.turnInQuest(turnin);
  assert.equal(completed.ok,true);
  assert.equal(completed.questTurnInCommitted,true);
  assert.equal(completed.rewardsIssued,false);
  assert.equal(completed.rewardSettlementAuthorized,false);
  assert.equal(h.state.journal,1);
  h.state.freshNpcTurnin=true;
  assert.equal((await service.turnInQuest(turnin)).ok,false);
  assert.equal(h.state.journal,1);
  service.shutdown();
 });
});
test('18.4 denies foreign, forged and browser-supplied kill evidence',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await start(h);
  assert.equal((await service.projectCommittedKill({
   ...project,ownerId:'attacker184',
  })).ok,false);
  assert.equal((await service.projectCommittedKill({
   serverRequestContext:{},serverKillContext:killContext,
  })).ok,false);
  assert.equal((await service.projectCommittedKill({
   serverRequestContext:context,serverKillContext:{},
  })).ok,false);
  assert.equal(h.state.credits.size,0);
  service.shutdown();
 });
});
test('18.4 rejects old-world nonce even when signed-in account has not changed',async()=>{
 await staging(async()=>{
  const h=fixture({forgedReceipt:{
   ...receipt,leaseNonce:'11111111-1111-4111-8111-111111111111',
  }}),service=await start(h);
  const denied=await service.projectCommittedKill(project);
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'committed_server_kill_not_verified');
  assert.equal(h.state.credits.size,0);
  service.shutdown();
 });
});
test('18.4 a world revoke after credit INSERT rolls the whole credit transaction back',async()=>{
 await staging(async()=>{
  const h=fixture({onCredit:state=>{state.active=false}});
  const service=await start(h);
  const denied=await service.projectCommittedKill(project);
  assert.equal(denied.ok,false);
  assert.equal(h.state.credits.size,0);
  assert.equal(h.state.commands.includes('ROLLBACK'),true);
  service.shutdown();
 });
});
test('18.4 a world revoke after turn-in journal INSERT rolls the quest transaction back',async()=>{
 await staging(async()=>{
  const h=fixture({onJournal:state=>{state.active=false}});
  receiptIds.forEach(x=>h.state.credits.add(x));
  const service=await start(h);
  h.state.freshNpcTurnin=true;
  const denied=await service.turnInQuest(turnin);
  assert.equal(denied.ok,false);
  assert.equal(h.state.journal,0);
  assert.equal(h.state.headStatus,'accepted');
  assert.equal(h.state.objectiveStatus,'accepted');
  service.shutdown();
 });
});
test('18.4 fails closed after logout and after service shutdown',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await start(h);
  h.state.active=false;
  assert.equal((await service.readProgress({
   serverRequestContext:context,
  })).ok,false);
  assert.equal((await service.projectCommittedKill(project)).ok,false);
  assert.equal((await service.turnInQuest(turnin)).ok,false);
  service.shutdown();
  h.state.active=true;
  assert.equal((await service.projectCommittedKill(project)).ok,false);
  assert.equal(h.state.journal,0);
 });
});

test('18.4 failed progression database after startup cannot award or throw to the client',async()=>{
 await staging(async()=>{
  const h=fixture(),service=await start(h);
  h.pool.connect=async()=>{throw Error('private progression DB unavailable')};
  const projection=await service.projectCommittedKill(project);
  assert.equal(projection.ok,false);
  assert.equal(projection.reason,'committed_kill_database_unavailable');
  assert.equal((await service.readProgress({
   serverRequestContext:context,
  })).ok,false);
  h.state.freshNpcTurnin=true;
  const turninResult=await service.turnInQuest(turnin);
  assert.equal(turninResult.ok,false);
  assert.equal(turninResult.reason,'private_turnin_database_unavailable');
  assert.equal(h.state.credits.size,0);
  assert.equal(h.state.journal,0);
  service.shutdown();
 });
});
