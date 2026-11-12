import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame3DPrivateQuestReceiptReconciler843, GAME3D_RECONCILE_PAGE_LIMIT_843}
 from '../privateQuestReceiptReconciler843.mjs';

process.env.GAME3D_PRIVATE_STAGING_ENV='staging';
const scope={ownerId:'owner843',characterId:'hero843',
 instanceId:'world-instance-843',instanceEpoch:'world-epoch-843',
 mapFingerprint:'f'.repeat(64)};
const context=Object.freeze({server:'private-843'});
const lease={ownerId:scope.ownerId,characterId:scope.characterId,
 worldInstanceId:scope.instanceId,worldEpoch:scope.instanceEpoch,
 serverSessionId:'world-session-843',actionSessionId:'qb174-'+'a'.repeat(64),
 leaseNonce:'84384384-8438-4438-8438-843843843843',
 expiresAtMs:2000000};
const receipt=n=>'worldkill-'+n.toString(16).padStart(64,'0');
const row=(n,changes={})=>({
 receipt_id:receipt(n),owner_id:scope.ownerId,character_id:scope.characterId,
 instance_id:scope.instanceId,instance_epoch:scope.instanceEpoch,
 map_fingerprint:scope.mapFingerprint,event_seq:String(n),
 enemy_id:'wolf_'+n,enemy_tier:'normal',
 receipt_source:'server-committed-private-pve-kill',
 server_kill_committed:true,binding_receipt_id:receipt(n),
 binding_owner_id:scope.ownerId,binding_character_id:scope.characterId,
 binding_instance_id:scope.instanceId,
 binding_instance_epoch:scope.instanceEpoch,
 binding_map_fingerprint:scope.mapFingerprint,binding_event_seq:String(n),
 binding_server_session_id:lease.serverSessionId,
 binding_action_session_id:lease.actionSessionId,
 binding_lease_nonce:lease.leaseNonce,
 binding_source:'15.3-server-committed-18.5-lease',
 binding_reward_authorized:false,...changes,
});
const lock=()=>({
 owner_id:lease.ownerId,character_id:lease.characterId,
 world_instance_id:lease.worldInstanceId,world_epoch:lease.worldEpoch,
 world_session_id:lease.serverSessionId,
 action_session_id:lease.actionSessionId,lease_nonce:lease.leaseNonce,
 active:true,not_expired:true,
});
function fixture({rows=[row(1)],projectOverride=null,readOverride=null}={}){
 const state={rows,alive:true,lease:{...lease},journal:new Set(),
  calls:[],releases:0,projection:0};
 const pool={async connect(){return {
  async query(sql,args=[]){
   const q=sql.replace(/\s+/g,' ').trim();state.calls.push(q);
   if(q.startsWith('BEGIN')||q==='COMMIT'||q==='ROLLBACK')
    return {rowCount:0,rows:[]};
   if(q.includes('FROM game3d_private_quest_session_fence_183')){
    const l=lock();l.active=state.alive;
    return {rowCount:1,rows:[l]};
   }
   if(q.includes('LEFT JOIN game3d_private_world_kill_lease_binding_185')){
    const data=state.rows.filter(r=>Number(r.event_seq)>args[5]).slice(0,17);
    return {rowCount:data.length,rows:data};
   }
   throw Error('Unexpected SQL '+q.slice(0,70));
  },release(){state.releases++},
 }}};
 const stage={version:'18.0',privateServerOnly:true,
  publicPlayerRouteInstalled:false,
  async resolveCurrentWorldLease183({serverRequestContext}){
   return state.alive&&serverRequestContext===context?state.lease:null;
  }};
 const reconcile=createGame3DPrivateQuestReceiptReconciler843({
  pool,scope,worldStage180:stage,serverRequestContext:context,
  enabled:true,now:()=>1000000,isStopped:()=>!state.alive,
  resolveServerKillContext:async ({serverRequestContext,persistedReceipt})=>{
   assert.equal(serverRequestContext,context);
   return {id:persistedReceipt.receiptId};
  },
  projectCommittedKill:async ({serverRequestContext,serverKillContext})=>{
   assert.equal(serverRequestContext,context);
   const id=serverKillContext.id;
   state.projection++;
   if(projectOverride)return projectOverride(state,id);
   const newlyCredited=!state.journal.has(id);
   state.journal.add(id);
   return {ok:true,receiptId:id,
    credited:newlyCredited?[{questId:'axe_q_first_patrol',objectiveId:'patrol_kills'}]:[],
    rewardAuthorized:false,rewardsIssued:false,questTurnInCommitted:false};
  },
  readProgress:async ({serverRequestContext})=>{
   assert.equal(serverRequestContext,context);
   return readOverride?readOverride(state):{
    ok:true,objectives:[{questId:'axe_q_first_patrol',
     objectiveId:'patrol_kills',current:state.journal.size,required:3}],
    rewardAuthorized:false,rewardsIssued:false};
  },
 });
 return {state,reconcile};
}

test('84.3 scans 16 committed receipts then advances by server event sequence',async()=>{
 const h=fixture({rows:Array.from({length:18},(_,i)=>row(i+1))});
 const first=await h.reconcile.reconcile();
 assert.equal(first.ok,true);assert.equal(first.processedReceipts,16);
 assert.equal(first.hasMore,true);assert.equal(first.nextEventSeq,16);
 assert.equal(first.newCredits.length,16);
 const next=await h.reconcile.reconcile({afterEventSeq:first.nextEventSeq});
 assert.equal(next.ok,true);assert.equal(next.processedReceipts,2);
 assert.equal(next.hasMore,false);assert.equal(next.nextEventSeq,18);
 assert.equal(h.state.releases,2);
 assert.equal(h.state.journal.size,18);
});

test('84.3 replays from zero after lost cursor without duplicate quest credits',async()=>{
 const h=fixture({rows:[row(1),row(2),row(3)]});
 const initial=await h.reconcile.reconcile();
 const replay=await h.reconcile.reconcile();
 assert.equal(initial.newCredits.length,3);
 assert.equal(replay.ok,true);assert.equal(replay.newCredits.length,0);
 assert.equal(h.state.journal.size,3);
 assert.equal(replay.nextEventSeq,3);
});

test('84.3 no receipts reads progress and preserves the starting cursor',async()=>{
 const h=fixture({rows:[]});
 const r=await h.reconcile.reconcile({afterEventSeq:7});
 assert.equal(r.ok,true);assert.equal(r.nextEventSeq,7);
 assert.equal(r.processedReceipts,0);assert.equal(r.hasMore,false);
 assert.equal(r.objectives.length,1);
});

test('84.3 refuses missing or old-world binding instead of skipping it',async()=>{
 for(const bad of [
  {binding_receipt_id:null},
  {binding_lease_nonce:'74384384-8438-4438-8438-843843843843'},
  {binding_owner_id:'other'},
  {binding_reward_authorized:true},
 ]){
  const h=fixture({rows:[row(1,bad)]});
  const r=await h.reconcile.reconcile();
  assert.equal(r.ok,false);assert.equal(r.processedReceipts,0);
  assert.equal(r.retryFromEventSeq,0);assert.equal(h.state.projection,0);
 }
});

test('84.3 rejects unsorted, duplicate and forged receipt sequences',async()=>{
 for(const rows of [[row(2),row(1)],[row(1),row(1)],
  [row(1,{event_seq:'1.5'})]]){
  const h=fixture({rows});
  const result=await h.reconcile.reconcile();
  assert.equal(result.ok,false);assert.equal(h.state.projection,0);
 }
});

test('84.3 reports partial independent credits and a safe retry cursor',async()=>{
 let calls=0;
 const h=fixture({rows:[row(1),row(2)],projectOverride:async(state,id)=>{
  calls++;
  if(calls===2)throw Error('connection died after a committed credit');
  state.journal.add(id);
  return {ok:true,receiptId:id,credited:[{count:1}],
   rewardsIssued:false,rewardAuthorized:false,questTurnInCommitted:false};
 }});
 const r=await h.reconcile.reconcile();
 assert.equal(r.ok,false);assert.equal(r.processedReceipts,1);
 assert.equal(r.partialProjection,true);assert.equal(r.retryFromEventSeq,0);
 assert.equal(h.state.journal.size,1);
});

test('84.3 stops after world logout and never advances a cursor',async()=>{
 const h=fixture({rows:[row(1),row(2)],projectOverride:async(state,id)=>{
  state.alive=false;
  return {ok:true,receiptId:id,credited:[],rewardsIssued:false,
   rewardAuthorized:false,questTurnInCommitted:false};
 }});
 const result=await h.reconcile.reconcile();
 assert.equal(result.ok,false);assert.equal(result.processedReceipts,1);
 assert.equal(result.retryFromEventSeq,0);
});

test('84.3 rejects forged projection IDs and reward-authorized credits',async()=>{
 for(const response of [
  {ok:true,receiptId:receipt(99),credited:[],
   rewardAuthorized:false,rewardsIssued:false,questTurnInCommitted:false},
  {ok:true,receiptId:receipt(1),credited:[],
   rewardAuthorized:true,rewardsIssued:false,questTurnInCommitted:false},
 ]){
  const h=fixture({projectOverride:async()=>response});
  assert.equal((await h.reconcile.reconcile()).ok,false);
 }
});

test('84.3 ambiguous first projection may have committed even without a response',async()=>{
 const h=fixture({projectOverride:async()=>{throw Error('timeout after commit')}});
 const r=await h.reconcile.reconcile();
 assert.equal(r.ok,false);assert.equal(r.processedReceipts,0);
 assert.equal(r.partialProjection,true);assert.equal(r.retryFromEventSeq,0);
});

test('84.3 rejects cursor tampering, bad staging and stale lease',async()=>{
 const h=fixture();
 for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER+1]){
  const r=await h.reconcile.reconcile({afterEventSeq:value});
  assert.equal(r.ok,false);
 }
 h.state.lease={...lease,leaseNonce:'74384384-8438-4438-8438-843843843843'};
 assert.equal((await h.reconcile.reconcile()).ok,false);
 assert.throws(()=>createGame3DPrivateQuestReceiptReconciler843(),
  /trusted, fenced private staging/);
 assert.equal(GAME3D_RECONCILE_PAGE_LIMIT_843,16);
});

test('84.3 composes only under original private progression and no public route',()=>{
 const source=readFileSync(new URL('../privateQuestProgression185.mjs',import.meta.url),'utf8');
 assert.match(source,/createGame3DPrivateQuestReceiptReconciler843/);
 assert.match(source,/reconcileCommittedKills:/);
 assert.match(source,/resolveServerKillContext843/);
 assert.doesNotMatch(source,/app\.post\(/);
});
