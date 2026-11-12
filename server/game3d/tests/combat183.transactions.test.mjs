import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame3DPrivateQuestAcceptance154}
 from '../privateQuestAcceptance154.mjs';
import {createGame3DPrivateEchoQuest165}
 from '../privateEchoQuest165.mjs';

const account={ownerId:'owner183',characterId:'hero183'};
const starter='axe_q_first_patrol',echo='echo_ch_14_first_echo';
function fakeWriter(){
 const commands=[];
 const db={async query(sql,values=[]){
  const normalized=sql.trim().replace(/\s+/g,' ');
  commands.push({sql:normalized,values});
  if(normalized.startsWith('BEGIN')||normalized==='COMMIT'||
     normalized==='ROLLBACK')return {rowCount:0,rows:[]};
  if(normalized.includes('SELECT owner_id,character_id,xp_total::text'))
   return {rowCount:1,rows:[{owner_id:account.ownerId,
    character_id:account.characterId,xp_total:'0'}]};
  if(normalized.includes('SELECT 1 FROM game3d_trusted_character'))
   return {rowCount:1,rows:[{x:1}]};
  if(normalized.includes('SELECT t.quest_id FROM game3d_private_quest_turnin_156'))
   return {rowCount:1,rows:[{quest_id:starter}]};
  if(normalized.includes('SELECT quest_id,status,catalog_revision'))
   return {rowCount:0,rows:[]};
  if(normalized.includes('SELECT quest_id,status,catalog_revision,accepted_at'))
   return {rowCount:0,rows:[]};
  if(normalized.includes('INSERT INTO game3d_private_quest_acceptance_154'))
   return {rowCount:1,rows:[{quest_id:starter,accepted_at:new Date()}]};
  if(normalized.includes('INSERT INTO game3d_private_quest_objective_binding_152'))
   return {rowCount:1,rows:[{}]};
  if(normalized.includes('INSERT INTO game3d_private_echo_quest_165'))
   return {rowCount:1,rows:[{quest_id:echo}]};
  throw Error('Unexpected SQL: '+normalized);
 },release(){commands.push({sql:'RELEASE',values:[]})}};
 return {pool:{connect:async()=>db},commands,db};
}
const called=(h,prefix)=>h.commands.filter(x=>x.sql.startsWith(prefix)).length;
const acceptStarter=(h,transactionFence)=>createGame3DPrivateQuestAcceptance154({
 pool:h.pool,authorizeServerOperation:async()=>true,transactionFence
}).accept({...account,questId:starter});
const acceptEcho=(h,transactionFence)=>createGame3DPrivateEchoQuest165({
 pool:h.pool,authorizeServerOperation:async()=>true,transactionFence
}).accept({...account,questId:echo});

test('18.3 starter acceptance holds the SAME transaction client before and after inserts',async()=>{
 const h=fakeWriter(),clients=[],ops=[];
 const outcome=await acceptStarter(h,async(db,ctx)=>{
  clients.push(db);ops.push(ctx.operation);return true;
 });
 assert.equal(outcome.ok,true);
 assert.equal(called(h,'COMMIT'),1);
 assert.equal(called(h,'ROLLBACK'),0);
 assert.equal(clients.length,2);assert.equal(clients[0],h.db);
 assert.equal(clients[1],h.db);
 assert.deepEqual(ops,['accept_private_server_quest','accept_private_server_quest']);
 const firstCheck=h.commands.findIndex(x=>x.sql.startsWith('SELECT owner_id,character_id'));
 const lastInsert=h.commands.findLastIndex(x=>x.sql.includes('INSERT INTO'));
 const commit=h.commands.findIndex(x=>x.sql==='COMMIT');
 assert(firstCheck<lastInsert&&lastInsert<commit);
 assert.equal(outcome.rewardAuthorized,false);
});

test('18.3 starter denial before inserts rolls back with zero progress',async()=>{
 const h=fakeWriter();
 const outcome=await acceptStarter(h,async()=>false);
 assert.equal(outcome.ok,false);
 assert.equal(called(h,'ROLLBACK'),1);assert.equal(called(h,'COMMIT'),0);
 assert.equal(h.commands.filter(x=>x.sql.includes('INSERT INTO')).length,0);
});
test('18.3 starter revocation after objective insert rolls the whole acceptance back',async()=>{
 const h=fakeWriter();let checks=0;
 const outcome=await acceptStarter(h,async()=>++checks===1);
 assert.equal(outcome.ok,false);assert.equal(checks,2);
 assert.equal(called(h,'ROLLBACK'),1);assert.equal(called(h,'COMMIT'),0);
 assert(h.commands.some(x=>x.sql.includes('INSERT INTO game3d_private_quest_acceptance_154')));
});

test('18.3 Echo acceptance checks transactional session twice and commits no rewards',async()=>{
 const h=fakeWriter();let calls=0;
 const result=await acceptEcho(h,async(db,{operation})=>{
  assert.equal(db,h.db);
  assert.equal(operation,'accept_private_echo_quest');calls++;return true;
 });
 assert.equal(result.ok,true);assert.equal(result.rewardsIssued,false);
 assert.equal(calls,2);assert.equal(called(h,'COMMIT'),1);
});
test('18.3 Echo expiry mid-transaction rolls back quest insert',async()=>{
 const h=fakeWriter();let checks=0;
 const result=await acceptEcho(h,async()=>++checks===1);
 assert.equal(result.ok,false);assert.equal(result.rewardsIssued,false);
 assert.equal(checks,2);
 assert.equal(called(h,'ROLLBACK'),1);
 assert.equal(called(h,'COMMIT'),0);
 assert(h.commands.some(x=>x.sql.includes('INSERT INTO game3d_private_echo_quest_165')));
});
test('18.3 Echo denies inactive session before any inserts',async()=>{
 const h=fakeWriter();
 const result=await acceptEcho(h,async()=>false);
 assert.equal(result.ok,false);
 assert.equal(called(h,'ROLLBACK'),1);
 assert.equal(h.commands.filter(x=>x.sql.includes('INSERT INTO')).length,0);
});
