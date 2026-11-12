import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateCommittedQuestCredits152}
 from '../privateCommittedQuestCredits152.mjs';
import {createGame3DPrivateQuestTurnIn156}
 from '../privateQuestTurnIn156.mjs';
import {createGame3DPrivateEchoQuest165}
 from '../privateEchoQuest165.mjs';

const ownerId='owner184',characterId='hero184',
 starterId='axe_q_first_patrol',echoId='echo_ch_14_first_echo';
const actor={ownerId,characterId};
const allow=async()=>true;
function fakePG({killCount=0}={}){
 const statements=[];
 const db={async query(sql,params=[]){
  const text=sql.trim().replace(/\s+/g,' ');
  statements.push({text,params});
  if(text.startsWith('BEGIN')||text==='ROLLBACK'||text==='COMMIT')
   return {rowCount:0,rows:[]};
  if(text.includes('SELECT receipt_id,owner_id,character_id,instance_id'))
   return {rowCount:1,rows:[{receipt_id:'worldkill-test184',
    committed_at:new Date('2026-11-03T10:00:00Z'),
    enemy_id:'wolf_184',enemy_tier:'normal'}]};
  if(text.includes('SELECT quest_id,objective_id,required_count'))
   return {rowCount:1,rows:[{quest_id:starterId,objective_id:'patrol_kills',
    required_count:3}]};
  if(text.includes('SELECT COUNT(*)::integer AS n'))
   return {rowCount:1,rows:[{n:killCount}]};
  if(text.includes('INSERT INTO game3d_private_quest_kill_credit_152'))
   return {rowCount:1,rows:[{receipt_id:'worldkill-test184'}]};
  if(text.includes('SELECT owner_id,character_id FROM game3d_trusted_character'))
   return {rowCount:1,rows:[{owner_id:ownerId,character_id:characterId}]};
  if(text.includes('SELECT quest_id,status,catalog_revision,accepted_at,reward_authorized'))
   return {rowCount:1,rows:[{quest_id:starterId,status:'accepted',
    catalog_revision:'axe-private-pve-154-v1',accepted_at:new Date(),
    reward_authorized:false}]};
  if(text.includes('SELECT objective_id,objective_type,required_count'))
   return {rowCount:1,rows:[{objective_id:'patrol_kills',
    objective_type:'kill',required_count:3,enemy_tier:null,
    enemy_id:null,status:'accepted'}]};
  if(text.includes('UPDATE game3d_private_quest_objective_binding_152'))
   return {rowCount:1,rows:[{objective_id:'patrol_kills'}]};
  if(text.includes('UPDATE game3d_private_quest_acceptance_154'))
   return {rowCount:1,rows:[{quest_id:starterId,
    catalog_revision:'axe-private-pve-154-v1'}]};
  if(text.includes('INSERT INTO game3d_private_quest_turnin_156'))
   return {rowCount:1,rows:[{quest_id:starterId,completed_at:new Date()}]};
  if(text.includes('SELECT 1 FROM game3d_trusted_character'))
   return {rowCount:1,rows:[{x:1}]};
  if(text.includes('SELECT quest_id,status,catalog_revision,accepted_at,reward_issued,completed_at'))
   return {rowCount:1,rows:[{quest_id:echoId,
    status:'accepted',catalog_revision:'axe-private-echo-165-v1',
    accepted_at:new Date('2026-11-01T00:00:00Z'),
    reward_issued:false}]};
  if(text.includes('SELECT receipt_id,enemy_id,enemy_tier,committed_at AS observed_at'))
   return {rowCount:1,rows:[{receipt_id:'worldkill-test184',
    enemy_id:'wolf_184',enemy_tier:'normal',
    observed_at:new Date('2026-11-03T10:00:00Z')}]};
  if(text.includes('SELECT count(*)::int AS credited'))
   return {rowCount:1,rows:[{credited:2}]};
  if(text.includes('INSERT INTO game3d_private_echo_objective_credit_165'))
   return {rowCount:1,rows:[{receipt_id:'worldkill-test184'}]};
  if(text.includes('UPDATE game3d_private_echo_quest_165'))
   return {rowCount:1,rows:[{quest_id:echoId,completed_at:new Date()}]};
  if(text.includes('INSERT INTO game3d_private_echo_turnin_165'))
   return {rowCount:1,rows:[{quest_id:echoId}]};
  throw Error('Unrecognized private SQL: '+text);
 },release(){statements.push({text:'RELEASE'})}};
 return {pool:{connect:async()=>db},db,statements};
}
const number=(h,key)=>h.statements.filter(x=>x.text===key).length;
const writes=h=>h.statements.filter(x=>/^(UPDATE|INSERT) /.test(x.text)).length;
const fenceOnceThenRevoke=()=>{
 let calls=0,clients=[];
 return {call:async(db,req)=>{calls++;clients.push(db);
  return calls===1;},get calls(){return calls},get clients(){return clients}};
};
test('18.4 15.2 kill credit projection rolls back when session revoked after INSERT',async()=>{
 const h=fakePG(),f=fenceOnceThenRevoke();
 const service=createGame3DPrivateCommittedQuestCredits152({
  pool:h.pool,authorizeServerOperation:allow,transactionFence:f.call});
 const result=await service.project({...actor,receiptId:'worldkill-test184'});
 assert.equal(result.ok,false);
 assert.equal(result.killCreditCommitted,false);
 assert.equal(number(h,'COMMIT'),0);assert.equal(number(h,'ROLLBACK'),1);
 assert.equal(f.calls,2);assert.deepEqual(f.clients,[h.db,h.db]);
 assert(writes(h)>0);
});
test('18.4 15.2 session failure prevents reading kill receipt or writing credit',async()=>{
 const h=fakePG();
 const service=createGame3DPrivateCommittedQuestCredits152({
  pool:h.pool,authorizeServerOperation:allow,transactionFence:async()=>false});
 const result=await service.project({...actor,receiptId:'worldkill-test184'});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'private_world_objective_session_unverified');
 assert.equal(writes(h),0);assert.equal(number(h,'ROLLBACK'),1);
});
test('18.4 15.6 turn-in rolls back objective, quest status and journal on revocation',async()=>{
 const h=fakePG({killCount:3}),f=fenceOnceThenRevoke();
 const service=createGame3DPrivateQuestTurnIn156({
  pool:h.pool,authorizeServerOperation:allow,transactionFence:f.call});
 const result=await service.turnIn({...actor,questId:starterId});
 assert.equal(result.ok,false);
 assert.equal(result.questTurnInCommitted,false);
 assert.equal(result.rewardsIssued,false);
 assert.equal(number(h,'COMMIT'),0);assert.equal(number(h,'ROLLBACK'),1);
 assert.equal(f.calls,2);assert.deepEqual(f.clients,[h.db,h.db]);
 assert(writes(h)>=3);
});
test('18.4 starter quest turn-in only succeeds with same live session through COMMIT',async()=>{
 const h=fakePG({killCount:3});let verified=0;
 const service=createGame3DPrivateQuestTurnIn156({
  pool:h.pool,authorizeServerOperation:allow,
  transactionFence:async(db,req)=>{
   assert.equal(db,h.db);
   assert.equal(req.operation,'turn_in_private_server_quest');
   verified++;return true;
  }});
 const result=await service.turnIn({...actor,questId:starterId,
  claimGold:999999,clientKillCount:999999});
 assert.equal(result.ok,true);assert.equal(verified,2);
 assert.equal(result.questTurnInCommitted,true);
 assert.equal(result.rewardsIssued,false);
 assert.equal(number(h,'COMMIT'),1);
});
test('18.4 Echo kill receipt credit refuses late session revocation',async()=>{
 const h=fakePG(),f=fenceOnceThenRevoke();
 const echo=createGame3DPrivateEchoQuest165({
  pool:h.pool,authorizeServerOperation:allow,
  transactionFence:f.call});
 const result=await echo.credit({...actor,questId:echoId,
  receiptId:'worldkill-test184',kind:'kill'});
 assert.equal(result.ok,false);
 assert.equal(result.rewardsIssued,false);
 assert.equal(f.calls,2);assert.equal(number(h,'ROLLBACK'),1);
 assert.equal(number(h,'COMMIT'),0);
});
test('18.4 Echo quest turn-in journal is rolled back if world lease changed',async()=>{
 const h=fakePG(),f=fenceOnceThenRevoke();
 const echo=createGame3DPrivateEchoQuest165({
  pool:h.pool,authorizeServerOperation:allow,
  transactionFence:f.call});
 const result=await echo.turnIn({...actor,questId:echoId});
 assert.equal(result.ok,false);assert.equal(result.rewardsIssued,false);
 assert.equal(f.calls,2);assert.equal(number(h,'ROLLBACK'),1);
 assert.equal(number(h,'COMMIT'),0);
 assert(writes(h)>=2);
});
